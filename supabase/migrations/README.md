# Supabase Migrations Guide

## Current Active Migration Pipeline
The migrations in this directory are sequenced and authoritative. For any deployment or database setup, run them in numerical order:

1. `001_consolidated_ads_service.sql` — Base ads tables (`adds`, `addsactive`) and trigger synchronization.
2. `002_admin_optimizations.sql` — Admin index optimizations and reporting.
3. `003_admin_scale_and_audit.sql` — Admin audit logs and reconciliation metrics.
4. `003_atomic_earn_and_webhook_protection.sql` — Idempotency locks and webhook event idempotency.
5. `004_earn_60_percent_and_velocity_fix.sql` — Earning revenue share formulas and velocity controls.
6. `005_transfer_reversals_and_admin_security.sql` — Four-Eyes transfer reversal system and admin roles.
7. `006_forfeited_balance_resolution.sql` — Inactivity balance forfeiture and ledger recovery.
8. `007_production_security_and_ledger_hardening.sql` — Double-entry ledger (`ledger_accounts`, `ledger_entries`), row-level locks (`process_ledger_transfer`, `settle_withdrawal_atomic`), and complete lockdown of 23 `SECURITY DEFINER` functions to `service_role` only.
9. `008_feed_targeting_and_performance.sql` — Feed targeting RPC (`get_user_feed`), dynamic bidding, and audience intersection scoring.
10. `009_fix_get_user_feed_rpc.sql` — Gender and age range matching optimizations.
11. `010_fix_user_provisioning_and_casing.sql` — Case-insensitive user email normalization and provisioning.
12. `011_fix_bvn_hash_and_login.sql` — Deterministic BVN hash indexing for instant login resolution.
13. `012_ad_approval_before_payment.sql` — Require admin approval before ad campaigns can be paid and launched.
14. `013_campaign_approval_and_statement_sync.sql` — Synchronize approved campaigns to payments ledger and statement records.
15. `014_fix_atomic_withdrawal_bvn_hash.sql` — Hardened atomic withdrawal RPC with BVN integrity checks.
16. `015_enable_rls_on_exposed_tables.sql` — Zero-downtime RLS enforcement on `adds`, `bidded_ads`, and `premium_subscribers` with lock timeouts.

## Zero-Downtime Live Migration Standards

When running migrations on a live database with active users (Web, Worker, Mobile):

1. **Lock Timeouts**: Always set `SET LOCAL lock_timeout = '4s';` and `SET LOCAL statement_timeout = '30s';` inside transactions. This prevents migration queries from queuing behind long transactions and blocking live user requests.
2. **Concurrent Indexing**: Always use `CREATE INDEX CONCURRENTLY` instead of `CREATE INDEX`. Postgres will build the index without acquiring an exclusive table lock.
3. **Expand-and-Contract**: Never rename or drop columns in a single step. First add the new column (Expand), update running code to write to both, backfill in batches, and only drop the old column once all clients (including older mobile apps) have transitioned (Contract).
4. **CI/CD Automation**: Migrations are tracked in Git and automatically validated on pull request via `.github/workflows/db-migration.yml`. Configuring `SUPABASE_DB_URL` in repository secrets enables automatic deployment on merge to `main`.

## Archive
All earlier fragmented, ad-hoc, or experimental patch migrations have been safely consolidated and archived into `supabase/migrations/archive/` to eliminate migration sprawl and conflicting RPC signatures.
