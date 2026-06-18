import { randomUUID } from "node:crypto";
import { type Cents, assertCents } from "@printpesa/shared";
import type { Querier } from "./wallet.js";

/**
 * PaymentRepository: durable, money-atomic boundary for deposits/withdrawals. Each method
 * maps 1:1 to a migration-0014 SECURITY DEFINER RPC (deposit credit; withdrawal
 * hold/approve/reject/complete-with-reversal), all idempotent. The in-memory implementation
 * mirrors the same contract for tests; both are exercised the same way by PaymentService.
 */
export interface CompleteResult { applied: boolean; status: string; newBalance: Cents; }
export interface CreateWithdrawalResult { txId: string; newBalance: Cents; }
export interface ApproveResult { approved: boolean; amountCents: Cents | null; phone: string | null; }
export interface TxRow { id: string; userId: string; kind: "deposit" | "withdrawal"; amountCents: Cents; status: string; phone: string; }

export interface PaymentRepository {
  getBalance(userId: string): Promise<Cents>;
  createDeposit(userId: string, amountCents: Cents, phone: string): Promise<string>;
  attachStk(txId: string, merchantRequestId: string, checkoutRequestId: string): Promise<boolean>;
  completeDeposit(checkoutRequestId: string, resultCode: number, resultDesc: string, receipt: string | null, raw: unknown): Promise<CompleteResult>;
  createWithdrawal(userId: string, amountCents: Cents, phone: string, minCents: Cents): Promise<CreateWithdrawalResult>;
  approveWithdrawal(txId: string, adminId: string): Promise<ApproveResult>;
  rejectWithdrawal(txId: string, adminId: string): Promise<{ reversed: boolean; newBalance: Cents }>;
  completeWithdrawal(txId: string, resultCode: number, conversationId: string | null, receipt: string | null, raw: unknown): Promise<CompleteResult>;
  getTransaction(txId: string): Promise<TxRow | null>;
}

interface MemTx { id: string; userId: string; kind: "deposit" | "withdrawal"; amount: Cents; status: string; phone: string; checkoutId?: string; }
interface MemLedger { userId: string; type: string; amount: Cents; ref: string; }

export class InMemoryPaymentRepository implements PaymentRepository {
  private balances = new Map<string, Cents>();
  private txns = new Map<string, MemTx>();
  private byCheckout = new Map<string, string>();
  readonly ledger: MemLedger[] = [];

  seed(userId: string, cents: Cents): void { this.balances.set(userId, assertCents(cents)); }
  async getBalance(userId: string): Promise<Cents> { return this.balances.get(userId) ?? 0; }

  async createDeposit(userId: string, amountCents: Cents, phone: string): Promise<string> {
    if (amountCents <= 0) throw new Error("INVALID_AMOUNT");
    if (!this.balances.has(userId)) throw new Error("WALLET_NOT_FOUND");
    const id = randomUUID();
    this.txns.set(id, { id, userId, kind: "deposit", amount: amountCents, status: "pending", phone });
    return id;
  }
  async attachStk(txId: string, _merchant: string, checkoutId: string): Promise<boolean> {
    const tx = this.txns.get(txId);
    if (!tx || tx.kind !== "deposit" || tx.status !== "pending") return false;
    tx.status = "processing"; tx.checkoutId = checkoutId; this.byCheckout.set(checkoutId, txId);
    return true;
  }
  async completeDeposit(checkoutId: string, resultCode: number, _desc: string, receipt: string | null, _raw: unknown): Promise<CompleteResult> {
    const txId = this.byCheckout.get(checkoutId);
    const tx = txId ? this.txns.get(txId) : undefined;
    if (!tx) throw new Error("TX_NOT_FOUND");
    if (tx.status === "success" || tx.status === "failed") return { applied: false, status: tx.status, newBalance: await this.getBalance(tx.userId) };
    if (resultCode === 0) {
      tx.status = "success";
      const bal = (this.balances.get(tx.userId) ?? 0) + tx.amount; this.balances.set(tx.userId, bal);
      this.ledger.push({ userId: tx.userId, type: "deposit", amount: tx.amount, ref: `transactions:${tx.id}` });
      void receipt;
      return { applied: true, status: "success", newBalance: bal };
    }
    tx.status = "failed";
    return { applied: true, status: "failed", newBalance: await this.getBalance(tx.userId) };
  }

