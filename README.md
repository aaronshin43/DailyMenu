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
- `SUPABASE_KEY`
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
- `SUPABASE_SERVICE_ROLE_KEY`
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
- `SUPABASE_KEY`
- `SMTP_EMAIL`
- `SMTP_PASSWORD`
- `SMTP_SERVER`
- `SMTP_PORT`

The Python sender uses `SITE_URL` when generating manage/unsubscribe links in daily emails.

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

Supabase dispatch validation can use the same input with `net.http_post`. Keep
`validation_only` absent or false in the daily Cron payload.

## Notes

- `services/utils.py` contains the Nutrislice fetch/parsing logic and the station list
- `send_menu.py --email` still respects `is_active=True`
- The workflow can be triggered manually with `workflow_dispatch`
