# Dickinson Dining Daily

Dickinson Dining Daily sends the Dickinson College cafeteria menu to subscribers by email each morning. Users subscribe, confirm, manage preferences, and unsubscribe through a Next.js frontend deployed on Vercel.

## Architecture

- Frontend: Next.js app in `web/`
- Backend sender: `send_menu.py`
- Shared Python services: `services/`
- Database: Supabase
- Scheduler: GitHub Actions in `.github/workflows/daily_menu.yml`

## User Flows

- Subscribe at `/`
- Confirm at `/confirm?token=...`
- Manage preferences at `/manage?token=...`
- Unsubscribe at `/unsubscribe?token=...`
- Daily send runs from GitHub Actions and emails active users only

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

## Notes

- `services/utils.py` contains the Nutrislice fetch/parsing logic and the station list
- `send_menu.py --email` still respects `is_active=True`
- The workflow can be triggered manually with `workflow_dispatch`
