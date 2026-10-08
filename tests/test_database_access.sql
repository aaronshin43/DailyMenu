-- Run as postgres after protect_server_tables.sql. All test writes roll back.
-- No subscriber data is read or changed; no emails or sequence increments.
BEGIN;

DO $$
DECLARE
    client_role text;
    table_name text;
    operation text;
    column_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['users', 'keep_alive'] LOOP
        IF NOT (SELECT relrowsecurity FROM pg_class
                WHERE oid = format('public.%I', table_name)::regclass) THEN
            RAISE EXCEPTION 'RLS is disabled on %', table_name;
        END IF;
        FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            FOREACH operation IN ARRAY ARRAY[
                'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
            ] LOOP
                IF has_table_privilege(client_role, format('public.%I', table_name), operation) THEN
                    RAISE EXCEPTION '% has % on %', client_role, operation, table_name;
                END IF;
            END LOOP;
            FOR column_name IN SELECT attname FROM pg_attribute
                WHERE attrelid = format('public.%I', table_name)::regclass
                  AND attnum > 0 AND NOT attisdropped
            LOOP
                FOREACH operation IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
                    IF has_column_privilege(client_role, format('public.%I', table_name), column_name, operation) THEN
                        RAISE EXCEPTION '% has % on %.%', client_role, operation, table_name, column_name;
                    END IF;
                END LOOP;
            END LOOP;
        END LOOP;
    END LOOP;
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        FOREACH operation IN ARRAY ARRAY['USAGE', 'SELECT', 'UPDATE'] LOOP
            IF has_sequence_privilege(client_role, 'public.keep_alive_id_seq', operation) THEN
                RAISE EXCEPTION '% has % on heartbeat sequence', client_role, operation;
            END IF;
        END LOOP;
    END LOOP;
END;
$$;

-- Execute real statements under each public client role, not just ACL checks.
-- A successful forbidden statement raises an exception and aborts the test.
DO $$
DECLARE
    client_role text;
    statement text;
BEGIN
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        EXECUTE format('SET LOCAL ROLE %I', client_role);
        FOREACH statement IN ARRAY ARRAY[
            'SELECT email FROM public.users WHERE false',
            'INSERT INTO public.users (email) VALUES (''db-access-denied-test@example.invalid'')',
            'UPDATE public.users SET is_active=false WHERE false',
            'DELETE FROM public.users WHERE false',
            'SELECT id FROM public.keep_alive WHERE false',
            'INSERT INTO public.keep_alive (id) VALUES (-2147483648)',
            'UPDATE public.keep_alive SET last_run=now() WHERE false',
            'DELETE FROM public.keep_alive WHERE false'
        ] LOOP
            BEGIN
                EXECUTE statement;
                RAISE EXCEPTION '% unexpectedly allowed: %', client_role, statement;
            EXCEPTION WHEN insufficient_privilege THEN
                NULL;
            END;
        END LOOP;
        RESET ROLE;
    END LOOP;
END;
$$;

SET LOCAL ROLE service_role;
DO $$
DECLARE
    test_token uuid := gen_random_uuid();
    test_email text := 'db-access-test-' || test_token::text || '@example.invalid';
    test_heartbeat_id integer := -2147483648;
    expected_preferences jsonb := '{"meals":["lunch"],"stations":[],"days_ahead":2,"watchlist":["ramen"]}';
BEGIN
    -- Do not overwrite even a pre-existing test row.
    IF EXISTS (SELECT 1 FROM public.keep_alive WHERE id=test_heartbeat_id) THEN
        RAISE EXCEPTION 'Heartbeat test ID already exists';
    END IF;

    -- Match subscribe upsert, token lookup, confirm, manage and unsubscribe.
    INSERT INTO public.users (email, token, is_active, preferences)
        VALUES (test_email, test_token, false, '{}'::jsonb)
        ON CONFLICT (email) DO UPDATE SET token=excluded.token,
            is_active=excluded.is_active, preferences=excluded.preferences;
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE email=test_email AND NOT is_active) THEN
        RAISE EXCEPTION 'Pending subscription lookup failed';
    END IF;
    UPDATE public.users SET is_active=true WHERE token=test_token;
    UPDATE public.users SET preferences=expected_preferences WHERE token=test_token;
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE token=test_token AND is_active
                   AND preferences=expected_preferences) THEN
        RAISE EXCEPTION 'Confirmed sender lookup or preference update failed';
    END IF;
    UPDATE public.users SET is_active=false WHERE token=test_token;
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE token=test_token AND NOT is_active) THEN
        RAISE EXCEPTION 'Unsubscribe failed';
    END IF;
    DELETE FROM public.users WHERE email=test_email;

    -- Match the sender's heartbeat upsert, without touching live id=1.
    INSERT INTO public.keep_alive (id, last_run) VALUES (test_heartbeat_id, now())
        ON CONFLICT (id) DO UPDATE SET last_run=excluded.last_run;
    INSERT INTO public.keep_alive (id, last_run) VALUES (test_heartbeat_id, now())
        ON CONFLICT (id) DO UPDATE SET last_run=excluded.last_run;
    IF NOT EXISTS (SELECT 1 FROM public.keep_alive WHERE id=test_heartbeat_id) THEN
        RAISE EXCEPTION 'Heartbeat upsert failed';
    END IF;
    DELETE FROM public.keep_alive WHERE id=test_heartbeat_id;
END;
$$;
RESET ROLE;

SELECT 'PASS: RLS; public roles denied; server subscribe/confirm/manage/unsubscribe and heartbeat; all writes roll back' AS result;
ROLLBACK;
