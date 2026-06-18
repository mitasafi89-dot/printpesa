import type { Cents } from "@printpesa/shared";

/**
 * Daraja (Safaricom M-Pesa) provider abstraction. The engine/service depend only on this
 * interface; correctness lives in the DB RPCs, not here. StubDarajaClient is deterministic
 * for tests/dev; HttpDarajaClient talks to the real API and is selected only when credentials
 * are configured. Amounts cross the boundary as integer cents and are converted to whole KES
 * (Daraja's unit) at the edge.
 */
export interface StkPushArgs { amountCents: Cents; msisdn: string; accountRef: string; desc: string; }
export interface StkPushResult { merchantRequestId: string; checkoutRequestId: string; }
export interface B2cArgs { amountCents: Cents; msisdn: string; remarks: string; }
export interface B2cResult { conversationId: string; }

export interface DarajaClient {
  stkPush(a: StkPushArgs): Promise<StkPushResult>;
  b2cPayment(a: B2cArgs): Promise<B2cResult>;
}

const centsToKes = (c: Cents): number => Math.round(c / 100);

/** Deterministic in-process stub — no network. Used in tests and local dev. */
export class StubDarajaClient implements DarajaClient {
  private n = 0;
  async stkPush(_a: StkPushArgs): Promise<StkPushResult> {
    const i = ++this.n;
    return { merchantRequestId: `stub-mr-${i}`, checkoutRequestId: `stub-co-${i}` };
  }
  async b2cPayment(_a: B2cArgs): Promise<B2cResult> {
    const i = ++this.n;
    return { conversationId: `stub-conv-${i}` };
  }
}

export interface DarajaConfig {
  env: "sandbox" | "production";
  consumerKey: string; consumerSecret: string;
  shortcode: string; passkey: string; stkCallbackUrl: string;
  b2cInitiator: string; b2cSecurityCredential: string; b2cResultUrl: string; b2cTimeoutUrl: string;
}

const BASES = { sandbox: "https://sandbox.safaricom.co.ke", production: "https://api.safaricom.co.ke" } as const;
const ts = (d = new Date()): string =>
  `${d.getFullYear()}${`${d.getMonth() + 1}`.padStart(2, "0")}${`${d.getDate()}`.padStart(2, "0")}` +
  `${`${d.getHours()}`.padStart(2, "0")}${`${d.getMinutes()}`.padStart(2, "0")}${`${d.getSeconds()}`.padStart(2, "0")}`;

/**
 * Real Daraja client. OAuth token cached ~55 min; STK Push (CustomerPayBillOnline) for deposits,
 * B2C (BusinessPayment) for withdrawals — per docs/08. Network errors propagate to the caller,
 * which leaves the transaction in its pre-call state (pending) for the reconciliation job.
 */
export class HttpDarajaClient implements DarajaClient {
  private token?: { value: string; expiresAtMs: number };
  constructor(private readonly cfg: DarajaConfig, private readonly fetchImpl: typeof fetch = fetch) {}
  private base(): string { return BASES[this.cfg.env]; }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAtMs) return this.token.value;
    const auth = Buffer.from(`${this.cfg.consumerKey}:${this.cfg.consumerSecret}`).toString("base64");
    const res = await this.fetchImpl(`${this.base()}/oauth/v1/generate?grant_type=client_credentials`, { headers: { Authorization: `Basic ${auth}` } });
    if (!res.ok) throw new Error(`DARAJA_OAUTH_${res.status}`);
    const j = (await res.json()) as { access_token: string; expires_in?: string };
    this.token = { value: j.access_token, expiresAtMs: Date.now() + 55 * 60_000 };
    return this.token.value;
  }
  private async post(path: string, body: unknown): Promise<any> {
    const token = await this.accessToken();
    const res = await this.fetchImpl(`${this.base()}${path}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`DARAJA_${path}_${res.status}:${JSON.stringify(j)}`);
    return j;
  }

  async stkPush(a: StkPushArgs): Promise<StkPushResult> {
    const t = ts();
    const password = Buffer.from(`${this.cfg.shortcode}${this.cfg.passkey}${t}`).toString("base64");
    const j = await this.post("/mpesa/stkpush/v1/processrequest", {
      BusinessShortCode: this.cfg.shortcode, Password: password, Timestamp: t,
      TransactionType: "CustomerPayBillOnline", Amount: centsToKes(a.amountCents),
      PartyA: a.msisdn, PartyB: this.cfg.shortcode, PhoneNumber: a.msisdn,
      CallBackURL: this.cfg.stkCallbackUrl, AccountReference: a.accountRef, TransactionDesc: a.desc,
    });
    return { merchantRequestId: String(j.MerchantRequestID), checkoutRequestId: String(j.CheckoutRequestID) };
  }
  async b2cPayment(a: B2cArgs): Promise<B2cResult> {
    const j = await this.post("/mpesa/b2c/v1/paymentrequest", {
      InitiatorName: this.cfg.b2cInitiator, SecurityCredential: this.cfg.b2cSecurityCredential,
      CommandID: "BusinessPayment", Amount: centsToKes(a.amountCents),
      PartyA: this.cfg.shortcode, PartyB: a.msisdn, Remarks: a.remarks,
      QueueTimeOutURL: this.cfg.b2cTimeoutUrl, ResultURL: this.cfg.b2cResultUrl, Occasion: "Withdrawal",
    });
    return { conversationId: String(j.ConversationID) };
  }
}

/** Build the real client when fully configured; otherwise the deterministic stub. */
export function makeDarajaClient(env: NodeJS.ProcessEnv = process.env): DarajaClient {
  const { MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE, MPESA_PASSKEY } = env;
  if (MPESA_CONSUMER_KEY && MPESA_CONSUMER_SECRET && MPESA_SHORTCODE && MPESA_PASSKEY) {
    const cfg: DarajaConfig = {
      env: (env.MPESA_ENV as DarajaConfig["env"]) ?? "sandbox",
      consumerKey: MPESA_CONSUMER_KEY, consumerSecret: MPESA_CONSUMER_SECRET,
      shortcode: MPESA_SHORTCODE, passkey: MPESA_PASSKEY,
      stkCallbackUrl: env.MPESA_STK_CALLBACK_URL ?? "",
      b2cInitiator: env.MPESA_B2C_INITIATOR ?? "", b2cSecurityCredential: env.MPESA_B2C_SECURITY_CREDENTIAL ?? "",
      b2cResultUrl: env.MPESA_B2C_RESULT_URL ?? "", b2cTimeoutUrl: env.MPESA_B2C_TIMEOUT_URL ?? "",
    };
    return new HttpDarajaClient(cfg);
  }
  console.warn("[payments] Daraja credentials not configured — using StubDarajaClient (no real M-Pesa calls).");
  return new StubDarajaClient();
}
