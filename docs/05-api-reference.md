# 05 — REST API Reference

Base: `/api/v1`. Auth: `Authorization: Bearer <supabase_jwt>` unless marked public.
All money fields are **cents (KES)**. Standard error: `{ "error": { "code", "message" } }`.

## 1. Auth & profile
| Method | Path | Auth | Body / notes |
|--------|------|------|--------------|
| POST | `/auth/request-otp` | public | `{ phone }` → sends SMS OTP |
| POST | `/auth/verify-otp` | public | `{ phone, code, referral_code? }` → session + creates profile/wallet |
| POST | `/auth/refresh` | public | `{ refresh_token }` |
| POST | `/auth/logout` | player | invalidates session |
| GET  | `/me` | player | profile + wallet + kyc_status |
| PATCH| `/me` | player | `{ full_name, date_of_birth }` (basic KYC, age-gate ≥18) |

## 2. Wallet & history
| Method | Path | Auth | Notes |
|--------|------|------|------|
| GET | `/wallet` | player | `{ real, bonus, currency }` |
| GET | `/wallet/ledger?limit&cursor` | player | paginated ledger entries |
| GET | `/positions?status&limit&cursor` | player | bet history |
| GET | `/positions/:id` | player | single position incl. fairness data |

## 3. Payments (M-Pesa)
| Method | Path | Auth | Notes |
|--------|------|------|------|
| POST | `/deposits` | player | `{ amount, phone }` → triggers STK push; returns `transactionId` |
| POST | `/deposits/mpesa/callback` | public (Daraja IP-allowlisted) | STK result callback |
| POST | `/withdrawals` | player | `{ amount }` → creates pending withdrawal (KYC + balance checks) |
| POST | `/withdrawals/mpesa/result` | public (allowlisted) | B2C result callback |
| GET  | `/transactions?kind&status` | player | deposit/withdrawal history |

## 4. Game (REST companion to WS)
| Method | Path | Auth | Notes |
|--------|------|------|------|
| GET | `/game/config` | public | min stake, max mult, duration, timeframes |
| GET | `/game/ticks?from` | public | historical ticks for chart backfill |
| GET | `/game/fairness/:gameDayId` | public | seed hash + revealed seed (after rotation) |
> Opening/selling positions happens over **WebSocket** (see [03](03-realtime-protocol.md)); a REST
> fallback `POST /game/positions` and `POST /game/positions/:id/sell` exists for resilience.

## 5. Affiliate
| Method | Path | Auth | Notes |
|--------|------|------|------|
| POST | `/affiliate/enroll` | player | become a marketer → returns referral_code |
| GET  | `/affiliate/summary` | marketer | clicks, signups, active players, GGR, commission |
| GET  | `/affiliate/referrals?cursor` | marketer | referred users + their contribution |
| GET  | `/affiliate/commissions?period` | marketer | accrued/paid commission |
| POST | `/affiliate/payouts` | marketer | request payout of available commission |

## 6. Engagement
| Method | Path | Auth | Notes |
|--------|------|------|------|
| GET | `/activity?limit` | public | live activity feed |
| GET | `/chat?limit` | player | recent chat |
| POST | `/chat` | player | post message (rate-limited, profanity-filtered) |
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
| POST | `/admin/withdrawals/:id/approve` `/reject` | finance_admin | triggers B2C / reversal |
| GET | `/admin/game/config` · PUT same | super_admin | edit house_edge, max_mult, etc. |
| GET | `/admin/reports/revenue?from&to` | finance_admin | GGR, deposits, withdrawals, RTP |
| GET | `/admin/affiliates` · `/admin/affiliates/:id` | finance_admin | manage marketers |
| POST | `/admin/affiliate-payouts/:id/approve` `/reject` | finance_admin | pay commissions |
| GET/POST | `/admin/promos` | super_admin | manage promo codes |
| POST | `/admin/bonuses` | super_admin | issue manual bonus |
| GET | `/admin/activity/simulator` | super_admin | configure simulated feed |
| GET | `/admin/audit-log?actor&entity` | super_admin | audit trail |

## 8. Conventions
- Idempotency: money-moving POSTs accept `Idempotency-Key` header.
- Pagination: cursor-based (`?cursor=&limit=`), max 100.
- Rate limits: OTP 1/30s & 5/hr/phone; chat 1/2s; deposits 5/min.
