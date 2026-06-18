# 07 — Wallet & Transactions

## 1. Balances
Each user has one `wallets` row with two buckets (cents, KES):
- **real_balance** — withdrawable; funded by deposits & winnings.
- **bonus_balance** — restricted; from bonuses/promos; converts to real after wagering met.

## 2. The ledger is the source of truth
Every balance change writes an immutable `ledger_entries` row (double-entry style). The `wallets`
row is a fast cache; it must always equal the sum of ledger entries per bucket. A nightly job
reconciles `wallets` vs `Σ ledger` and alerts on mismatch.

## 3. Atomic settlement (critical)
All money operations run inside a single Postgres transaction using `SELECT … FOR UPDATE` on the
wallet row (or a Redis lock keyed by user) to prevent races/double-spend:

```sql
-- Open position (debit stake)
begin;
  select * from wallets where user_id = :uid for update;
  -- assert real_balance + bonus_balance >= stake
  update wallets set real_balance = real_balance - :stake_real,
                     bonus_balance = bonus_balance - :stake_bonus,
                     updated_at = now()
   where user_id = :uid;
  insert into ledger_entries(user_id,type,amount,balance_kind,ref_table,ref_id)
       values (:uid,'stake',-:stake,'real',  'positions',:pid);
  insert into positions(...);
commit;
```
- **Stake priority:** bonus funds are wagered before real (configurable), to satisfy wagering rules.
- **Payout** credits `real_balance` (winnings are withdrawable) and writes a `payout` ledger entry.
- **Idempotency:** settling a position is keyed by `position_id`; re-runs are no-ops.

## 4. Transaction states (deposits/withdrawals)
```
deposit:    pending → processing → success | failed
withdrawal: pending → (admin approve) → processing → success | failed | reversed
```
- Failed deposits never credit. Failed/reversed withdrawals **re-credit** real_balance (reversal entry).

## 5. Limits & responsible gaming
- Min stake 50; min deposit & withdrawal configurable (default 100 / 200).
- Per-user daily deposit limit, daily loss limit, self-exclusion (cooldown) — see Compliance doc.
- Withdrawals blocked if KYC insufficient or active wagering requirement unmet (bonus funds).
