-- ============================================================================
-- Migration: 20261104110000_add_wallet_pin_hash.sql
-- Purpose:
--   1. Add `wallet_pin_hash` column to `public.users` for 4-digit Wallet PIN protection.
--   2. Upgrade `public.fn_enforce_user_pii_hashing()` so:
--      - `dob` (DATE column) is handled safely via `date_trunc('year', NEW.dob)::DATE`
--        (never calling `btrim(date)`).
--      - Hashes are only recomputed on INSERT or when the specific column actually changes.
--      - Trigger only fires on `INSERT OR UPDATE OF email, phone, passphrase, wallet_pin_hash, dob`
--        so high-frequency `balance`, `monetization_clicks`, and `last_active_at` updates
--        at 100M+ user traffic incur 0ms trigger overhead.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Add wallet_pin_hash column to public.users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS wallet_pin_hash TEXT DEFAULT NULL;

-- 2. Upgrade trigger function with column-change guards and safe DATE handling
CREATE OR REPLACE FUNCTION public.fn_enforce_user_pii_hashing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Compute peppered SHA-256 email_hash only on INSERT or when email changes
  IF NEW.email IS NOT NULL AND trim(NEW.email) <> '' THEN
    IF NEW.email_hash IS NULL OR TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.email IS DISTINCT FROM OLD.email) THEN
      NEW.email_hash := encode(digest('xea-pii-v1:' || lower(trim(NEW.email)), 'sha256'), 'hex');
    END IF;
  END IF;

  -- Compute phone_hash only when raw phone is provided or changed
  IF NEW.phone IS NOT NULL AND trim(NEW.phone) <> '' AND left(NEW.phone, 11) <> 'PLACEHOLDER' THEN
    IF (TG_OP = 'INSERT' OR NEW.phone IS DISTINCT FROM OLD.phone OR NEW.phone_hash IS NULL)
       AND left(NEW.phone, 7) <> 'enc:v1:' THEN
      NEW.phone_hash := encode(digest('xea-phone-v1:' || regexp_replace(NEW.phone, '\D', '', 'g'), 'sha256'), 'hex');
    END IF;
  END IF;

  -- Irreversibly one-way hash passphrase if not already hashed/encrypted
  IF NEW.passphrase IS NOT NULL AND trim(NEW.passphrase) <> '' THEN
    IF left(NEW.passphrase, 8) <> 'hash:v1:'
       AND left(NEW.passphrase, 7) <> 'enc:v1:'
       AND left(NEW.passphrase, 7) <> 'pin:v1:' THEN
      NEW.passphrase := 'hash:v1:' || encode(digest('xea-pass-v1:' || trim(NEW.passphrase), 'sha256'), 'hex');
    END IF;
  END IF;

  -- Defense-in-depth: Irreversibly hash wallet_pin_hash if not already prefixed with pin:v1: or hash:v1:
  IF NEW.wallet_pin_hash IS NOT NULL AND trim(NEW.wallet_pin_hash) <> '' THEN
    IF left(NEW.wallet_pin_hash, 7) <> 'pin:v1:' AND left(NEW.wallet_pin_hash, 8) <> 'hash:v1:' THEN
      NEW.wallet_pin_hash := 'hash:v1:' || encode(
        digest('xea-wallet-pin-v1:' || lower(COALESCE(trim(NEW.email), '')) || ':' || trim(NEW.wallet_pin_hash), 'sha256'),
        'hex'
      );
    END IF;
  END IF;

  -- Coarsen Date of Birth (dob is a DATE column) to Birth Year only (YYYY-01-01)
  IF NEW.dob IS NOT NULL THEN
    IF TG_OP = 'INSERT' OR NEW.dob IS DISTINCT FROM OLD.dob THEN
      NEW.dob := date_trunc('year', NEW.dob)::DATE;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Scope trigger strictly to PII/PIN columns so high-frequency balance & click updates skip it (0ms overhead at 100M+ scale)
DROP TRIGGER IF EXISTS trg_enforce_user_pii_hashing ON public.users;
CREATE TRIGGER trg_enforce_user_pii_hashing
BEFORE INSERT OR UPDATE OF email, phone, passphrase, wallet_pin_hash, dob
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_user_pii_hashing();

-- 4. One-time backfill for existing rows in public.users so existing accounts also have hashed passphrases,
--    populated email_hash / phone_hash blind indexes, and birth-year-only coarsened dob.
UPDATE public.users
SET
  email_hash = CASE
    WHEN email IS NOT NULL AND trim(email) <> ''
      THEN encode(digest('xea-pii-v1:' || lower(trim(email)), 'sha256'), 'hex')
    ELSE email_hash
  END,
  phone_hash = CASE
    WHEN phone IS NOT NULL AND trim(phone) <> '' AND left(phone, 11) <> 'PLACEHOLDER' AND left(phone, 7) <> 'enc:v1:'
      THEN encode(digest('xea-phone-v1:' || regexp_replace(phone, '\D', '', 'g'), 'sha256'), 'hex')
    ELSE phone_hash
  END,
  passphrase = CASE
    WHEN passphrase IS NOT NULL AND trim(passphrase) <> ''
         AND left(passphrase, 8) <> 'hash:v1:'
         AND left(passphrase, 7) <> 'enc:v1:'
         AND left(passphrase, 7) <> 'pin:v1:'
      THEN 'hash:v1:' || encode(digest('xea-pass-v1:' || trim(passphrase), 'sha256'), 'hex')
    ELSE passphrase
  END,
  dob = CASE
    WHEN dob IS NOT NULL
      THEN date_trunc('year', dob)::DATE
    ELSE dob
  END
WHERE
  email_hash IS NULL
  OR (passphrase IS NOT NULL AND left(passphrase, 8) <> 'hash:v1:' AND left(passphrase, 7) <> 'enc:v1:' AND left(passphrase, 7) <> 'pin:v1:')
  OR (dob IS NOT NULL AND dob <> date_trunc('year', dob)::DATE);

COMMIT;
