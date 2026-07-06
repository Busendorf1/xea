-- MIGRATION: AD CAMPAIGN ENGAGEMENT CLICK ANALYTICS
-- Run this SQL in your Supabase Dashboard -> SQL Editor.

-- 1. Add click tracking columns to public.adds
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS clicks_phone integer DEFAULT 0;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS clicks_whatsapp integer DEFAULT 0;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS clicks_website integer DEFAULT 0;
ALTER TABLE public.adds ADD COLUMN IF NOT EXISTS clicks_email integer DEFAULT 0;

-- 2. Add click tracking columns to public.addsactive
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS clicks_phone integer DEFAULT 0;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS clicks_whatsapp integer DEFAULT 0;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS clicks_website integer DEFAULT 0;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS clicks_email integer DEFAULT 0;

-- 3. Create helper function to securely increment click counts
CREATE OR REPLACE FUNCTION public.increment_ad_click(
  p_ad_id UUID,
  p_click_type TEXT
) RETURNS VOID AS $$
BEGIN
  IF p_click_type = 'phone' THEN
    UPDATE public.adds SET clicks_phone = COALESCE(clicks_phone, 0) + 1 WHERE id = p_ad_id;
    UPDATE public.addsactive SET clicks_phone = COALESCE(clicks_phone, 0) + 1 WHERE id = p_ad_id;
  ELSIF p_click_type = 'whatsapp' THEN
    UPDATE public.adds SET clicks_whatsapp = COALESCE(clicks_whatsapp, 0) + 1 WHERE id = p_ad_id;
    UPDATE public.addsactive SET clicks_whatsapp = COALESCE(clicks_whatsapp, 0) + 1 WHERE id = p_ad_id;
  ELSIF p_click_type = 'website' THEN
    UPDATE public.adds SET clicks_website = COALESCE(clicks_website, 0) + 1 WHERE id = p_ad_id;
    UPDATE public.addsactive SET clicks_website = COALESCE(clicks_website, 0) + 1 WHERE id = p_ad_id;
  ELSIF p_click_type = 'email' THEN
    UPDATE public.adds SET clicks_email = COALESCE(clicks_email, 0) + 1 WHERE id = p_ad_id;
    UPDATE public.addsactive SET clicks_email = COALESCE(clicks_email, 0) + 1 WHERE id = p_ad_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.increment_ad_click(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_ad_click(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ad_click(UUID, TEXT) TO service_role;
