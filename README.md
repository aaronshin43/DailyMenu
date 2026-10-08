# Dickinson Dining Daily

Dickinson Dining Daily sends the Dickinson College cafeteria menu to subscribers by email each morning. Users subscribe, confirm, manage preferences, and unsubscribe through a Next.js frontend deployed on Vercel.

## Architecture

- Frontend: Next.js app in `web/`
- Backend sender: `send_menu.py`
- Shared Python services: `services/`
- Database: Supabase
- Scheduler: Supabase Cron at 07:00 `America/New_York`, calling GitHub Actions in `.github/workflows/daily_menu.yml`

## User Flows

- Subscribe at `/`
- Confirm at `/confirm?token=...`
- Manage preferences at `/manage?token=...`
- Unsubscribe at `/unsubscribe?token=...`
- Supabase triggers the daily GitHub Actions sender, which emails active users only

## Local Setup

### Python backend

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Create a root `.env` or export these variables:

- `SITE_URL`
- `SUPABASE_URL`
- `SUPABASE_KEY` — server-side `service_role` key, never the `anon`/publishable key
- `SMTP_EMAIL`
- `SMTP_PASSWORD`
- `SMTP_SERVER`
- `SMTP_PORT`

Run the sender:

```bash
python send_menu.py
```

Useful targeted runs:

```bash
python send_menu.py --date 2026-04-11
python send_menu.py --email student@dickinson.edu
python services/utils.py
python tests/test_watchlist_hits.py --watchlist "ramen"
python tests/send_preview_email.py --to student@dickinson.edu --watchlist "ramen"
```

### Next.js frontend

Install dependencies:

```bash
cd web
npm install
```

Create `web/.env.local` from `web/.env.example` and set:

- `SITE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-side `service_role` key
- `SMTP_EMAIL`
- `SMTP_PASSWORD`
- `SMTP_SERVER`
- `SMTP_PORT`

Run the frontend:

```bash
cd web
npm run dev
```

Validation commands:

```bash
cd web
npm run lint
npm run build
```

## Deployment

### Vercel

Deploy `web/` to Vercel with:

- Framework: Next.js
- Root Directory: `web`

Set these Vercel env vars:

- `SITE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_EMAIL`
- `SMTP_PASSWORD`
- `SMTP_SERVER`
- `SMTP_PORT`

Use the stable production or custom domain for `SITE_URL`.

### GitHub Actions

Set these repository secrets:

- `SITE_URL`
- `SUPABASE_URL`
- `SUPABASE_KEY` — server-side `service_role` key, never the `anon`/publishable key
- `SMTP_EMAIL`
- `SMTP_PASSWORD`
- `SMTP_SERVER`
- `SMTP_PORT`

The Python sender uses `SITE_URL` when generating manage/unsubscribe links in daily emails.

### Server-only database access

`public.users` contains private email addresses, preferences, and bearer tokens.
`public.keep_alive` is used only by the backend sender. Both tables must have
RLS enabled and no table/column/sequence privileges for `PUBLIC`, `anon`, or
`authenticated`. The application validates confirmation/manage/unsubscribe tokens
in its server routes; it does not use Supabase Auth sessions or `auth.uid()` policies.
Server-side `service_role` bypasses RLS and retains the required database access.
See [Supabase RLS and service keys](https://supabase.com/docs/guides/database/postgres/row-level-security).

For a new database, run `database/schema.sql` as `postgres`. For an existing
database, use this order to avoid breaking the daily sender:

1. Set the Python `.env` and GitHub repository secret `SUPABASE_KEY` to the
   project's **service_role** key. Verify Vercel uses the same project's server
   key in `SUPABASE_SERVICE_ROLE_KEY`. Keep these keys in server secrets only:
   never put them in `NEXT_PUBLIC_*`, source files, browser code, or logs.
2. Run `python send_menu.py --check-db-access` with the server environment.
   This performs zero-row HEAD reads only; it does not fetch subscribers,
   update the heartbeat, fetch menus, or send emails.
3. Execute `database/protect_server_tables.sql` in the Supabase SQL Editor as
   `postgres`. It changes permissions only; subscriber rows and tokens are preserved.
4. Execute `tests/test_database_access.sql` as `postgres`. It checks RLS,
   forbidden public-role operations, and server subscription/token/preference/
   unsubscribe/heartbeat operations using synthetic rows. All writes roll back.
5. Once the updated workflow is merged, trigger it with `validation_only=true`.
   It runs the offline tests plus the same database HEAD checks using actual
   GitHub secrets, without sending emails. Then check the next normal daily run.

The workflow checks database access before every delivery. A wrong/revoked key
fails the job instead of reporting an empty subscriber list as a successful send.
New tables in `public` need their own RLS and grant review; this migration
protects the two application tables and the heartbeat sequence.

### Daily schedule (Supabase Cron)

GitHub's `schedule` event does not guarantee on-time execution. In this repository,
recent scheduled runs were created several hours after the configured 11:00 UTC
time, while successful runs completed in about a minute. The workflow now uses
`workflow_dispatch` only, with Supabase Cron providing the daily trigger.
See [GitHub's scheduling limitations](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

To activate the new scheduler:

1. Create a [fine-grained GitHub token](https://github.com/settings/personal-access-tokens/new)
   restricted to `aaronshin43/DailyMenu`, with repository **Actions: Read and write**.
   Note its expiry date and renew it before it expires.
2. Enable [Supabase Vault](https://supabase.com/docs/guides/database/vault) and save
   the token through the Vault dashboard as `daily_menu_github_token`. Keep the
   token out of source files and GitHub logs.
3. Deploy the updated `.github/workflows/daily_menu.yml` to `main`, then immediately
   execute `database/daily_menu_cron.sql` in the Supabase SQL Editor as `postgres`.
   Until the SQL is installed, the updated workflow has **no automatic trigger**.
   Complete the cutover before 07:00 New York time, or after today's old run
   has finished. Clear any pending old scheduled run before activation. If
   today's menu was already sent, activate after 07:05 to avoid another send.
4. In Supabase **Integrations > Cron**, confirm `daily-menu-7am-new-york` is active.
   The SQL is safe to re-run: it updates the named job. It checks both 11:00 and
   12:00 UTC, but dispatches only when New York local time is 07:00. This handles
   both daylight saving and standard time automatically. A lock and date key
   prevent two cron invocations from dispatching the same day's job.

The dispatch includes the New York menu date so a queued runner cannot silently
switch to the next day's menu. The sender also uses the New York date for manual
runs without `--date`, logs its start/end times and duration, and reports SMTP
failures as a failed workflow. SMTP connections have a 30-second timeout.

This removes GitHub's scheduled-event delay. Runner availability, API outages,
SMTP processing, and inbox delivery can still add delay; 07:00 is the trigger
time, not a guarantee of delivery at exactly 07:00:00.

### Schedule monitoring and recovery

Inspect recent dispatches in the Supabase SQL Editor:

```sql
select d.menu_date, d.queued_at, d.request_id,
       r.status_code, r.timed_out, r.error_msg
