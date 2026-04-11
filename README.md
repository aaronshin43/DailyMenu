# Dickinson Dining Daily

Dickinson Dining Daily sends the Dickinson College cafeteria menu to subscribers by email each morning. Users subscribe and manage meal/station preferences through a web frontend, while a scheduled backend job fetches the menu, filters it per user, and sends emails.

## Current Architecture

- Frontend: Next.js app in [web/](/D:/03_Coding/dailymenu/web)
- Legacy frontend: Streamlit app in [app.py](/D:/03_Coding/dailymenu/app.py), kept temporarily during migration
- Backend sender: [send_menu.py](/D:/03_Coding/dailymenu/send_menu.py)
- Shared Python services: [services/](/D:/03_Coding/dailymenu/services)
- Database: Supabase
- Scheduler: GitHub Actions workflow in [.github/workflows/daily_menu.yml](/D:/03_Coding/dailymenu/.github/workflows/daily_menu.yml)

## User Flows

- Subscribe: enter email and preferences, then confirm by email link
- Manage preferences: existing active users receive a secure manage link by email
- Confirm: token-based link sets `is_active=true`
- Unsubscribe: token-based link sets `is_active=false`
- Daily send: GitHub Actions runs `send_menu.py`, fetches the menu, filters by preferences, and sends email

## Tech Split

### Next.js frontend

Location: [web/](/D:/03_Coding/dailymenu/web)

- Public pages:
  - `/`
  - `/manage?token=...`
  - `/confirm?token=...`
  - `/unsubscribe?token=...`
- Server routes:
  - `POST /api/subscribe`
  - `GET /api/preferences`
  - `POST /api/preferences`
  - `POST /api/confirm`
  - `POST /api/unsubscribe`

### Python backend

- [send_menu.py](/D:/03_Coding/dailymenu/send_menu.py): daily send job
- [services/utils.py](/D:/03_Coding/dailymenu/services/utils.py): Nutrislice fetch and filtering
- [services/email_sender.py](/D:/03_Coding/dailymenu/services/email_sender.py): SMTP sending
- [services/email_templates.py](/D:/03_Coding/dailymenu/services/email_templates.py): HTML email generation and frontend link URLs

## Prerequisites

- Python 3.10+
- Node.js 20+ and npm
- A Supabase project
- SMTP credentials for sending email

## Database Setup

Run [database/schema.sql](/D:/03_Coding/dailymenu/database/schema.sql) in Supabase SQL Editor.

This creates:

- `users`
- `keep_alive`

## Local Development

### 1. Python backend

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Create `.env` in the repo root or export these env vars:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SMTP_EMAIL`
- `SMTP_PASSWORD`
- `SMTP_SERVER`
- `SMTP_PORT`
- `SITE_URL`

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

### 2. Next.js frontend

Install frontend dependencies:

```bash
cd web
npm install
```

Create `web/.env.local` from [web/.env.example](/D:/03_Coding/dailymenu/web/.env.example):

```env
SITE_URL=http://localhost:3000
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
SMTP_EMAIL=YOUR_SMTP_EMAIL
SMTP_PASSWORD=YOUR_SMTP_PASSWORD
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
```

Run the frontend:

```bash
cd web
npm run dev
```

Production validation:

```bash
cd web
npm run lint
npm run build
```

### 3. Legacy Streamlit frontend

The old Streamlit app is still present during migration:

```bash
streamlit run app.py
```

It should be treated as legacy and removed after the Next.js cutover is complete.

## Deployment

### Vercel frontend

Deploy [web/](/D:/03_Coding/dailymenu/web) to Vercel.

Recommended setup:

- Framework: Next.js
- Root directory: `web`
- Production env vars:
  - `SITE_URL`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SMTP_EMAIL`
  - `SMTP_PASSWORD`
  - `SMTP_SERVER`
  - `SMTP_PORT`

After deployment, set `SITE_URL` to the public Vercel domain or your custom domain.

### GitHub Actions backend

The daily sender remains in GitHub Actions.

Repository secrets needed:

- `SITE_URL`
- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SMTP_EMAIL`
- `SMTP_PASSWORD`
- `SMTP_SERVER`
- `SMTP_PORT`

The `SITE_URL` secret is used by [services/email_templates.py](/D:/03_Coding/dailymenu/services/email_templates.py) so links in daily emails point to the new frontend.

## Migration Status

Implemented:

- Next.js app scaffold in `web/`
- token-based pages and API routes
- server-side Supabase access for frontend actions
- SMTP email sending from Next.js server routes
- configurable `SITE_URL` for Python email templates and GitHub Actions

Not yet migrated:

- immediate "send today's menu right after confirm" behavior from Streamlit
- full removal of Streamlit-specific code and docs
- production cutover to Vercel

## Recommended Cutover Order

1. Configure `web/.env.local` and test the Next.js app locally.
2. Deploy `web/` to Vercel.
3. Set the production `SITE_URL` in Vercel and GitHub Actions.
4. Run end-to-end tests with a real email address.
5. Switch public traffic to the Next.js frontend.
6. Remove Streamlit deployment after a safe verification window.
