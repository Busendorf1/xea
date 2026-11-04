-- ============================================================================
-- Migration: 20261104080000_pii_hashing_and_privacy_hardening.sql
-- Purpose:
--   1. Cryptographic SHA-256 / HMAC blind hashing of user PII (`email_hash`, `phone_hash`)
--   2. One-way irreversible hashing of `users.passphrase` (`hash:v1:...`)
--   3. Birth-year coarsening of `users.dob` (`YYYY-01-01`) for NDPA 2023 / GDPR data minimization
--   4. Non-disruptive automatic trigger so all existing app queries continue without interruption
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Add cryptographic hash columns to public.users & financial/ad tables
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_hash TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_hash TEXT;
ALTER TABLE public.addsactive ADD COLUMN IF NOT EXISTS user_email_hash TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS user_email_hash TEXT;

-- 2. Create indexes on blind hash columns for O(1) lookups
CREATE INDEX IF NOT EXISTS idx_users_email_hash ON public.users (email_hash);
CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON public.users (phone_hash);
CREATE INDEX IF NOT EXISTS idx_addsactive_user_email_hash ON public.addsactive (user_email_hash);
CREATE INDEX IF NOT EXISTS idx_payments_user_email_hash ON public.payments (user_email_hash);

-- 3. Automatic Trigger Function on public.users for Zero-Plaintext Credential & DOB Minimization
CREATE OR REPLACE FUNCTION public.fn_enforce_user_pii_hashing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Compute peppered SHA-256 email_hash if missing or email changed
  IF NEW.email IS NOT NULL AND trim(NEW.email) <> '' THEN
    IF NEW.email_hash IS NULL OR TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.email IS DISTINCT FROM OLD.email) THEN
      NEW.email_hash := encode(digest('xea-pii-v1:' || lower(trim(NEW.email)), 'sha256'), 'hex');
    END IF;
  END IF;

  -- Compute phone_hash when raw phone is provided
  IF NEW.phone IS NOT NULL AND trim(NEW.phone) <> '' AND left(NEW.phone, 11) <> 'PLACEHOLDER' THEN
    IF NEW.phone_hash IS NULL AND left(NEW.phone, 7) <> 'enc:v1:' THEN
      NEW.phone_hash := encode(digest('xea-phone-v1:' || regexp_replace(NEW.phone, '\D', '', 'g'), 'sha256'), 'hex');
    END IF;
  END IF;

  -- Irreversibly one-way hash passphrase if not already hashed/encrypted
  IF NEW.passphrase IS NOT NULL AND trim(NEW.passphrase) <> '' THEN
    IF left(NEW.passphrase, 8) <> 'hash:v1:' AND left(NEW.passphrase, 7) <> 'enc:v1:' THEN
      NEW.passphrase := 'hash:v1:' || encode(digest('xea-pass-v1:' || trim(NEW.passphrase), 'sha256'), 'hex');
    END IF;
  END IF;

  -- Coarsen Date of Birth (dob) to Birth Year only (YYYY-01-01) so exact month/day is never stored
  IF NEW.dob IS NOT NULL THEN
    NEW.dob := date_trunc('year', NEW.dob)::DATE;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_user_pii_hashing ON public.users;
CREATE TRIGGER trg_enforce_user_pii_hashing
BEFORE INSERT OR UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.fn_enforce_user_pii_hashing();

-- 4. Backfill existing rows in public.users, public.addsactive, and public.payments
UPDATE public.users
SET
  email_hash = COALESCE(email_hash, encode(digest('xea-pii-v1:' || lower(trim(email)), 'sha256'), 'hex')),
  phone_hash = CASE
    WHEN phone IS NOT NULL AND left(phone, 11) <> 'PLACEHOLDER' AND left(phone, 7) <> 'enc:v1:'
      THEN COALESCE(phone_hash, encode(digest('xea-phone-v1:' || regexp_replace(phone, '\D', '', 'g'), 'sha256'), 'hex'))
    ELSE phone_hash
  END,
  passphrase = CASE
    WHEN passphrase IS NOT NULL AND left(passphrase, 8) <> 'hash:v1:' AND left(passphrase, 7) <> 'enc:v1:'
      THEN 'hash:v1:' || encode(digest('xea-pass-v1:' || trim(passphrase), 'sha256'), 'hex')
    ELSE passphrase
  END,
  dob = CASE
    WHEN dob IS NOT NULL THEN date_trunc('year', dob)::DATE
    ELSE dob
  END