from menu_scheduler.dispatches d
left join net._http_response r on r.id = d.request_id
order by d.menu_date desc
limit 7;
```

`200` or `204` means GitHub accepted the dispatch; it does **not** confirm email
delivery. Check the resulting GitHub Actions run and its sender summary for that.
An HTTP timeout/error or `401`/`403` needs investigation (including token expiry).
Supabase retains HTTP responses for six hours by default, so an older null
response does not prove a failure. Cron history is in `cron.job_run_details` or
the job's **History** view. See [pg_net response monitoring](https://supabase.com/docs/guides/database/extensions/pg_net#analyzing-responses).

There are no automatic retries: a timeout may occur after GitHub accepted a
request, and retrying blindly could duplicate emails. Before manually triggering
a missed delivery, check for an existing run and successful deliveries. Use the
Actions **Run workflow** button with the appropriate `menu_date`, or:

```bash
gh workflow run daily_menu.yml --ref main -f menu_date=2026-10-08
```

Do not rerun an entire partially successful batch: that resends to successful
recipients. Recover individual failed recipients with `send_menu.py --email`
and `--date` instead. Repeated manual dispatches are not deduplicated by the sender;
workflow concurrency prevents overlap only. For rollback, deactivate the named
Supabase Cron job before restoring the GitHub `schedule` trigger.

Offline sender/scheduler checks (no emails are sent):

```bash
python -m unittest discover -s tests -p "test_delivery_*.py"
```

To verify a GitHub dispatch without emailing subscribers, select
`validation_only` in **Run workflow**, or run:

```bash
gh workflow run daily_menu.yml --ref main -f validation_only=true
```

The validation workflow also checks access to Supabase using the repository's
server key; unlike the local unit tests, that check requires network access.

Supabase dispatch validation can use the same input with `net.http_post`. Keep
`validation_only` absent or false in the daily Cron payload.

## Notes

- `services/utils.py` contains the Nutrislice fetch/parsing logic and the station list
- `send_menu.py --email` still respects `is_active=True`
- The workflow can be triggered manually with `workflow_dispatch`
