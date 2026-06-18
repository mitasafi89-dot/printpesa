# 16 — MVP Roadmap & Acceptance Criteria

## Milestones
### M0 — Foundations
- Monorepo, CI, Supabase project, schema + RLS migrations, seed (`game_config`, super-admin).
- **Done when:** migrations apply cleanly; super-admin can log in to admin shell.

### M1 — Auth & wallet
- Phone+OTP signup/login, basic KYC (name+DOB age-gate), wallet + immutable ledger.
- **Done when:** a user signs up, has a 0/0 wallet, age-gate blocks <18.

### M2 — Payments
- M-Pesa STK deposits (sandbox) crediting real_balance; withdrawals with admin approval + B2C + reversal.
- **Done when:** deposit reflects after callback; withdrawal debits, approval pays, rejection reverses.

### M3 — Game engine
- Authoritative smooth green-biased curve over WS; open BUY/SELL; live P&L; manual + auto sell;
  ×5 cap; RTP calibrated to 75% edge; provably-fair seed commit/reveal.
- **Done when:** Monte-Carlo test shows realised RTP ≈ 25% (±tolerance); settlement is atomic/idempotent.

### M4 — Player web app
- Full screen per [Frontend Spec](13-frontend-spec.md): curve, bet panel, wallet, history, activity, chat.
- **Done when:** end-to-end play loop works against the engine.

### M5 — Affiliate
- Enroll, referral links/attribution, 20% rev-share accrual, marketer dashboard, payout requests.
- **Done when:** a referred player's net loss accrues correct commission; payout flows to admin.

### M6 — Admin back office
- User mgmt, withdrawal queue, manual adjustments, game config, reports, affiliate mgmt, bonuses,
  activity simulator, chat moderation, audit log.
- **Done when:** all access-matrix actions work and are audited.

### M7 — Hardening & compliance
- Rate limits, fraud controls, responsible-gaming limits, reconciliation jobs, monitoring,
  legal/licence review of copy & flows.
- **Done when:** security checklist + reconciliation + responsible-gaming features pass review.

## Cross-cutting acceptance criteria
- No client can alter an outcome or balance; all money paths atomic, idempotent, audited.
- Realised RTP tracked vs 25% target with alerting.
- Every admin action and money movement appears in `audit_log`.
- All player tables protected by RLS; secrets never in repo.

## Suggested team sequence
M0 → (M1 ∥ schema) → M2 ∥ M3 → M4 → M5 ∥ M6 → M7.