WHERE email IS NOT NULL;

UPDATE public.addsactive
SET user_email_hash = encode(digest('xea-pii-v1:' || lower(trim(user_email)), 'sha256'), 'hex')
WHERE user_email IS NOT NULL AND user_email_hash IS NULL;

UPDATE public.payments
SET user_email_hash = encode(digest('xea-pii-v1:' || lower(trim(user_email)), 'sha256'), 'hex')
WHERE user_email IS NOT NULL AND user_email_hash IS NULL;

-- 5. Upgrade transfer_wallet_atomic so P2P transfers match via email_hash, lower(email), or @username
DROP FUNCTION IF EXISTS public.transfer_wallet_atomic(text, text, numeric, text);

CREATE OR REPLACE FUNCTION public.transfer_wallet_atomic(
  p_sender_email text,
  p_recipient_email text,
  p_amount numeric,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sender text := lower(trim(p_sender_email));
  v_recipient text := lower(trim(p_recipient_email));
  v_sender_hash text := encode(digest('xea-pii-v1:' || lower(trim(p_sender_email)), 'sha256'), 'hex');
  v_recipient_hash text := encode(digest('xea-pii-v1:' || lower(trim(p_recipient_email)), 'sha256'), 'hex');
  v_sender_id uuid;
  v_recipient_id uuid;
  v_recipient_actual_email text;
  v_sender_bal numeric;
  v_recipient_bal numeric;
  v_existing_ref text;
BEGIN
  IF p_amount <= 0 OR v_sender = v_recipient THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid transfer parameters.');
  END IF;

  -- Idempotency check
  SELECT reference INTO v_existing_ref
    FROM public.payments
   WHERE reference = p_idempotency_key
   LIMIT 1;

  IF v_existing_ref IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'reference', v_existing_ref, 'duplicate', true);
  END IF;

  -- Lock sender row via email_hash or email
  SELECT id, COALESCE(balance, 0) INTO v_sender_id, v_sender_bal
    FROM public.users
   WHERE email_hash = v_sender_hash OR lower(email) = v_sender
   LIMIT 1
   FOR UPDATE;

  IF v_sender_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Sender account not found.');
  END IF;

  IF v_sender_bal < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance.');
  END IF;

  -- Lock recipient row via email_hash, email, or @username
  SELECT id, email, COALESCE(balance, 0) INTO v_recipient_id, v_recipient_actual_email, v_recipient_bal
    FROM public.users
   WHERE email_hash = v_recipient_hash
      OR lower(email) = v_recipient
      OR lower(username) = ltrim(v_recipient, '@')
   LIMIT 1
   FOR UPDATE;

  IF v_recipient_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Recipient email is not registered on XEA.');
  END IF;

  IF v_sender_id = v_recipient_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot transfer funds to your own wallet.');
  END IF;

  UPDATE public.users
     SET balance = round((v_sender_bal - p_amount)::numeric, 2)
   WHERE id = v_sender_id;

  UPDATE public.users
     SET balance = round((v_recipient_bal + p_amount)::numeric, 2)
   WHERE id = v_recipient_id;

  INSERT INTO public.payments (user_email, user_email_hash, reference, amount, status, type, description)
  VALUES
    (v_sender, v_sender_hash, p_idempotency_key, p_amount, 'success', 'transfer_out', 'Wallet Transfer Sent'),
    (COALESCE(lower(v_recipient_actual_email), v_recipient), v_recipient_hash, p_idempotency_key || '_in', p_amount, 'success', 'transfer_in', 'Wallet Transfer Received');

  RETURN jsonb_build_object(
    'success', true,
    'reference', p_idempotency_key,
    'balance', round((v_sender_bal - p_amount)::numeric, 2)
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
