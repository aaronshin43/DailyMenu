-- Run as postgres after database/api_rate_limits.sql. All fixtures roll back.
BEGIN;
DO $$
DECLARE
    client_role text;
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='api_limits.buckets'::regclass) THEN
        RAISE EXCEPTION 'Rate-limit table must have RLS';
    END IF;
    FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_schema_privilege(client_role, 'api_limits', 'USAGE')
           OR has_table_privilege(client_role, 'api_limits.buckets', 'SELECT,INSERT,UPDATE,DELETE')
           OR has_function_privilege(client_role, 'public.consume_api_limits(jsonb)', 'EXECUTE') THEN
            RAISE EXCEPTION 'Public client role can access rate-limit storage/RPC';
        END IF;
        EXECUTE format('SET LOCAL ROLE %I', client_role);
        BEGIN
            PERFORM public.consume_api_limits('[{"key":"forbidden","limit":1,"window_seconds":60}]');
            RAISE EXCEPTION 'Public role unexpectedly called RPC';
        EXCEPTION WHEN insufficient_privilege THEN
            NULL;
        END;
        RESET ROLE;
    END LOOP;
END;
$$;

SET LOCAL ROLE service_role;
DO $$
DECLARE
    prefix text := 'test-' || gen_random_uuid()::text;
    key_one text := prefix || '-one';
    key_hour text := prefix || '-hour';
    key_cooldown text := prefix || '-cooldown';
    one_rule jsonb := jsonb_build_array(jsonb_build_object('key',key_one,'limit',2,'window_seconds',60));
    email_rules jsonb := jsonb_build_array(
        jsonb_build_object('key',key_hour,'limit',3,'window_seconds',3600),
        jsonb_build_object('key',key_cooldown,'limit',1,'window_seconds',60)
    );
    decision jsonb;
    old_expiry timestamptz;
    bad_rules jsonb;
BEGIN
    FOR i IN 1..2 LOOP
        decision := public.consume_api_limits(one_rule);
        IF decision <> '{"allowed":true,"retry_after_seconds":0}'::jsonb THEN
            RAISE EXCEPTION 'Request below limit denied';
        END IF;
    END LOOP;
    SELECT resets_at INTO old_expiry FROM api_limits.buckets WHERE bucket_key=key_one;
    decision := public.consume_api_limits(one_rule);
    IF (decision->>'allowed')::boolean OR (decision->>'retry_after_seconds')::integer NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION 'Limit exceeded without correct retry';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM api_limits.buckets WHERE bucket_key=key_one AND hits=2 AND resets_at=old_expiry) THEN
        RAISE EXCEPTION 'Blocked attempt changed counter/expiry';
    END IF;
    UPDATE api_limits.buckets SET resets_at=now()-interval '1 second' WHERE bucket_key=key_one;
    decision := public.consume_api_limits(one_rule);
    IF NOT (decision->>'allowed')::boolean OR NOT EXISTS (
        SELECT 1 FROM api_limits.buckets WHERE bucket_key=key_one AND hits=1 AND resets_at>now()
    ) THEN
        RAISE EXCEPTION 'Expired window did not reset';
    END IF;

    decision := public.consume_api_limits(email_rules);
    IF NOT (decision->>'allowed')::boolean THEN RAISE EXCEPTION 'First email denied'; END IF;
    decision := public.consume_api_limits(email_rules);
    IF (decision->>'allowed')::boolean THEN RAISE EXCEPTION 'Cooldown did not block'; END IF;
    IF NOT EXISTS (SELECT 1 FROM api_limits.buckets WHERE bucket_key=key_hour AND hits=1) THEN
        RAISE EXCEPTION 'Cooldown denial consumed hourly budget';
    END IF;
    FOR i IN 1..2 LOOP
        UPDATE api_limits.buckets SET resets_at=now()-interval '1 second' WHERE bucket_key=key_cooldown;
        decision := public.consume_api_limits(email_rules);
        IF NOT (decision->>'allowed')::boolean THEN RAISE EXCEPTION 'Cooldown expiration did not allow retry'; END IF;
    END LOOP;
    UPDATE api_limits.buckets SET resets_at=now()-interval '1 second' WHERE bucket_key=key_cooldown;
    SELECT resets_at INTO old_expiry FROM api_limits.buckets WHERE bucket_key=key_cooldown;
    decision := public.consume_api_limits(email_rules);
    IF (decision->>'allowed')::boolean OR (decision->>'retry_after_seconds')::integer NOT BETWEEN 1 AND 3600 THEN
        RAISE EXCEPTION 'Hourly email limit did not block';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM api_limits.buckets WHERE bucket_key=key_cooldown AND resets_at=old_expiry) THEN
        RAISE EXCEPTION 'Hourly denial reset cooldown';
    END IF;

    FOREACH bad_rules IN ARRAY ARRAY[
        'null'::jsonb, '{}'::jsonb, '[]'::jsonb,
        '[{"key":"bad","limit":0,"window_seconds":60}]'::jsonb,
        '[{"key":"bad","limit":1,"window_seconds":0}]'::jsonb,
        '[{"key":"bad","limit":1,"window_seconds":60},{"key":"bad","limit":1,"window_seconds":60}]'::jsonb
    ] LOOP
        BEGIN
            PERFORM public.consume_api_limits(bad_rules);
            RAISE EXCEPTION 'Invalid rules accepted';
        EXCEPTION WHEN invalid_parameter_value THEN
            NULL;
        END;
    END LOOP;
END;
$$;
RESET ROLE;
SELECT 'PASS: public access denied; exact limits; expiry; atomic email cooldown/hour budgets; retry timing; invalid rules' AS result;
ROLLBACK;
