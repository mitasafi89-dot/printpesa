# 09 — Affiliate / Marketer System

Marketers are players who also **refer others and earn 20% revenue-share**. They can both play and earn.

## 1. Becoming a marketer
- Any player calls `POST /affiliate/enroll` → creates an `affiliates` row with a unique
  `referral_code` (and `commission_rate = 0.20`) and sets `profiles.role = 'marketer'`.
- They get a shareable link: `https://printpesa.../r/<referral_code>`.

## 2. Attribution
- A new user arriving via `/r/<code>` carries the code through signup (`POST /auth/verify-otp` with
  `referral_code`). On account creation: `profiles.referred_by = affiliate_id` and a `referrals` row
  is inserted (one referral per user, **first-touch, permanent**).

## 3. Commission model — 20% revenue-share on net loss (GGR)
- **GGR (net loss)** of a referred player over a period = `Σ stakes − Σ payouts` (only positive
  contributes; winning days don't create negative commission for the affiliate — carried/zero-floored).
- **Commission** = `GGR × 0.20`, accrued **daily** into `affiliate_commissions` (`status='accrued'`).
- Worked example: referred player stakes KES 10,000 in a day, wins back KES 2,500 →
  GGR = 7,500 → affiliate earns `7,500 × 0.20 = KES 1,500`.
- Because RTP = 25%, expected GGR ≈ 75% of stakes, so affiliates earn ≈ **15% of referred turnover**
  on average — strong incentive.

> Alternative models (CPA, deposit-%, hybrid) are supported by the schema but **revenue-share is the
> configured MVP default**. Rate is per-affiliate editable by admin.

## 4. Marketer dashboard (`/affiliate/*`)
- Summary cards: referral link, total referrals, active players (played in last 7/30d), total turnover,
  total GGR, commission accrued, commission paid, available to withdraw.
- Tables: referrals list (joined date, status, lifetime GGR), daily commission history.
- Charts: signups over time, GGR over time.
- **Payouts:** `POST /affiliate/payouts` requests payout of available (accrued, unpaid) commission;
  admin approves → paid via M-Pesa B2C to the marketer's phone, marking commissions `paid`.

## 5. Anti-fraud
- Self-referral blocked (can't refer your own phone/device).
- Commission accrues only on **real-balance** turnover (bonus-funded play excluded) to stop
  bonus-abuse farming.
- Multi-account/collusion detection flags clusters (shared device, M-Pesa number) for review.
- Reversals: if a referred deposit is charged back/reversed, related commission is `reversed`.

## 6. Admin controls
- View/search marketers, edit `commission_rate`, suspend abusive affiliates.
- Review & approve/reject affiliate payout requests; full audit trail.
