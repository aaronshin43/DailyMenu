-- Install before deploying the API routes. Run as postgres; no user rows change.
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS api_limits;
REVOKE ALL ON SCHEMA api_limits FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA api_limits TO service_role;

CREATE TABLE IF NOT EXISTS api_limits.buckets (
    bucket_key text PRIMARY KEY,
    hits integer NOT NULL CHECK (hits >= 0),
    resets_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS api_limit_expiry ON api_limits.buckets (resets_at);
ALTER TABLE api_limits.buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE api_limits.buckets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE api_limits.buckets TO service_role;

-- One RPC transaction checks/reserves every rule. Stable lock order prevents
-- deadlocks; blocked requests do not consume unrelated budgets or extend waits.
CREATE OR REPLACE FUNCTION public.consume_api_limits(p_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    rule jsonb;
    bucket api_limits.buckets%ROWTYPE;
    checked_at timestamptz;
    retry_seconds integer := 0;
BEGIN
    IF jsonb_typeof(p_rules) IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Rules must be an array' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_rules) NOT BETWEEN 1 AND 4 THEN
        RAISE EXCEPTION 'Expected one to four rules' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(DISTINCT value->>'key') FROM jsonb_array_elements(p_rules))
        <> jsonb_array_length(p_rules) THEN
        RAISE EXCEPTION 'Duplicate or missing keys' USING ERRCODE = '22023';
    END IF;

    FOR rule IN SELECT value FROM jsonb_array_elements(p_rules) ORDER BY value->>'key' LOOP
        IF jsonb_typeof(rule->'key') IS DISTINCT FROM 'string'
           OR NOT (rule->>'key' ~ '^[a-z0-9:_-]{1,160}$')
           OR jsonb_typeof(rule->'limit') IS DISTINCT FROM 'number'
           OR jsonb_typeof(rule->'window_seconds') IS DISTINCT FROM 'number' THEN
            RAISE EXCEPTION 'Invalid rule' USING ERRCODE = '22023';
        END IF;
        IF (rule->>'limit')::integer NOT BETWEEN 1 AND 100000
           OR (rule->>'window_seconds')::integer NOT BETWEEN 1 AND 86400 THEN
            RAISE EXCEPTION 'Invalid rule bounds' USING ERRCODE = '22023';
        END IF;

        INSERT INTO api_limits.buckets (bucket_key, hits, resets_at)
        VALUES (rule->>'key', 0, clock_timestamp() + make_interval(secs => (rule->>'window_seconds')::integer))
        ON CONFLICT (bucket_key) DO NOTHING;
        PERFORM 1 FROM api_limits.buckets WHERE bucket_key=rule->>'key' FOR UPDATE;
    END LOOP;

    -- Use database time after acquiring locks, including time spent waiting.
    checked_at := clock_timestamp();
    FOR rule IN SELECT value FROM jsonb_array_elements(p_rules) LOOP
        SELECT * INTO STRICT bucket FROM api_limits.buckets WHERE bucket_key=rule->>'key';
        IF bucket.resets_at > checked_at AND bucket.hits >= (rule->>'limit')::integer THEN
            retry_seconds := greatest(retry_seconds, ceil(extract(epoch FROM bucket.resets_at - checked_at))::integer);
        END IF;
    END LOOP;
    IF retry_seconds > 0 THEN
        RETURN jsonb_build_object('allowed', false, 'retry_after_seconds', retry_seconds);
    END IF;

    FOR rule IN SELECT value FROM jsonb_array_elements(p_rules) LOOP
        UPDATE api_limits.buckets SET
            hits = CASE WHEN resets_at <= checked_at OR hits=0 THEN 1 ELSE hits+1 END,
            resets_at = CASE WHEN resets_at <= checked_at OR hits=0
                THEN checked_at + make_interval(secs => (rule->>'window_seconds')::integer)
                ELSE resets_at END
        WHERE bucket_key=rule->>'key';
    END LOOP;
    RETURN jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_limits(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_limits(jsonb) TO service_role;

-- Rate-limit identifiers are HMACs, never raw emails, tokens, or IP addresses.
-- Retain expired counters for at most about 25 hours; active windows are kept.
SELECT cron.schedule(
    'daily-menu-api-limit-cleanup',
    '17 * * * *',
    $job$DELETE FROM api_limits.buckets WHERE resets_at < now() - interval '1 day';$job$
);

COMMIT;
