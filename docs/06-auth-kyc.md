# 06 — Authentication & KYC

## 1. Method: Phone + OTP (MVP)
Chosen because the audience is Kenyan and M-Pesa is phone-anchored.

### 1.1 Signup / login flow
```
1. User enters phone (E.164, e.g. +2547XXXXXXXX) [+ optional referral_code]
2. POST /auth/request-otp → SMS 6-digit code (Africa's Talking/Twilio), valid 5 min
3. POST /auth/verify-otp { phone, code, referral_code? }
   - Supabase Auth verifies → issues JWT (access + refresh)
   - First time: create profiles row (role=player, status=active, kyc=basic-pending),
     create wallets row (0/0), set referred_by from referral_code, fire welcome bonus (if enabled)
4. Client stores session; reconnects WS with JWT
```
- Same flow logs in returning users (no password).
- **Sessions:** short-lived access JWT (~1h) + rotating refresh token; logout revokes refresh.
- Optional email can be added later for recovery/marketing.

## 2. Age-gate & basic KYC (MVP)
- On first session the user must submit `full_name` + `date_of_birth`.
- **Age check:** DOB must be ≥18 years before deposit/play is allowed; under-18 → blocked + flagged.
- `kyc_status='basic'` once phone verified + name + DOB present.
- Phone is inherently verified by OTP (one identity per phone).

## 3. Full KYC (post-MVP)
- ID document upload (front/back) + selfie to Supabase Storage (private bucket).
- Manual or third-party verification; `kyc_status` → `full`/`rejected`.
- Required to raise withdrawal limits / for AML thresholds.

## 4. Roles & permissions
| Role | Can do |
|------|--------|
| player | play, deposit/withdraw, chat, enroll as marketer |
| marketer | player + affiliate dashboard & payouts |
| support | view users, moderate, assist KYC, view (not edit) finances |
| finance_admin | approve withdrawals/affiliate payouts, manual adjustments, reports |
| super_admin | everything incl. game config, roles, promos, bonuses |

Role is stored on `profiles.role`; API middleware + Postgres RLS both enforce it.

## 5. Security
- OTP brute-force protection: max 5 attempts, then 1-hour lockout per phone.
- Device/session list; suspicious-login flag (new device + immediate withdrawal).
- All auth events written to `audit_log`.

## 6. Engine (WebSocket) authentication
The realtime engine independently **verifies the Supabase JWT** on the socket `auth` message and
derives the user from the token's `sub` (never trusts a client-supplied id):
- **HS256** using the Supabase project JWT secret (`SUPABASE_JWT_SECRET`), or
- **Asymmetric (RS256/ES256)** via the project JWKS (`SUPABASE_JWKS_URL`), with optional issuer/
  audience pinning.
Verification uses the vetted `jose` library; expired/tampered/missing-`sub` tokens are rejected with
`AUTH_INVALID`. The engine **fails closed**: when `DATABASE_URL` is set (production), a verifier is
required or the engine refuses to start.
