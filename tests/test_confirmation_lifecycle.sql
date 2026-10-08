-- Run as postgres after confirmation_lifecycle.sql. Synthetic rows only; all writes roll back.
BEGIN;
DO $$
DECLARE
    client_role text;
    routine_name text;
BEGIN
    FOREACH routine_name IN ARRAY ARRAY[
        'public.prepare_menu_subscription(text,jsonb)',
        'public.confirm_menu_subscription(uuid)',
        'public.revoke_menu_confirmation()'
    ] LOOP
        FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF has_function_privilege(client_role, routine_name, 'EXECUTE') THEN
                RAISE EXCEPTION '% can execute %', client_role, routine_name;
            END IF;
        END LOOP;
        IF NOT has_function_privilege('service_role', routine_name, 'EXECUTE') THEN
            RAISE EXCEPTION 'Server cannot execute %', routine_name;
        END IF;
    END LOOP;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.users'::regclass) THEN
        RAISE EXCEPTION 'Users RLS disabled';
    END IF;
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        EXECUTE format('SET LOCAL ROLE %I', client_role);
        BEGIN
            PERFORM public.confirm_menu_subscription(gen_random_uuid());
            RAISE EXCEPTION 'Public confirmation unexpectedly allowed';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
        BEGIN
            PERFORM public.prepare_menu_subscription('denied@example.invalid', '{}'::jsonb);
            RAISE EXCEPTION 'Public signup unexpectedly allowed';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
        BEGIN
            PERFORM confirmation_token FROM public.users WHERE false;
            RAISE EXCEPTION 'Public confirmation column unexpectedly readable';
        EXCEPTION WHEN insufficient_privilege THEN NULL;
        END;
        RESET ROLE;
    END LOOP;
END;
$$;

SET LOCAL ROLE service_role;
DO $$
DECLARE
    test_email text := 'confirmation-test-' || gen_random_uuid()::text || '@example.invalid';
    prefs jsonb := '{"meals":["lunch"],"stations":[],"days_ahead":2,"watchlist":["ramen"]}';
    changed_prefs jsonb := '{"meals":["dinner"],"stations":[],"days_ahead":1,"watchlist":["soup"]}';
    subscriber public.users%ROWTYPE;
    checked public.users%ROWTYPE;
    manage_token uuid;
    first_confirmation uuid;
    second_confirmation uuid;
    expiration timestamptz;
    before_prepare timestamptz := clock_timestamp();
