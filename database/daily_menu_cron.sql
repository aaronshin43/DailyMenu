-- Run in the Supabase SQL Editor after deploying the updated workflow to main.
-- First enable Vault and save an Actions:write token for DailyMenu in Vault as
-- daily_menu_github_token. Never put the actual token in this file.
begin;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Keep the privileged dispatcher outside the public API schemas.
create schema if not exists menu_scheduler;
revoke all on schema menu_scheduler from public, anon, authenticated;

create table if not exists menu_scheduler.dispatches (
    menu_date date primary key,
    queued_at timestamptz not null default now(),
    request_id bigint not null
);
alter table menu_scheduler.dispatches enable row level security;
revoke all on menu_scheduler.dispatches from public, anon, authenticated;

create or replace function menu_scheduler.dispatch_daily_menu()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
    local_now timestamp := now() at time zone 'America/New_York';
    github_token text;
    http_request_id bigint;
begin
    -- pg_cron uses UTC. Of the 11:00/12:00 UTC runs, only one is 07:00
    -- in New York; this handles daylight saving time without seasonal edits.
    if local_now::time < time '07:00' or local_now::time >= time '07:05' then
        return null;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(7043112);
    if exists (
        select 1 from menu_scheduler.dispatches where menu_date = local_now::date
    ) then
        return null;
    end if;

    select decrypted_secret into github_token
    from vault.decrypted_secrets where name = 'daily_menu_github_token';
    if github_token is null or github_token = '' then
        raise exception 'Create the daily_menu_github_token secret in Supabase Vault first';
    end if;

    http_request_id := net.http_post(
        url := 'https://api.github.com/repos/aaronshin43/DailyMenu/actions/workflows/daily_menu.yml/dispatches',
        headers := pg_catalog.jsonb_build_object(
            'Accept', 'application/vnd.github+json',
            'Authorization', 'Bearer ' || github_token,
            'Content-Type', 'application/json',
            'X-GitHub-Api-Version', '2022-11-28',
            'User-Agent', 'DailyMenu-Supabase-Cron'
        ),
        body := pg_catalog.jsonb_build_object(
            'ref', 'main',
            'inputs', pg_catalog.jsonb_build_object('menu_date', local_now::date::text)
        ),
        timeout_milliseconds := 10000
    );

    -- This records an enqueued HTTP request, NOT confirmed email delivery.
    -- The response is available in net._http_response after commit.
    insert into menu_scheduler.dispatches(menu_date, request_id)
    values (local_now::date, http_request_id);
    return http_request_id;
end;
$$;

revoke all on function menu_scheduler.dispatch_daily_menu() from public, anon, authenticated;

-- Fail setup before creating a job if Vault has not been configured.
do $$
begin
    if not exists (
        select 1 from vault.decrypted_secrets
        where name = 'daily_menu_github_token' and decrypted_secret <> ''
    ) then
        raise exception 'Create the daily_menu_github_token secret in Supabase Vault first';
    end if;
end;
$$;

-- Re-running setup updates the named job rather than creating another job.
select cron.schedule(
    'daily-menu-7am-new-york',
    '0 11,12 * * *',
    'select menu_scheduler.dispatch_daily_menu();'
);

commit;
