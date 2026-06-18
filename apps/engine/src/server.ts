import { WebSocketServer, type WebSocket } from "ws";
import { DEFAULT_CONFIG, type Direction } from "@printpesa/shared";
import { InMemoryGameRepository, PgGameRepository, type GameRepository } from "./wallet.js";
import { GameServer } from "./game.js";
import { SeedManager } from "./daycontext.js";
import { RecoveryService } from "./recovery.js";
import { makeVerifier } from "./auth.js";

const PORT = Number(process.env.PORT ?? 8080);
// One long-lived master seed; per-day seeds are derived as HMAC(MASTER_SEED, dateKey).
// SERVER_SEED kept as a fallback name for dev parity.
const MASTER_SEED = process.env.MASTER_SEED ?? process.env.SERVER_SEED ?? "dev-master-seed-0001";

const cfg = DEFAULT_CONFIG;

// Persistence: Postgres in production (atomic RPCs), in-memory for local dev.
let repo: GameRepository;
const usingDb = Boolean(process.env.DATABASE_URL);
if (usingDb) {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  repo = new PgGameRepository(pool);
} else {
  repo = new InMemoryGameRepository();
}

const verifier = makeVerifier();
if (usingDb && !verifier) throw new Error("AUTH: a JWT verifier is required when DATABASE_URL is set (set SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL)");

// Daily seed lifecycle: derive + commit today's seed, expose it synchronously to the engine.
const seeds = new SeedManager(MASTER_SEED, cfg, repo);
await seeds.init();

const game = new GameServer(() => seeds.getActive(), repo, cfg);

// Crash recovery: replay any positions the DB still considers open before we accept traffic.
const recovery = new RecoveryService(repo, seeds, game);
const recovered = await recovery.recover();
console.log(`[engine] recovery: scanned=${recovered.scanned} settled=${recovered.settled} rearmed=${recovered.rearmed} noop=${recovered.noop} failed=${recovered.failed}`);

const all = new Set<WebSocket>();
const byUser = new Map<string, Set<WebSocket>>();
const userOf = new WeakMap<WebSocket, string>();

const send = (ws: WebSocket, type: string, data: unknown) => ws.readyState === ws.OPEN && ws.send(JSON.stringify({ type, data, ts: Date.now() }));
const toUser = (userId: string, type: string, data: unknown) => byUser.get(userId)?.forEach((ws) => send(ws, type, data));
const broadcast = (type: string, data: unknown) => all.forEach((ws) => send(ws, type, data));

game.subscribe({
  onTick: (t) => broadcast("tick", t),
  onUpdate: (u) => { const p = game.getPosition(u.positionId); if (p) toUser(p.userId, "position_update", u); },
  onSettled: (e) => toUser(e.position.userId, "position_settled", {
    positionId: e.position.id, result: e.position.outcome.result, lockedMultiplier: e.lockedMultiplier,
    payoutCents: e.payoutCents, pnlCents: e.pnlCents, balance: e.balance, mode: e.mode,
  }),
  onError: (err, ctx) => console.error(`[engine] ${ctx}:`, err.message),
});
game.start();

// Rotate at the UTC day boundary: derive the new day, commit its hash, reveal yesterday's seed.
const ROTATE_CHECK_MS = 60_000;
setInterval(() => {
  void (async () => {
    try {
      const before = seeds.getActive().dateKey;
      const { active, revealed } = await seeds.rotate();
      if (active.dateKey !== before) {
        broadcast("fairness", { serverSeedHash: active.seedHash, tradeDate: active.dateKey });
        console.log(`[engine] rotated to ${active.dateKey}${revealed ? ` (revealed ${revealed})` : ""}`);
      }
    } catch (err) { console.error("[engine] rotation:", (err as Error).message); }
  })();
}, ROTATE_CHECK_MS).unref();

const wss = new WebSocketServer({ port: PORT });
wss.on("connection", (ws) => {
  all.add(ws);
  send(ws, "hello", { serverTime: Date.now(), serverSeedHash: seeds.getActive().seedHash, tradeDate: seeds.getActive().dateKey, gameConfig: game.onlineConfigSnapshot() });
  broadcast("online", { count: all.size });

  ws.on("message", async (raw) => {
    let msg: any; try { msg = JSON.parse(String(raw)); } catch { return send(ws, "error", { code: "BAD_JSON" }); }
    try {
      switch (msg.type) {
        case "auth": {
          let userId: string;
          if (verifier) {
            try { userId = (await verifier(String(msg.data?.token ?? ""))).userId; }
            catch { return send(ws, "error", { code: "AUTH_INVALID" }); }
          } else {
            // dev only: no verifier configured and no DB -> trust provided userId (loud warning at boot)
            userId = String(msg.data?.userId ?? "");
            if (!userId) return send(ws, "error", { code: "AUTH_REQUIRED" });
          }
          userOf.set(ws, userId);
          (byUser.get(userId) ?? byUser.set(userId, new Set()).get(userId)!).add(ws);
          if (!usingDb && repo instanceof InMemoryGameRepository && (await repo.getBalance(userId)) === 0) repo.seed(userId, 100000);
          return send(ws, "balance", { real: await repo.getBalance(userId), currency: "KES" });
        }
        case "open_position": {
          const userId = userOf.get(ws); if (!userId) return send(ws, "error", { code: "AUTH_REQUIRED" });
          const { position: p, balance } = await game.openPosition({ userId, stakeCents: Number(msg.data.stakeCents), direction: msg.data.direction as Direction, durationS: msg.data.durationS });
          send(ws, "position_opened", { positionId: p.id, entryRate: p.outcome.entryRate, direction: p.direction, stakeCents: p.stakeCents, durationS: p.durationS, expiresAtMs: p.expiresAtMs });
          return send(ws, "balance", { real: balance, currency: "KES" });
        }
        case "sell": {
          const userId = userOf.get(ws); if (!userId) return send(ws, "error", { code: "AUTH_REQUIRED" });
          await game.sell(String(msg.data.positionId), userId); return;
        }
        case "ping": return send(ws, "pong", {});
        default: return send(ws, "error", { code: "UNKNOWN_TYPE", message: msg.type });
      }
    } catch (err: any) { send(ws, "error", { code: "ENGINE_ERROR", message: String(err?.message ?? err) }); }
  });

  ws.on("close", () => { all.delete(ws); const u = userOf.get(ws); if (u) byUser.get(u)?.delete(ws); broadcast("online", { count: all.size }); });
});

if (!verifier) console.warn("[engine] WARNING: no JWT verifier configured — DEV auth (trusts client userId). Do NOT use in production.");
console.log(`[engine] listening on ws://localhost:${PORT}  store=${usingDb ? "postgres" : "in-memory"}  auth=${verifier ? "jwt" : "dev"}  day=${seeds.getActive().dateKey}  seedHash=${seeds.getActive().seedHash.slice(0, 12)}…  edge=${(cfg.houseEdge * 100).toFixed(0)}%`);