  async createWithdrawal(userId: string, amountCents: Cents, phone: string, minCents: Cents): Promise<CreateWithdrawalResult> {
    if (amountCents <= 0) throw new Error("INVALID_AMOUNT");
    if (amountCents < minCents) throw new Error("BELOW_MIN");
    const bal = this.balances.get(userId);
    if (bal === undefined) throw new Error("WALLET_NOT_FOUND");
    if (bal < amountCents) throw new Error("INSUFFICIENT_FUNDS");
    const next = bal - amountCents; this.balances.set(userId, next);
    const id = randomUUID();
    this.txns.set(id, { id, userId, kind: "withdrawal", amount: amountCents, status: "pending", phone });
    this.ledger.push({ userId, type: "withdrawal", amount: -amountCents, ref: `transactions:${id}` });
    return { txId: id, newBalance: next };
  }
  async approveWithdrawal(txId: string, _adminId: string): Promise<ApproveResult> {
    const tx = this.txns.get(txId);
    if (!tx || tx.kind !== "withdrawal" || tx.status !== "pending") return { approved: false, amountCents: null, phone: null };
    tx.status = "processing";
    return { approved: true, amountCents: tx.amount, phone: tx.phone };
  }
  async rejectWithdrawal(txId: string, _adminId: string): Promise<{ reversed: boolean; newBalance: Cents }> {
    const tx = this.txns.get(txId);
    if (!tx || tx.kind !== "withdrawal") throw new Error("TX_NOT_FOUND");
    if (tx.status !== "pending") return { reversed: false, newBalance: await this.getBalance(tx.userId) };
    tx.status = "reversed";
    const bal = (this.balances.get(tx.userId) ?? 0) + tx.amount; this.balances.set(tx.userId, bal);
    this.ledger.push({ userId: tx.userId, type: "withdrawal_reversal", amount: tx.amount, ref: `transactions:${tx.id}` });
    return { reversed: true, newBalance: bal };
  }
  async completeWithdrawal(txId: string, resultCode: number, _conv: string | null, _receipt: string | null, _raw: unknown): Promise<CompleteResult> {
    const tx = this.txns.get(txId);
    if (!tx || tx.kind !== "withdrawal") throw new Error("TX_NOT_FOUND");
    if (["success", "failed", "reversed"].includes(tx.status)) return { applied: false, status: tx.status, newBalance: await this.getBalance(tx.userId) };
    if (resultCode === 0) { tx.status = "success"; return { applied: true, status: "success", newBalance: await this.getBalance(tx.userId) }; }
    tx.status = "failed";
    const bal = (this.balances.get(tx.userId) ?? 0) + tx.amount; this.balances.set(tx.userId, bal);
    this.ledger.push({ userId: tx.userId, type: "withdrawal_reversal", amount: tx.amount, ref: `transactions:${tx.id}` });
    return { applied: true, status: "failed", newBalance: bal };
  }
  async getTransaction(txId: string): Promise<TxRow | null> {
    const tx = this.txns.get(txId);
    return tx ? { id: tx.id, userId: tx.userId, kind: tx.kind, amountCents: tx.amount, status: tx.status, phone: tx.phone } : null;
  }
}

const toCents = (v: unknown): Cents => (typeof v === "string" ? Number(v) : (v as number));

export class PgPaymentRepository implements PaymentRepository {
  constructor(private readonly q: Querier) {}
  async getBalance(userId: string): Promise<Cents> {
    const r = await this.q.query("select real_balance from wallets where user_id = $1", [userId]);
    return r.rows.length ? toCents(r.rows[0].real_balance) : 0;
  }
  async createDeposit(userId: string, amountCents: Cents, phone: string): Promise<string> {
    const r = await this.q.query("select fn_create_deposit($1,$2,$3) as id", [userId, amountCents, phone]);
    return String(r.rows[0].id);
  }
  async attachStk(txId: string, merchantRequestId: string, checkoutRequestId: string): Promise<boolean> {
    const r = await this.q.query("select fn_attach_stk($1,$2,$3) as ok", [txId, merchantRequestId, checkoutRequestId]);
    return Boolean(r.rows[0]?.ok);
  }
  async completeDeposit(checkoutRequestId: string, resultCode: number, resultDesc: string, receipt: string | null, raw: unknown): Promise<CompleteResult> {
    const r = await this.q.query("select applied, status, new_balance from fn_complete_deposit($1,$2,$3,$4,$5)", [checkoutRequestId, resultCode, resultDesc, receipt, JSON.stringify(raw ?? {})]);
    return { applied: Boolean(r.rows[0].applied), status: String(r.rows[0].status), newBalance: toCents(r.rows[0].new_balance) };
  }
  async createWithdrawal(userId: string, amountCents: Cents, phone: string, minCents: Cents): Promise<CreateWithdrawalResult> {
    const r = await this.q.query("select tx_id, new_balance from fn_create_withdrawal($1,$2,$3,$4)", [userId, amountCents, phone, minCents]);
    return { txId: String(r.rows[0].tx_id), newBalance: toCents(r.rows[0].new_balance) };
  }
  async approveWithdrawal(txId: string, adminId: string): Promise<ApproveResult> {
    const ok = await this.q.query("select fn_approve_withdrawal($1,$2) as ok", [txId, adminId]);
    if (!ok.rows[0]?.ok) return { approved: false, amountCents: null, phone: null };
    const t = await this.q.query("select amount, phone from transactions where id = $1", [txId]);
    return { approved: true, amountCents: toCents(t.rows[0].amount), phone: String(t.rows[0].phone) };
  }
  async rejectWithdrawal(txId: string, adminId: string): Promise<{ reversed: boolean; newBalance: Cents }> {
    const r = await this.q.query("select reversed, new_balance from fn_reject_withdrawal($1,$2)", [txId, adminId]);
    return { reversed: Boolean(r.rows[0].reversed), newBalance: toCents(r.rows[0].new_balance) };
  }
  async completeWithdrawal(txId: string, resultCode: number, conversationId: string | null, receipt: string | null, raw: unknown): Promise<CompleteResult> {
    const r = await this.q.query("select applied, status, new_balance from fn_complete_withdrawal($1,$2,$3,$4,$5)", [txId, resultCode, conversationId, receipt, JSON.stringify(raw ?? {})]);
    return { applied: Boolean(r.rows[0].applied), status: String(r.rows[0].status), newBalance: toCents(r.rows[0].new_balance) };
  }
  async getTransaction(txId: string): Promise<TxRow | null> {
    const r = await this.q.query("select id, user_id, kind, amount, status, phone from transactions where id = $1", [txId]);
    if (!r.rows.length) return null;
    const x = r.rows[0];
    return { id: String(x.id), userId: String(x.user_id), kind: x.kind, amountCents: toCents(x.amount), status: String(x.status), phone: String(x.phone) };
  }
}
