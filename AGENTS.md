# AGENTS.md

Agent-specific notes for this repository. For setup, commands, env vars, and deployment steps, use [README.md](/D:/03_Coding/dailymenu/README.md).

## Project Shape

- Frontend: Next.js app in `web/`
- Daily sender: `send_menu.py`
- Shared Python logic: `services/`
- Manual test helpers: `tests/`

## Data Model Notes

- Supabase `users.preferences` is `JSONB`
- Current preference shape:
  - `meals: string[]`
  - `stations: string[]`
  - `days_ahead: 1 | 2`
  - `watchlist: string[]`
- `days_ahead` and `watchlist` are stored inside `preferences`, not as separate columns
- `keep_alive` is still updated by `send_menu.py` on each run

## Behavior Rules

- Token-based auth only
  - `/confirm?token=...`
  - `/manage?token=...`
  - `/unsubscribe?token=...`
- There is no login/session system
- `/menu` is public and not personalized
- `watchlist` matching:
  - respects selected `meals`
  - ignores selected `stations`
  - checks all stations in the fetched menu window
- A user may subscribe with no stations selected if `watchlist` is non-empty
- Daily email sends when either of these is true:
  - digest items matched meal/station preferences
  - watchlist hits were found

## Menu / Parsing Notes

- Nutrislice fetch + parse logic lives in `services/utils.py`
- Station ordering is hardcoded in:
  - `services/utils.py`
  - `web/lib/constants.ts`
- If station ordering changes, update both places together

## Email Notes

- Daily digest HTML is generated in `services/email_templates.py`
- Next.js transactional emails live separately in `web/lib/email-templates.ts`
- Outlook is less reliable with gradients; prefer solid colors + `bgcolor` for email-safe backgrounds

## Test Helpers

- Manual watchlist hit inspection: `tests/test_watchlist_hits.py`
- Manual preview email send: `tests/send_preview_email.py`

## When Editing

- Keep README as the source of truth for setup and deployment instructions
- Keep AGENTS focused on repo-specific implementation details and behavioral constraints
