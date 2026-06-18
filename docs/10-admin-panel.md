# 10 — Admin Back Office

A separate Next.js app at `admin.printpesa...`, REST-only, role-gated. Every mutating action is
written to `audit_log` (actor, before/after).

## 1. Modules
### 1.1 Dashboard
- KPIs: deposits, withdrawals, GGR, active users, online now, realised RTP vs target (75% edge),
  pending withdrawals, pending affiliate payouts.

### 1.2 User management
- Search/filter by phone, username, status, role, KYC.
- User detail: profile, wallet (real/bonus), positions history, transactions, bonuses, referrals.
- Actions: edit profile/role (super_admin), **suspend / ban / reactivate**, reset session,
  trigger KYC review.

### 1.3 Finance
- **Withdrawal queue:** approve (→ B2C) / reject (→ reverse hold). Shows KYC & risk flags.
- **Manual balance adjustment:** credit/debit with mandatory reason (finance_admin; audited).
- **Deposits monitor:** STK statuses, reconcile against M-Pesa.
- **Reports:** revenue (GGR), turnover, deposits/withdrawals, per-day, per-user, CSV export.

### 1.4 Game configuration (super_admin)
- Edit `house_edge` (default 0.75), `max_multiplier` (5.0), `min_stake` (50), `max_stake`,
  `default_duration_s` (10), `tick_rate_ms`, `drift_bias`, `volatility`.
- **RTP monitor:** realised vs target over rolling windows; alerts on drift.
- Provably-fair: view current `server_seed_hash`, force seed rotation, view revealed seeds.

### 1.5 Affiliates
- List/search marketers, edit commission rate, suspend.
- Approve/reject affiliate payout requests.

### 1.6 Engagement
- **Activity feed simulator:** configure simulated message templates, name pool, amount ranges,
  frequency (mixed with real events).
- **Chat moderation:** hide messages, mute/ban users, profanity list.

### 1.7 Bonuses & promos (super_admin)
- Create/expire promo codes (deposit-match / fixed), set wagering multiple & caps.
- Issue manual bonuses to users.

### 1.8 Audit log
- Full searchable trail of every admin action and money movement.

## 2. Access matrix
| Module | support | finance_admin | super_admin |
|--------|:---:|:---:|:---:|
| Dashboard (read) | ✓ | ✓ | ✓ |
| User mgmt view | ✓ | ✓ | ✓ |
| Suspend/ban | ✓ | ✓ | ✓ |
| Edit role/profile | — | — | ✓ |
| Withdrawal approve | — | ✓ | ✓ |
| Manual adjust | — | ✓ | ✓ |
| Game config | — | — | ✓ |
| Affiliate payouts | — | ✓ | ✓ |
| Promos/bonuses | — | — | ✓ |
| Audit log | — | view | ✓ |
