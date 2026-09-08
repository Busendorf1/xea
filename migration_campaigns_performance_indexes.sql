-- ==============================================================================
-- Migration: High-Performance Composite Indexes for Campaigns & Statements
-- VERIFIED SCHEMA:
-- - Ads table is 'adds' (and view/table 'addsactive') with 'user_email'
-- - Highlights table is 'news' with 'user_email'
-- - Statements & transactions table is 'payments' with 'user_email' and 'type'
-- ==============================================================================

-- 1. Index for User's Active & Queued Ads Lookup (ordered by creation)
CREATE INDEX IF NOT EXISTS idx_adds_user_created 
ON adds (user_email, created_at DESC);

-- 2. Index for User's Ads Filtered by Status & Approval
CREATE INDEX IF NOT EXISTS idx_adds_user_status 
ON adds (user_email, is_paused, completed_at);

-- 3. Index for Admin Ads Review Queue
CREATE INDEX IF NOT EXISTS idx_adds_admin_review 
ON adds (created_at ASC) 
WHERE impression_count = 0 AND completed_at IS NULL;

-- 4. Index for User's Active & Queued Highlights Lookup (ordered by creation)
CREATE INDEX IF NOT EXISTS idx_news_user_created 
ON news (user_email, created_at DESC);

-- 5. Index for User's Highlights Filtered by Pause Status
CREATE INDEX IF NOT EXISTS idx_news_user_status 
ON news (user_email, is_paused);

-- 6. Index for User's Payments & Statements (ordered for instant paginated fetches)
CREATE INDEX IF NOT EXISTS idx_payments_user_created 
ON payments (user_email, created_at DESC);

-- 7. Index for User's Payments Filtered by Type (payments vs withdrawals)
CREATE INDEX IF NOT EXISTS idx_payments_user_type_created 
ON payments (user_email, type, created_at DESC);
