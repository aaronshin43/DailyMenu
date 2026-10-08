-- Run as postgres before deploying the confirmation lifecycle API.
-- Additive and re-runnable: existing users, preferences and manage tokens stay intact.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS confirmation_token uuid,
    ADD COLUMN IF NOT EXISTS confirmation_expires_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS users_confirmation_token_key
    ON public.users (confirmation_token);
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
        WHERE conrelid='public.users'::regclass AND conname='users_confirmation_pair_check') THEN
        ALTER TABLE public.users ADD CONSTRAINT users_confirmation_pair_check CHECK (
            (confirmation_token IS NULL AND confirmation_expires_at IS NULL) OR
            (confirmation_token IS NOT NULL AND confirmation_expires_at IS NOT NULL
                AND confirmation_token <> token)
        );
    END IF;
END;
$$;
COMMENT ON COLUMN public.users.token IS 'Long-lived manage/unsubscribe bearer token; never accepted for confirmation.';
COMMENT ON COLUMN public.users.confirmation_token IS 'Separate confirmation bearer token; revoked on unsubscribe or replacement.';
COMMENT ON COLUMN public.users.confirmation_expires_at IS 'Confirmation expires 24 hours after creation; database clock is authoritative.';

-- Explicit unsubscribe must revoke even a pending (already inactive) confirmation.
CREATE OR REPLACE FUNCTION public.revoke_menu_confirmation()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
    IF NEW.is_active IS NOT TRUE THEN
        NEW.confirmation_token := NULL;
        NEW.confirmation_expires_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER users_revoke_confirmation
    BEFORE UPDATE OF is_active ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.revoke_menu_confirmation();

-- The conflict row is locked by the upsert. An activation during signup cannot
-- be overwritten by a stale application-side inactive lookup. Management tokens
-- are preserved on resend/resubscribe, including links in older daily emails.
CREATE OR REPLACE FUNCTION public.prepare_menu_subscription(p_email text, p_preferences jsonb)
RETURNS SETOF public.users LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
    INSERT INTO public.users AS existing
        (email, token, is_active, preferences, confirmation_token, confirmation_expires_at)
    VALUES (p_email, gen_random_uuid(), false, p_preferences,
        gen_random_uuid(), clock_timestamp() + interval '24 hours')
    ON CONFLICT (email) DO UPDATE SET
        preferences = CASE WHEN existing.is_active IS TRUE THEN existing.preferences ELSE excluded.preferences END,
        confirmation_token = CASE WHEN existing.is_active IS TRUE THEN existing.confirmation_token ELSE excluded.confirmation_token END,
        confirmation_expires_at = CASE WHEN existing.is_active IS TRUE THEN existing.confirmation_expires_at ELSE excluded.confirmation_expires_at END
    RETURNING existing.*;
$$;

CREATE OR REPLACE FUNCTION public.confirm_menu_subscription(p_token uuid)
RETURNS SETOF public.users LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    subscriber public.users%ROWTYPE;
BEGIN
    SELECT * INTO subscriber FROM public.users
        WHERE confirmation_token=p_token FOR UPDATE;
    -- Check the database clock after waiting for any concurrent row update.
    IF NOT FOUND OR subscriber.confirmation_expires_at <= clock_timestamp() THEN
        RETURN;
    END IF;
    IF subscriber.is_active IS TRUE THEN
        -- Idempotent within the validity window for retries/double-clicks.
        -- Unsubscribe clears this token while holding the same row lock.
        RETURN NEXT subscriber;
        RETURN;
    END IF;
    UPDATE public.users SET is_active=true WHERE email=subscriber.email
        RETURNING * INTO subscriber;
    RETURN NEXT subscriber;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_menu_confirmation(),
    public.prepare_menu_subscription(text, jsonb), public.confirm_menu_subscription(uuid)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_menu_confirmation(),
    public.prepare_menu_subscription(text, jsonb), public.confirm_menu_subscription(uuid)
    TO service_role;

-- No legacy token is copied: old pending confirmation links need a fresh signup.
-- Existing active subscriptions and all management/unsubscribe links survive.
NOTIFY pgrst, 'reload schema';
COMMIT;
