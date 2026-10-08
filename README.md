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
npm test
npm run typecheck
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

### Subscription API limits

Before deploying the API routes, run `database/api_rate_limits.sql` as `postgres`
in the Supabase SQL Editor. New databases need both `database/schema.sql` and
this migration; enable `pg_cron` first (also required by the daily scheduler).
The migration is additive and safe to re-run. Install it **before** merging
the web change: unavailable rate-limit storage returns 503 and blocks user
mutations/email sends rather than letting unprotected requests through.
Rate-limit RPC requests have a five-second timeout.

Limits are shared by every Vercel instance using one atomic Supabase RPC:

| Request budget | Limit |
| --- | --- |
| Subscribe, per client IP (including invalid requests) | 30 requests / 10 minutes |
| Confirmation or manage-link email, per normalized email across all IPs | 3 attempts / hour |
| Email resend, shared by both email types | 1 attempt / 60 seconds |
| Confirm/preferences/unsubscribe, combined per client IP | 120 requests / minute |
| Preferences GET, per token | 60 requests / minute |
| Confirm/preferences POST/unsubscribe, combined per token | 20 requests / minute |

Windows start at the first admitted request. Email cooldown and hourly budgets
are reserved together before token changes or SMTP, so concurrent requests
cannot both send. Denied requests do not extend the window or consume other
email budgets. Reservations are retained if lookup/SMTP fails, since an SMTP
failure can occur after acceptance; wait before trying again. SMTP connection/
greeting/socket timeouts prevent indefinitely hanging requests. Shared campus
IPs can reach the IP budget collectively; tune the constants in
`web/lib/rate-limit.ts` if normal usage requires a higher budget.

429 responses include `Retry-After` in seconds and a wait message. Malformed
JSON/field types/preferences return 400, bodies above 16 KiB return 413, and
backend failures return generic 500/503 messages. Token responses use
`Cache-Control: no-store`; `/menu` remains public and is not rate limited here.

The private `api_limits.buckets` table has RLS and no public client grants.
Only `service_role` can call `consume_api_limits`; it is a security-invoker
function. Email/IP/token identifiers are HMACs using the existing server key;
no additional service or secret is needed. Key rotation resets the effective
budgets. The hourly `daily-menu-api-limit-cleanup` Cron removes records expired
for over one day, retaining an expired record for at most about 25 hours.

Production IP identity uses Vercel's `x-vercel-forwarded-for` only when
`VERCEL=1`. Local/self-hosted instances ignore forwarded headers and use a
shared `local` bucket; missing/invalid Vercel IPs share `unknown`. Configure a
trusted proxy adapter before using this code on a different host.
See [Vercel request headers](https://vercel.com/docs/headers/request-headers).

Run `tests/test_api_rate_limits.sql` as `postgres` to verify permissions,
exact thresholds, expiration, atomic budgets, and retry timing; all fixtures
roll back. `cd web && npm test` tests handlers/validation/failure behavior with
mock SMTP and no credentials. The `Web API checks` workflow runs these tests
and TypeScript checks on relevant PRs and main pushes, without server secrets.

Optional live concurrency check: `python tests/check_api_rate_limit_concurrency.py`.
It uses the Python server key and sends 12 simultaneous RPC requests with
reversed rule orders; exactly one reservation must succeed. It creates two
random test counters that expire normally, without subscriber writes or emails.

### Confirmation link lifecycle

Run `database/confirmation_lifecycle.sql` as `postgres` **before** deploying the
updated web API. New databases require `schema.sql`, `api_rate_limits.sql`, and
this migration. It adds two nullable columns, server-only RPCs, and a revocation
trigger; it preserves every existing subscription, preference and management token.
The old web version remains compatible during installation, and the new
confirmation behavior takes effect after the web deployment.

`users.token` remains the long-lived management/unsubscribe token used in daily
emails. Confirmation uses a separate UUID with a 24-hour database expiry.
Resending replaces only the confirmation link; resubscribing preserves existing
management links and requires a fresh confirmation. Signup cannot overwrite a
concurrent activation or the preferences of an already active user.

Confirmation locks the subscriber row and checks the expiry using the database
clock. Retries/double-clicks return success while the same confirmation is active
and unexpired, without reactivating again. Unsubscribe atomically clears the
confirmation token and expiry, including for pending users, so an old link can
never reactivate an unsubscribed user. Expired/replaced/revoked/legacy confirmation
links return 410 with a link to request a new confirmation email. Management
tokens are never accepted by the confirmation API.

Old confirmation emails used management tokens. After deployment, previously
unconfirmed users must subscribe again to receive a fresh confirmation link.
Already active users continue receiving emails; their older manage/unsubscribe
links keep working. No existing user is automatically activated or deactivated.

Run `tests/test_confirmation_lifecycle.sql` as `postgres` for token separation,
expiry, resend/retry, unsubscribe revocation, active-signup race and role-access
checks. All synthetic user writes roll back. `cd web && npm test` verifies API
responses and email token selection using mock SMTP.

Optional live check: `python tests/check_confirmation_lifecycle.py` uses the
server key to exercise eight concurrent confirmations and an unsubscribe race.
It creates one uniquely named synthetic subscriber and deletes it in `finally`;
it never sends email. To also test the web routes, start a local production
build and pass `--base-url http://127.0.0.1:3001`. This flag accepts localhost only.

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
