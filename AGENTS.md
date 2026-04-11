# AGENTS.md

This file provides guidance to Agents when working with code in this repository.

## Project Overview

Dickinson Dining Daily — automated service that sends the daily Dickinson College cafeteria menu to subscribers via email. Users subscribe and set preferences (meal types, stations) through a Streamlit web app.

## Commands

```bash
# Activate virtual environment (Windows)
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the Streamlit frontend locally
streamlit run app.py

# Run the email-sending backend (requires env vars)
python send_menu.py

# Test for a specific date or single user
python send_menu.py --date 2026-04-11
python send_menu.py --email student@dickinson.edu

# Quick test of the Nutrislice API parsing
python services/utils.py
```

## Environment Setup

**Frontend** (`app.py`): reads from `.streamlit/secrets.toml`:
```toml
[supabase]
url = "YOUR_SUPABASE_URL"
key = "YOUR_SUPABASE_KEY"
```

**Backend** (`send_menu.py`): reads from `.env` or environment variables:
- `SUPABASE_URL`, `SUPABASE_KEY`
- `SMTP_EMAIL`, `SMTP_PASSWORD`
- `SMTP_SERVER` (default: `smtp.gmail.com`), `SMTP_PORT` (default: `587`)

## Architecture

```
app.py           — Streamlit subscription/preferences UI
send_menu.py     — CLI script run by GitHub Actions daily at 11:00 UTC (7 AM EDT)
services/
  utils.py          — Nutrislice API fetching, menu parsing, user preference filtering
  email_sender.py   — SMTP email dispatch
  email_templates.py — HTML email generation (menu digest, confirmation, manage-link)
.github/workflows/daily_menu.yml — GitHub Actions cron job
```

**Data flow (daily send):** `send_menu.py` → heartbeats Supabase `keep_alive` table → fetches menu from Nutrislice API → queries active users from Supabase `users` table → filters per-user preferences → sends HTML email via SMTP.

**Data flow (subscription):** `app.py` → user submits email → upsert to Supabase with `is_active=False` → sends confirmation email with token link → user clicks link → `?action=confirm&token=...` → sets `is_active=True` → sends today's menu immediately.

**Token-based auth:** Each user has a UUID token stored in Supabase. Manage/unsubscribe links use `?token=<uuid>&action=<confirm|unsubscribe>` query params — no separate auth system.

## Database Schema

Supabase `users` table (defined in `schema.sql`):
- `email` (unique), `token` (UUID), `is_active` (bool), `preferences` (JSONB: `{meals: [...], stations: [...]}`)

Supabase `keep_alive` table: single row (`id=1`) updated each run to prevent Supabase free-tier pausing.

## Key Notes

- The Nutrislice API base URL is `https://dickinson.api.nutrislice.com/menu/api/weeks/school/the-caf/menu-type/{meal}/{year}/{month}/{day}/`
- Station list in `services/utils.py` is hardcoded (not dynamically fetched from API)
- `send_menu.py --email` only sends to active users matching that email (respects `is_active=True`)
- The GitHub Actions workflow can be triggered manually via `workflow_dispatch`
