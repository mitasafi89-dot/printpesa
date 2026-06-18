# Database Migrations

Idempotent, dependency-ordered SQL migrations for the PrintPesa Supabase Postgres.

## Principles
- **Parity:** the SQL in these files is exactly what was applied to the live database.
- **Idempotent:** every migration uses `IF NOT EXISTS` / `CREATE OR REPLACE` /
  `DROP POLICY IF EXISTS`, so re-running is safe.
- **Single-command form:** each file is one statement (a `DO $$…$$` block where multiple
  DDL statements are needed) because the runtime SQL channel executes one command per call.
- **Money:** all monetary columns are `BIGINT` cents (KES). KES 50.00 = 5000.

## Order
| File | Purpose |
|------|---------|
| 0001_helpers.sql | `set_updated_at()` trigger function |
| 0002_identity_roles.sql | `profiles` (+ role/status/kyc, referral attribution) |
| 0003_wallet_ledger.sql | `wallets` (non-negative balances) + immutable `ledger_entries` |
| 0004_game.sql | `game_config` (singleton), `game_days` (fairness seeds), `positions` |
| 0005_payments.sql | `transactions` (M-Pesa deposits/withdrawals) |
| 0006_affiliate.sql | `affiliates`, `referrals`, `affiliate_commissions`, `affiliate_payouts` |
| 0007_engagement.sql | `activity_feed`, `chat_messages`, `bonuses`, `promo_codes`, `audit_log` |
| 0008_rls_policies.sql | Enable RLS + access policies on all tables |
| 0009_seed.sql | Seed `game_config` singleton with MVP parameters |
| 0010_money_rpcs.sql | Atomic `fn_open_position` / `fn_settle_position` (SECURITY DEFINER, service-role only) |

## Applying
With the Supabase/Postgres connection, apply each file in order. They are safe to re-run.

## ⚠️ Super-admin bootstrap (manual, required)
The first super-admin cannot be created via SQL alone because Supabase Auth owns `auth.users`.
Create the account by signing up with the admin phone, then promote it:

```sql
-- replace with the admin's phone (E.164)
update public.profiles set role = 'super_admin' where phone = '+2547XXXXXXXX';
```
