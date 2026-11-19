-- ==============================================================================
-- MIGRATION: 20261119140000_admin_security_and_query_fixes.sql
-- Purpose:
--   1. Fix approve_admin_request balance_adjustment camelCase/snake_case bug
--      (newBalance vs new_balance), add validation/locking/ledger/notification,
--      and reject unknown action_type instead of silently marking EXECUTED.
--   2. Fix get_admin_requests_summary to count EXECUTED alongside APPROVED.
--   3. Fix get_master_statement_metrics to exclude internal P2P transfers,
--      reversals, and admin adjustments from platform inflows.
--   4. Fix get_admin_overview_stats to exclude completed ads, resolved reports,
--      and closed help tickets from active/open counters.
--   5. Add get_agents_referral_aggregates(TEXT[]) RPC to replace 1,000-row
--      truncated PostgREST referrals fetch in admin Agents Directory.
--   6. Add get_admin_payouts_summary() RPC for exact queued payout sums.
--   7. Add adjust_user_balance_atomic(UUID, NUMERIC, NUMERIC) RPC to prevent
--      lost-update wallet overwrites during concurrent earnings/withdrawals.
--   8. Lock down EXECUTE on all admin RPCs to service_role ONLY.
--
-- Idempotent: Safe to run multiple times.
-- ==============================================================================

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- ------------------------------------------------------------------------------
-- 1. Atomic Admin Balance Adjustment RPC (FOR UPDATE row lock, delta-safe)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_user_balance_atomic(
    p_user_id UUID,
    p_delta NUMERIC DEFAULT NULL,
    p_new_balance NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user RECORD;
    v_prev_balance NUMERIC(15,2);
    v_next_balance NUMERIC(15,2);
    v_applied_delta NUMERIC(15,2);
BEGIN
    IF p_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target user ID is required');
    END IF;

    SELECT id, email, balance
    INTO v_user
    FROM public.users
    WHERE id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Target user not found');
    END IF;

    v_prev_balance := ROUND(COALESCE(v_user.balance, 0.00)::NUMERIC, 2);

    IF p_delta IS NOT NULL THEN
        v_next_balance := GREATEST(0.00, ROUND(v_prev_balance + p_delta, 2));
    ELSIF p_new_balance IS NOT NULL THEN
        IF p_new_balance < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Balance cannot be negative');
        END IF;
        v_next_balance := ROUND(p_new_balance, 2);
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Either delta or new_balance must be provided');
    END IF;

    v_applied_delta := ROUND(v_next_balance - v_prev_balance, 2);

    UPDATE public.users
    SET balance = v_next_balance
    WHERE id = v_user.id;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', v_user.id,
        'email', LOWER(TRIM(COALESCE(v_user.email, ''))),
        'previous_balance', v_prev_balance,
        'new_balance', v_next_balance,
        'delta', v_applied_delta
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Fix get_admin_requests_summary() to count APPROVED + EXECUTED
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_requests_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_res JSONB;
BEGIN
    SELECT jsonb_build_object(
        'pending_count', COALESCE(COUNT(*) FILTER (WHERE status = 'PENDING'), 0),
        'approved_count', COALESCE(COUNT(*) FILTER (WHERE status IN ('APPROVED', 'EXECUTED')), 0),
        'rejected_count', COALESCE(COUNT(*) FILTER (WHERE status = 'REJECTED'), 0),
        'total_count', COUNT(*)
    ) INTO v_res
    FROM public.pending_admin_requests;

    RETURN v_res;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Fix approve_admin_request(TEXT, UUID)
--    - Supports both payload->>'new_balance' and payload->>'newBalance' (plus delta)
--    - Validates non-null, non-negative balance & user existence with FOR UPDATE
--    - Writes statement payment & user notification
--    - Rejects unknown action_type instead of silently marking EXECUTED
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_admin_request(
    p_approving_admin_email TEXT,
    p_request_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_clean TEXT;
    v_req RECORD;
    v_exec_res JSONB;
    v_target_user RECORD;
    v_raw_new_bal TEXT;
    v_raw_delta TEXT;
    v_prev_bal NUMERIC(15,2);
    v_new_bal NUMERIC(15,2);
    v_delta NUMERIC(15,2);
    v_target_email TEXT;
    v_affected_emails TEXT[] := ARRAY[]::TEXT[];
BEGIN
    v_admin_clean := LOWER(TRIM(COALESCE(p_approving_admin_email, '')));

    IF v_admin_clean = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Approving admin email is required');
    END IF;

    SELECT * INTO v_req
    FROM public.pending_admin_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Pending admin request not found');
    END IF;

    IF v_req.status <> 'PENDING' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Request is already ' || v_req.status);
    END IF;

    -- Four-Eyes Rule: Approving admin CANNOT be the requesting admin
    IF LOWER(TRIM(v_req.requested_by)) = v_admin_clean THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Dual authorization violation: You cannot approve your own administrative request'
        );
    END IF;

    IF v_req.action_type = 'transfer_reversal' THEN
        v_exec_res := public.reverse_user_transfer(
            v_admin_clean,
            v_req.target_identifier,
            'Dual-Approved [Req by ' || v_req.requested_by || ']: ' || COALESCE(v_req.reason, '')
        );

        IF COALESCE((v_exec_res->>'success')::BOOLEAN, FALSE) = FALSE THEN
            RETURN v_exec_res;
        END IF;

        IF NULLIF(TRIM(COALESCE(v_exec_res->>'sender_email', '')), '') IS NOT NULL THEN
            v_affected_emails := array_append(v_affected_emails, LOWER(TRIM(v_exec_res->>'sender_email')));
        END IF;
        IF NULLIF(TRIM(COALESCE(v_exec_res->>'recipient_email', '')), '') IS NOT NULL THEN
            v_affected_emails := array_append(v_affected_emails, LOWER(TRIM(v_exec_res->>'recipient_email')));
        END IF;

    ELSIF v_req.action_type = 'balance_adjustment' THEN
        v_raw_delta := NULLIF(TRIM(COALESCE(v_req.payload->>'delta', '')), '');
        v_raw_new_bal := COALESCE(
            NULLIF(TRIM(COALESCE(v_req.payload->>'new_balance', '')), ''),
            NULLIF(TRIM(COALESCE(v_req.payload->>'newBalance', '')), '')
        );

        IF v_raw_delta IS NULL AND v_raw_new_bal IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Invalid balance adjustment payload: missing new_balance/newBalance or delta'
            );
        END IF;

        -- Lock target user row by userId (if present) or target_identifier email
        IF NULLIF(TRIM(COALESCE(v_req.payload->>'userId', '')), '') IS NOT NULL
           AND (v_req.payload->>'userId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
            SELECT id, email, balance
            INTO v_target_user
            FROM public.users
            WHERE id = (v_req.payload->>'userId')::UUID
            FOR UPDATE;
        END IF;

        IF v_target_user.id IS NULL THEN
            SELECT id, email, balance
            INTO v_target_user
            FROM public.users
            WHERE LOWER(email) = LOWER(TRIM(COALESCE(v_req.payload->>'userEmail', v_req.target_identifier)))
            FOR UPDATE;
        END IF;

        IF v_target_user.id IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Target user account not found for balance adjustment'
            );
        END IF;

        v_prev_bal := ROUND(COALESCE(v_target_user.balance, 0.00)::NUMERIC, 2);

        IF v_raw_delta IS NOT NULL THEN
            v_new_bal := GREATEST(0.00, ROUND(v_prev_bal + v_raw_delta::NUMERIC, 2));
        ELSE
            v_new_bal := ROUND(v_raw_new_bal::NUMERIC, 2);
            IF v_new_bal < 0 THEN
                RETURN jsonb_build_object('success', false, 'error', 'Adjusted balance cannot be negative');
            END IF;
        END IF;

        v_delta := ROUND(v_new_bal - v_prev_bal, 2);
        v_target_email := LOWER(TRIM(v_target_user.email));
        v_affected_emails := array_append(v_affected_emails, v_target_email);

        UPDATE public.users
        SET balance = v_new_bal
        WHERE id = v_target_user.id;

        INSERT INTO public.payments (user_email, reference, amount, status, type, description, metadata)
        VALUES (
            v_target_email,
            'admin_dual_adj_' || SUBSTRING(p_request_id::TEXT, 1, 8) || '_' || EXTRACT(EPOCH FROM NOW())::BIGINT,
            ABS(v_delta),
            'success',
            'admin_adjustment',
            'Dual-Approved Admin Balance Adjustment (' || v_prev_bal || ' -> ' || v_new_bal || '): ' || COALESCE(v_req.reason, ''),
            jsonb_build_object(
                'request_id', p_request_id,
                'requested_by', v_req.requested_by,
                'approved_by', v_admin_clean,
                'previous_balance', v_prev_bal,
                'new_balance', v_new_bal,
                'delta', v_delta,
                'reason', v_req.reason
            )
        );

        INSERT INTO public.notifications (user_email, title, message)
        VALUES (
            v_target_email,
            'Wallet Balance Updated',
            'Your wallet balance has been updated by administrative adjustment to ₦' || TO_CHAR(v_new_bal, 'FM999,999,990.00') || '.'
        );

        INSERT INTO public.admin_audit_logs (
            admin_email,
            action,
            target_id,
            target_type,
            reason,
            previous_state,
            new_state
        ) VALUES (
            v_admin_clean,
            'dual_approved_balance_adjustment',
            v_target_user.id::TEXT,
            'user_balance',
            'Dual-Approved [Req by ' || v_req.requested_by || ']: ' || COALESCE(v_req.reason, ''),
            jsonb_build_object('email', v_target_email, 'balance', v_prev_bal),
            jsonb_build_object('email', v_target_email, 'balance', v_new_bal, 'delta', v_delta, 'request_id', p_request_id)
        );
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Unsupported administrative action type: ' || COALESCE(v_req.action_type, 'NULL')
        );
    END IF;

    UPDATE public.pending_admin_requests
    SET status = 'EXECUTED',
        approved_by = v_admin_clean,
        updated_at = NOW()
    WHERE id = p_request_id;

    RETURN jsonb_build_object(
        'success', true,
        'action_type', v_req.action_type,
        'affected_emails', to_jsonb(v_affected_emails),
        'message', 'Administrative action approved and successfully executed'
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. Fix get_master_statement_metrics()
--    Exclude internal P2P transfers, reversals, and admin adjustments from inflows
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_master_statement_metrics()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inflows NUMERIC := 0;
    v_outflows NUMERIC := 0;
    v_success_count BIGINT := 0;
BEGIN
    SELECT
        COALESCE(SUM(CASE
            WHEN LOWER(COALESCE(type, '')) NOT IN (
                'withdrawal',
                'transfer_sent',
                'transfer_received',
                'transfer_reversal_debit',
                'transfer_reversal_credit',
                'admin_adjustment'
            ) THEN COALESCE(amount, 0)
            ELSE 0
        END), 0),
        COALESCE(SUM(CASE
            WHEN LOWER(COALESCE(type, '')) = 'withdrawal' THEN COALESCE(amount, 0)
            ELSE 0
        END), 0),
        COUNT(*)
    INTO v_inflows, v_outflows, v_success_count
    FROM public.payments
    WHERE status = 'success';

    RETURN jsonb_build_object(
        'totalInflows', ROUND(v_inflows, 2),
        'totalOutflows', ROUND(v_outflows, 2),
        'netPlatformFlow', ROUND(v_inflows - v_outflows, 2),
        'totalSuccessfulCount', v_success_count
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Fix get_admin_overview_stats()
--    Exclude completed ads from active count, exclude resolved/dismissed reports,
--    and exclude closed help tickets from open counts
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_overview_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_total_users BIGINT;
    v_total_balance NUMERIC;
    v_total_withdrawal NUMERIC;
    v_total_mutuals BIGINT;
    v_monetized_users BIGINT;
    v_suspended_users BIGINT;
    v_pending_ads BIGINT;
    v_active_ads BIGINT;
    v_pending_highlights BIGINT;
    v_active_highlights BIGINT;
    v_paused_ads BIGINT;
    v_reported_count BIGINT;
    v_help_tickets_count BIGINT;
    v_active_impressions BIGINT;
    v_active_mutuals BIGINT;
    v_target_impressions BIGINT;
    v_total_clicks BIGINT;
    v_click_rate NUMERIC;
BEGIN
    SELECT
        COUNT(*),
        COALESCE(SUM(COALESCE(balance, 0)), 0),
        COALESCE(SUM(COALESCE(withdrawal, 0)), 0),
        COALESCE(SUM(COALESCE(mutual_count, 0)), 0),
        COALESCE(COUNT(*) FILTER (WHERE LOWER(monetized::TEXT) IN ('yes', 'true', '1', 't')), 0),
        COALESCE(COUNT(*) FILTER (WHERE suspended_until IS NOT NULL AND suspended_until > NOW()), 0)
    INTO
        v_total_users,
        v_total_balance,
        v_total_withdrawal,
        v_total_mutuals,
        v_monetized_users,
        v_suspended_users
    FROM public.users;

    SELECT COUNT(*) INTO v_pending_ads FROM public.adds WHERE completed_at IS NULL;
    SELECT COUNT(*) INTO v_active_ads FROM public.addsactive WHERE completed_at IS NULL;
    SELECT COUNT(*) INTO v_pending_highlights FROM public.news;
    SELECT COUNT(*) INTO v_active_highlights FROM public.newsactive;
    SELECT COUNT(*) INTO v_reported_count FROM public.ad_reports WHERE COALESCE(status, 'pending') = 'pending';
    SELECT COUNT(*) INTO v_help_tickets_count FROM public.help_tickets WHERE COALESCE(LOWER(status), 'open') <> 'closed';

    SELECT
        (COALESCE((SELECT COUNT(*) FROM public.adds WHERE is_paused = TRUE AND completed_at IS NULL), 0) +
         COALESCE((SELECT COUNT(*) FROM public.addsactive WHERE is_paused = TRUE AND completed_at IS NULL), 0))
    INTO v_paused_ads;

    SELECT
        COALESCE(SUM(COALESCE(impression_count, 0)), 0),
        COALESCE(SUM(COALESCE(mutual_adds_count, 0)), 0),
        COALESCE(SUM(COALESCE(impressions, 0)), 0)
    INTO
        v_active_impressions,
        v_active_mutuals,
        v_target_impressions
    FROM public.addsactive
    WHERE completed_at IS NULL;

    v_total_clicks := v_active_impressions + v_active_mutuals;
    IF v_target_impressions > 0 THEN
        v_click_rate := ROUND((v_total_clicks::NUMERIC / v_target_impressions::NUMERIC) * 100, 2);
    ELSE
        v_click_rate := 0;
    END IF;

    SELECT jsonb_build_object(
        'totalUsers', v_total_users,
        'totalBalance', v_total_balance,
        'totalWithdrawal', v_total_withdrawal,
        'totalMutuals', v_total_mutuals,
        'monetizedUsers', v_monetized_users,
        'suspendedUsers', v_suspended_users,
        'pendingAdsCount', v_pending_ads,
        'activeAdsCount', v_active_ads,
        'pendingHighlightsCount', v_pending_highlights,
        'activeHighlightsCount', v_active_highlights,
        'pausedAdsCount', v_paused_ads,
        'reportedCount', v_reported_count,
        'helpTicketsCount', v_help_tickets_count,
        'totalClicks', v_total_clicks,
        'clickRate', v_click_rate,
        'timestamp', NOW()
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. Single-pass Agent Referrals Aggregation RPC (replaces 1,000-row truncated query)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_agents_referral_aggregates(p_emails TEXT[])
RETURNS TABLE (
    referrer_email TEXT,
    followers_count BIGINT,
    total_earned NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_emails IS NULL OR array_length(p_emails, 1) IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH target_emails AS (
        SELECT DISTINCT LOWER(TRIM(e)) AS email_norm
        FROM unnest(p_emails) AS e
        WHERE e IS NOT NULL AND TRIM(e) <> ''
    )
    SELECT
        te.email_norm AS referrer_email,
        COALESCE(COUNT(r.id) FILTER (WHERE COALESCE(r.status, 'active') <> 'opted_out'), 0)::BIGINT AS followers_count,
        COALESCE(SUM(COALESCE(r.total_commission_earned, 0)), 0)::NUMERIC AS total_earned
    FROM target_emails te
    LEFT JOIN public.referrals r
        ON LOWER(TRIM(r.referrer_email)) = te.email_norm
    GROUP BY te.email_norm;
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. Single-pass Admin Payouts Summary RPC (replaces 500-row JS sum cap)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_payouts_summary()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_res JSONB;
BEGIN
    SELECT jsonb_build_object(
        'queuedCount', COALESCE(COUNT(*) FILTER (WHERE status = 'queued'), 0),
        'failedCount', COALESCE(COUNT(*) FILTER (WHERE status = 'failed'), 0),
        'pendingCount', COALESCE(COUNT(*) FILTER (WHERE status = 'pending'), 0),
        'processingCount', COALESCE(COUNT(*) FILTER (WHERE status = 'processing'), 0),
        'totalQueuedAmount', COALESCE(ROUND(SUM(COALESCE(amount, 0)) FILTER (WHERE status = 'queued')::NUMERIC, 2), 0)
    ) INTO v_res
    FROM public.payments
    WHERE type = 'withdrawal';

    RETURN v_res;
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. Lock Down EXECUTE Permissions to service_role ONLY
-- ------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.adjust_user_balance_atomic(UUID, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_user_balance_atomic(UUID, NUMERIC, NUMERIC) TO service_role;

REVOKE ALL ON FUNCTION public.get_admin_requests_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_requests_summary() TO service_role;

REVOKE ALL ON FUNCTION public.approve_admin_request(TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_admin_request(TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.get_master_statement_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_master_statement_metrics() TO service_role;

REVOKE ALL ON FUNCTION public.get_admin_overview_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_overview_stats() TO service_role;

REVOKE ALL ON FUNCTION public.get_agents_referral_aggregates(TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_agents_referral_aggregates(TEXT[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_admin_payouts_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_payouts_summary() TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
