# 03 — Realtime Protocol (WebSocket)

Transport: **WSS**. Auth: client sends Supabase JWT in the connection handshake; engine verifies.
Message envelope: JSON `{ "type": string, "data": object, "ts": epoch_ms }`.

## 1. Server → Client events
| type | data | description |
|------|------|-------------|
| `hello` | `{ serverTime, gameConfig, serverSeedHash }` | sent on connect |
| `tick` | `{ t, rate, delta }` | streaming price point (5–10/sec) |
| `tick_batch` | `{ ticks: [...] }` | backfill last N ticks on connect |
| `online` | `{ count }` | live online player count |
| `position_opened` | `{ positionId, entryRate, entryT, direction, stake, duration }` | ack of an open |
| `position_update` | `{ positionId, liveMultiplier, livePnl, secondsLeft }` | per-tick P&L |
| `position_settled` | `{ positionId, exitRate, multiplier, payout, pnl, result }` | final outcome |
| `balance` | `{ real, bonus, currency }` | pushed after settle/credit |
| `activity` | `{ kind, username, amount, message }` | live activity feed item |
| `chat` | `{ username, message, ts }` | chat message |
| `error` | `{ code, message }` | validation/engine error |

## 2. Client → Server events
| type | data | description |
|------|------|-------------|
| `auth` | `{ jwt }` | authenticate the socket |
| `open_position` | `{ stake, direction, duration }` | place BUY/SELL |
| `sell` | `{ positionId }` | manual cashout before timer |
| `subscribe_chat` | `{}` | join chat stream |
| `send_chat` | `{ message }` | post chat (rate-limited, moderated) |
| `ping` | `{}` | keep-alive |

## 3. Open → settle sequence
```
client            engine
  │── open_position ─────────▶│  validate stake≥50, balance, single-open rule
  │                           │  debit stake (atomic), bind server seed
  │◀── position_opened ───────│
  │◀── tick / position_update │  (every tick until close)
  │── sell (optional) ───────▶│  or auto at duration
  │                           │  compute outcome (RTP-calibrated), credit payout
  │◀── position_settled ──────│
  │◀── balance ───────────────│
```

## 4. Reliability
- Heartbeat every 15s; disconnect → engine still auto-settles open positions at timer expiry.
- On reconnect: `hello` + `tick_batch` + any pending `position_settled` replayed.
- All money-moving events also written to Postgres; WS is a delivery channel, not the source of truth.
