-- Update category attention floor rates inside public.get_industry_attention_prices()
-- Aligned with NGN_AD_RATES:
--   politics: 900.00 (was 1500.00)
--   government: 750.00 (was 2000.00)
--   religion: 900.00 (was 1500.00)
--   business: 45.00, individual: 25.00, product_sales: 55.00

CREATE OR REPLACE FUNCTION public.get_industry_attention_prices()
RETURNS TABLE (
    industry_name text,
    floor_price numeric,
    highest_bid numeric,
    total_active_bids bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH baseline_industries(ind_name, floor_amt) AS (
        VALUES
            ('politics', 900.00::numeric),
            ('business', 45.00::numeric),
            ('government', 750.00::numeric),
            ('individual', 25.00::numeric),
            ('religion', 900.00::numeric),
            ('product_sales', 55.00::numeric)
    )
    SELECT
        b.ind_name AS industry_name,
        b.floor_amt AS floor_price,
        GREATEST(b.floor_amt, COALESCE(MAX(ba.bid_price), b.floor_amt)) AS highest_bid,
        COUNT(ba.id) FILTER (WHERE ba.is_active = true) AS total_active_bids
    FROM baseline_industries b
    LEFT JOIN public.bidded_ads ba
        ON LOWER(ba.industry) = b.ind_name AND ba.is_active = true
    GROUP BY b.ind_name, b.floor_amt
    ORDER BY b.floor_amt DESC;
END;
$$;
