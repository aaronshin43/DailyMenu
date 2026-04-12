# AGENTS.md

This file provides guidance to Agents when working with code in this repository.

## Project Overview

Dickinson Dining Daily is an automated service that sends the daily Dickinson College cafeteria menu to subscribers by email. Users subscribe and manage preferences through a Next.js web app deployed separately from the Python daily sender.

## Commands

```bash
# Activate virtual environment (Windows)
venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Run the Next.js frontend locally
cd web
npm install
npm run dev

# Run the email-sending backend (requires env vars)
python send_menu.py

# Test for a specific date or single user
python send_menu.py --date 2026-04-11
python send_menu.py --email student@dickinson.edu

# Quick test of the Nutrislice API parsing
python services/utils.py
```

## Environment Setup

**Frontend** (`web/`): reads from `web/.env.local`:

```env
SITE_URL=http://localhost:3000
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
SMTP_EMAIL=YOUR_SMTP_EMAIL
SMTP_PASSWORD=YOUR_SMTP_PASSWORD
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
```

**Backend** (`send_menu.py`): reads from `.env` or environment variables:

- `SITE_URL`
- `SUPABASE_URL`, `SUPABASE_KEY`
- `SMTP_EMAIL`, `SMTP_PASSWORD`
- `SMTP_SERVER` (default: `smtp.gmail.com`), `SMTP_PORT` (default: `587`)

## Architecture

```text
web/
  app/                - Next.js pages and API routes
  components/         - frontend UI components
  lib/                - server-side config, Supabase, email helpers
send_menu.py          - CLI script run by GitHub Actions daily at 11:00 UTC
services/
  utils.py            - Nutrislice API fetching, menu parsing, user preference filtering
  email_sender.py     - SMTP email dispatch
  email_templates.py  - HTML daily email generation with manage/unsubscribe links
.github/workflows/daily_menu.yml - GitHub Actions cron job
```

**Data flow (daily send):** `send_menu.py` -> heartbeat to Supabase `keep_alive` -> fetch menu from Nutrislice -> query active users from Supabase `users` -> filter per-user preferences -> send HTML email via SMTP.

**Data flow (subscription/manage):** Next.js pages call Next.js API routes -> server-side Supabase updates `users` -> server-side SMTP sends confirmation/manage emails -> user follows tokenized links back to the Next.js frontend.

**Token-based auth:** Each user has a UUID token stored in Supabase. Links use `?token=<uuid>` on `/confirm`, `/manage`, and `/unsubscribe`. There is no separate login system.

## Database Schema

Supabase `users` table (defined in `database/schema.sql`):

- `email` (unique)
- `token` (UUID)
- `is_active` (bool)
- `preferences` (JSONB: `{meals: [...], stations: [...]}`)

Supabase `keep_alive` table:

- single row (`id=1`) updated each run to prevent Supabase free-tier pausing

## Key Notes

- The Nutrislice API base URL is `https://dickinson.api.nutrislice.com/menu/api/weeks/school/the-caf/menu-type/{meal}/{year}/{month}/{day}/`
- Station list in `services/utils.py` is hardcoded
- `send_menu.py --email` only sends to active users matching that email
- The GitHub Actions workflow can be triggered manually via `workflow_dispatch`
- The Vercel frontend and GitHub Actions backend should use the same `SITE_URL`
