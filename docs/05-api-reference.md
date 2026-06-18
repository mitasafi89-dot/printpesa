# 05 — REST API Reference

Base: `/api/v1`. Auth: `Authorization: Bearer <supabase_jwt>` unless marked public.
All money fields are **cents (KES)**. Standard error: `{ "error": { "code", "message" } }`.

> **Legend:** ✅ = implemented and tested in `apps/api`. Unmarked rows are the planned
> surface (see [§9 Implementation status](#9-implementation-status)). `apps/api` is a
> dependency-free Node `http` service that binds the engine services (`PaymentService`,
> `ChatService`, repositories over the migration-0010–0014 RPCs) to REST. When no JWT
> verifier is configured the service runs in **DEV auth** mode, trusting `X-User-Id` /
> `X-User-Role` headers (never for production).

## 1. Auth & profile
| Method | Path | Auth | Body / notes |
|--------|------|------|--------------|
| POST | `/auth/register` | public | ✅ `{ phone, username, password, referral_code? }` → `{ token, userId, role }` (201); atomically creates profile+wallet+credentials. Optional `referral_code` attributes the account to an affiliate (first-touch & permanent; unknown/suspended code ignored, malformed → `INVALID_REFERRAL_CODE` 400) |
| POST | `/auth/login` | public | ✅ `{ phone, password }` → `{ token, userId, role }`; generic `INVALID_CREDENTIALS`, active-status gated |
| GET  | `/auth/me` | player | ✅ `{ userId, role, username, fullName, dateOfBirth, kycStatus, ageVerified }` |
| PATCH| `/auth/me` | player | ✅ `{ full_name, date_of_birth }` → basic KYC (age-gate ≥18; DOB immutable once set) |

## 2. Wallet & history
| Method | Path | Auth | Notes |
|--------|------|------|------|
| GET | `/wallet` | player | ✅ `{ real, bonus, currency }` |
| GET | `/wallet/ledger?limit&cursor` | player | ✅ cursor-paginated ledger → `{ items, nextCursor }` (newest-first) |
| GET | `/positions?status&limit&cursor` | player | ✅ bet history (optional `status` filter) → `{ items, nextCursor }` |
| GET | `/positions/:id` | player | ✅ single owned position incl. fairness (`:id` must be a UUID; 404 if not found/owned) |

## 3. Payments (M-Pesa)
| Method | Path | Auth | Notes |
|--------|------|------|------|
| POST | `/deposits` | player | ✅ `{ amount, phone }` → STK push; returns `{ transactionId, checkoutRequestId }` (202) |
| POST | `/deposits/mpesa/callback` | public (Daraja IP-allowlisted) | ✅ STK result callback; acks `{ ResultCode: 0, ResultDesc: "Accepted" }` |
| POST | `/withdrawals` | player | ✅ `{ amount, phone }` → HOLDs funds; returns `{ transactionId, newBalance }` (202) |
| POST | `/withdrawals/mpesa/result/:txId` | public (allowlisted) | ✅ B2C result callback. **`:txId` is in the path** — `fn_approve_withdrawal` does not persist `conversation_id`, so the per-payout ResultURL carries the txId; acks like the STK callback |
| GET  | `/transactions?kind&status` | player | ✅ cursor-paginated deposit/withdrawal history → `{ items, nextCursor }` |

> **Age gate:** `/deposits` and opening a position require an age-verified adult (a stored
> `date_of_birth` ≥ 18 years). The check is enforced at the `SECURITY DEFINER` money RPCs
> (`fn_create_deposit` / `fn_open_position`, migration 0016) and is un-bypassable; unverified
> callers get `AGE_NOT_VERIFIED` (403). Complete basic KYC via `PATCH /auth/me` first.

> **Deviations from the original spec (implemented as above):** `/withdrawals` requires
> `phone` (no profile-MSISDN lookup yet), and the B2C result path is `…/result/:txId`
> rather than `…/result`. Both follow directly from the migration-0014 RPC contracts.

## 4. Game (REST companion to WS)
| Method | Path | Auth | Notes |
|--------|------|------|------|
| GET | `/health` | public | ✅ `{ status: "ok", time }` liveness probe |
| GET | `/game/config` | public | ✅ `{ currency, minStakeCents, maxStakeCents, maxMultiplier, defaultDurationS, tickRateMs, rtp, timeframesS }` |
| GET | `/game/ticks?from` | public | historical ticks for chart backfill |
| GET | `/game/fairness/:gameDayId` | public | ✅ commitment always; `serverSeed` only after rotation/reveal (leak-safe `v_fairness`) |
> Opening/selling positions happens over **WebSocket** (see [03](03-realtime-protocol.md)); a REST
> fallback `POST /game/positions` and `POST /game/positions/:id/sell` exists for resilience.

## 5. Affiliate
| Method | Path | Auth | Notes |
|--------|------|------|------|
| POST | `/affiliate/enroll` | player | ✅ become a marketer → `{ referralCode, commissionRate, status, role, referralPath }` (200); idempotent (stable code, returns the existing row on repeat) |
| GET  | `/affiliate/summary` | marketer | clicks, signups, active players, GGR, commission |
| GET  | `/affiliate/referrals?cursor` | marketer | referred users + their contribution |
| GET  | `/affiliate/commissions?period` | marketer | accrued/paid commission |
| POST | `/affiliate/payouts` | marketer | request payout of available commission |

## 6. Engagement
| Method | Path | Auth | Notes |
|--------|------|------|------|
| GET | `/activity?limit` | public | ✅ live activity feed (newest first; `limit` ≤ 100, default 30) |
| GET | `/chat` | player | ✅ recent chat (server `recentLimit`) |
| POST | `/chat` | player | ✅ `{ message }` → 201 `{ message, reasons }`; rate-limited (429), sanitized/profanity-filtered (422 on reject); handle is server-resolved |
| POST | `/promo/redeem` | player | `{ code }` |

## 7. Admin (`/admin/*`, role-gated)
| Method | Path | Min role | Notes |
|--------|------|----------|------|
| GET | `/admin/users?q&status&role` | support | search/list users |
| GET | `/admin/users/:id` | support | full profile, wallet, history |
| PATCH | `/admin/users/:id` | super_admin | edit role/status |
| POST | `/admin/users/:id/suspend` `/ban` | support | moderation |
| POST | `/admin/wallets/:id/adjust` | finance_admin | `{ amount, reason }` manual credit/debit (audited) |
| GET | `/admin/withdrawals?status` | finance_admin | queue |
| POST | `/admin/withdrawals/:id/approve` `/reject` | finance_admin | ✅ triggers B2C / reversal |
| GET | `/admin/game/config` · PUT same | super_admin | edit house_edge, max_mult, etc. |
| GET | `/admin/reports/revenue?from&to` | finance_admin | GGR, deposits, withdrawals, RTP |
| GET | `/admin/affiliates` · `/admin/affiliates/:id` | finance_admin | manage marketers |
| POST | `/admin/affiliate-payouts/:id/approve` `/reject` | finance_admin | pay commissions |
| GET/POST | `/admin/promos` | super_admin | manage promo codes |
| POST | `/admin/bonuses` | super_admin | issue manual bonus |
| GET | `/admin/activity/simulator` | super_admin | configure simulated feed |
| GET | `/admin/audit-log?actor&entity` | super_admin | audit trail |

## 8. Conventions
- Idempotency: deposits are idempotent by Daraja `CheckoutRequestID`; withdrawal results by
  transaction id (both enforced in the 0014 RPCs under `FOR UPDATE` + terminal-status guards).
  Other money-moving POSTs accept an `Idempotency-Key` header (planned).
- Pagination: cursor-based (`?cursor=&limit=`, max 100, default 30). List responses are
  `{ items, nextCursor }`, newest-first; pass `nextCursor` back as `cursor` for the next page
  (`nextCursor: null` ends the list). Cursors are opaque — do not parse them.
- Rate limits: chat 1/2s (per user, server-enforced); deposits 5/min. Register/login throttling
  is an edge concern; login is constant-time and returns a generic error (no user enumeration).
- Roles (hierarchical, higher satisfies lower): `player` < `marketer` < `support` <
  `finance_admin` < `super_admin`.
- Error codes used by the implemented surface: `AUTH_REQUIRED`/`AUTH_INVALID`/`INVALID_CREDENTIALS` (401),
  `FORBIDDEN`/`ACCOUNT_SUSPENDED`/`ACCOUNT_BANNED`/`AGE_RESTRICTED`/`AGE_NOT_VERIFIED` (403),
  `NOT_FOUND`/`USER_NOT_FOUND` (404), `METHOD_NOT_ALLOWED` (405),
  `VALIDATION`/`BAD_JSON`/`INVALID_ID`/`INVALID_LIMIT`/`BAD_CALLBACK`/`INVALID_AMOUNT`/`BELOW_MIN`/
  `INVALID_PHONE`/`INVALID_DOB`/`INVALID_REFERRAL_CODE`/`PASSWORD_*`/`USERNAME_*`/`NAME_*`/`DOB_*` (400),
  `PHONE_TAKEN`/`USERNAME_TAKEN`/`REGISTRATION_CONFLICT`/`DOB_IMMUTABLE` (409),
  `RATE_LIMITED` (429), `REJECTED` (422), `INSUFFICIENT_FUNDS` (402), `PAYLOAD_TOO_LARGE` (413),
  `INTERNAL` (500). Daraja callbacks always ack `{ ResultCode: 0, ResultDesc: "Accepted" }`.

## 9. Implementation status
`apps/api` (Node `http`, default `PORT=8081`) currently ships:
- **Public (E1):** `/health`, `/game/config`, `/game/fairness/:gameDayId`, `/activity`.
- **Auth (G):** `/auth/register`, `/auth/login` (self-managed phone+password, no OTP; scrypt +
  self-issued HS256 JWT), `/auth/me` (GET profile+KYC, PATCH basic KYC). See
  [06 — Authentication & KYC](06-auth-kyc.md).
- **Age gate (H1):** real-money deposit/play requires an age-verified adult (≥18), enforced at
  the money RPCs (`fn_create_deposit` / `fn_open_position`, migration 0016).
- **Affiliate enroll + attribution (I1):** `POST /affiliate/enroll` (idempotent marketer
  enrollment + stable referral code) and first-touch, permanent referral attribution carried
  through `POST /auth/register` via optional `referral_code`. Both invariants live in the
  migration-0017 RPCs (`fn_affiliate_enroll`, extended `fn_register_user`). See
  [09 — Affiliate System](09-affiliate-system.md).
- **Player + payments + admin (E2):** `/wallet`, `/chat` (GET/POST), `/deposits` +
  `/deposits/mpesa/callback`, `/withdrawals` + `/withdrawals/mpesa/result/:txId`,
  `/admin/withdrawals/:id/approve|reject`.
- **Player history (F):** `/wallet/ledger`, `/positions`, `/positions/:id`, `/transactions`
  (cursor-paginated, per-user isolated, backed by keyset reads over `ledger_entries` /
  `positions` ⋈ `v_fairness` / `transactions`).

Not yet implemented (no backing service, or owned elsewhere): full KYC (document upload),
`/game/ticks`, REST position open/sell, the rest of affiliate M5 (commission accrual,
marketer dashboard `/affiliate/summary|referrals|commissions`, payouts), promos/bonuses, admin
user/report/config/audit endpoints. Daraja IP allow-listing is an edge/infra concern, not
enforced in-app.