BEGIN
    SELECT * INTO subscriber FROM public.prepare_menu_subscription(test_email, prefs);
    manage_token := subscriber.token;
    first_confirmation := subscriber.confirmation_token;
    IF subscriber.is_active IS NOT FALSE OR first_confirmation IS NULL
        OR first_confirmation=manage_token OR subscriber.preferences<>prefs
        OR subscriber.confirmation_expires_at < before_prepare + interval '24 hours'
        OR subscriber.confirmation_expires_at > clock_timestamp() + interval '24 hours' THEN
        RAISE EXCEPTION 'Pending signup token separation or TTL failed';
    END IF;
    IF EXISTS (SELECT 1 FROM public.confirm_menu_subscription(manage_token)) THEN
        RAISE EXCEPTION 'Management token activated subscription';
    END IF;

    -- Resending replaces only the confirmation token and preferences.
    SELECT * INTO subscriber FROM public.prepare_menu_subscription(test_email, changed_prefs);
    second_confirmation := subscriber.confirmation_token;
    IF subscriber.token<>manage_token OR second_confirmation=first_confirmation
        OR subscriber.preferences<>changed_prefs OR subscriber.is_active IS NOT FALSE THEN
        RAISE EXCEPTION 'Resend failed to preserve management token';
    END IF;
    IF EXISTS (SELECT 1 FROM public.confirm_menu_subscription(first_confirmation)) THEN
        RAISE EXCEPTION 'Superseded confirmation still usable';
    END IF;
    SELECT * INTO checked FROM public.confirm_menu_subscription(second_confirmation);
    IF checked.is_active IS NOT TRUE OR checked.token<>manage_token THEN
        RAISE EXCEPTION 'Confirmation failed';
    END IF;
    SELECT * INTO checked FROM public.confirm_menu_subscription(second_confirmation);
    IF checked.is_active IS NOT TRUE THEN RAISE EXCEPTION 'Idempotent retry failed'; END IF;
    expiration := checked.confirmation_expires_at;
    UPDATE public.users SET confirmation_expires_at=clock_timestamp()-interval '1 second'
        WHERE email=test_email;
    IF EXISTS (SELECT 1 FROM public.confirm_menu_subscription(second_confirmation)) THEN
        RAISE EXCEPTION 'Expired active confirmation returned success';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE email=test_email AND is_active) THEN
        RAISE EXCEPTION 'Expiry deactivated an active subscription';
    END IF;
    UPDATE public.users SET confirmation_expires_at=expiration WHERE email=test_email;

    -- Simulates stale inactive app lookup followed by signup racing activation.
    SELECT * INTO subscriber FROM public.prepare_menu_subscription(test_email, prefs);
    IF subscriber.is_active IS NOT TRUE OR subscriber.token<>manage_token
        OR subscriber.confirmation_token<>second_confirmation
        OR subscriber.confirmation_expires_at<>expiration OR subscriber.preferences<>changed_prefs THEN
        RAISE EXCEPTION 'Signup downgraded active subscriber or replaced active preferences/tokens';
    END IF;

    -- Same management token keeps working for preferences and unsubscribe.
    UPDATE public.users SET preferences=prefs WHERE token=manage_token;
    UPDATE public.users SET is_active=false WHERE token=manage_token;
    IF EXISTS (SELECT 1 FROM public.confirm_menu_subscription(second_confirmation)) THEN
        RAISE EXCEPTION 'Old confirmation reactivated unsubscribed user';
    END IF;
    SELECT * INTO subscriber FROM public.users WHERE token=manage_token;
    IF subscriber.is_active IS NOT FALSE OR subscriber.confirmation_token IS NOT NULL
        OR subscriber.confirmation_expires_at IS NOT NULL OR subscriber.preferences<>prefs THEN
        RAISE EXCEPTION 'Unsubscribe did not revoke confirmation or broke management';
    END IF;

    -- Re-subscription preserves management links, but still requires fresh confirmation.
    SELECT * INTO subscriber FROM public.prepare_menu_subscription(test_email, changed_prefs);
    IF subscriber.token<>manage_token OR subscriber.confirmation_token=second_confirmation
        OR subscriber.is_active IS NOT FALSE THEN RAISE EXCEPTION 'Resubscribe failed'; END IF;
    first_confirmation := subscriber.confirmation_token;
    UPDATE public.users SET confirmation_expires_at=clock_timestamp()-interval '1 second'
        WHERE email=test_email;
    IF EXISTS (SELECT 1 FROM public.confirm_menu_subscription(first_confirmation)) THEN
        RAISE EXCEPTION 'Expired confirmation activated user';
    END IF;
    IF EXISTS (SELECT 1 FROM public.users WHERE email=test_email AND is_active) THEN
        RAISE EXCEPTION 'Expired confirmation changed active state';
    END IF;

    -- Unsubscribe while pending must revoke too, even false -> false.
    SELECT * INTO subscriber FROM public.prepare_menu_subscription(test_email, prefs);
    first_confirmation := subscriber.confirmation_token;
    UPDATE public.users SET is_active=false WHERE token=manage_token;
    IF EXISTS (SELECT 1 FROM public.confirm_menu_subscription(first_confirmation)) THEN
        RAISE EXCEPTION 'Pending unsubscribe did not revoke confirmation';
    END IF;

    -- Legacy active and inactive rows keep manage links; neither token can confirm.
    IF EXISTS (SELECT 1 FROM public.confirm_menu_subscription(manage_token)) THEN
        RAISE EXCEPTION 'Legacy inactive management token confirmed';
    END IF;
    UPDATE public.users SET is_active=true WHERE token=manage_token;
    IF EXISTS (SELECT 1 FROM public.confirm_menu_subscription(manage_token)) THEN
        RAISE EXCEPTION 'Legacy active management token confirmed';
    END IF;
    SELECT * INTO subscriber FROM public.prepare_menu_subscription(test_email, prefs);
    IF subscriber.token<>manage_token OR subscriber.is_active IS NOT TRUE
        OR subscriber.confirmation_token IS NOT NULL THEN
        RAISE EXCEPTION 'Legacy active signup changed tokens/state';
    END IF;
END;
$$;
RESET ROLE;
SELECT 'PASS: server-only RPCs; separated tokens; 24h expiry; resend; retry; unsubscribe revocation; active race; legacy management links; writes roll back' AS result;
ROLLBACK;
