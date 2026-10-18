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

## Archive
All earlier fragmented, ad-hoc, or experimental patch migrations have been safely consolidated and archived into `supabase/migrations/archive/` to eliminate migration sprawl and conflicting RPC signatures.
