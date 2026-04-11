# Next.js Frontend Migration Plan

## Goal

Replace the current Streamlit frontend with a web app that can stay available on a free hosting platform such as Vercel, while keeping the existing Python daily email sender and GitHub Actions schedule working during the migration.

## Recommended Target Architecture

- Frontend: Next.js App Router deployed to Vercel
- Database: Supabase stays in place
- Daily sender: keep `send_menu.py` running from `.github/workflows/daily_menu.yml`
- Email delivery: keep current SMTP-based sending initially
- Menu parsing: keep current Python implementation initially
- Auth model: keep the current token-based flow, but move all privileged actions behind server-side Next.js routes

## Why This Migration Shape

- It removes the Streamlit hosting dependency without forcing a full-stack rewrite.
- It preserves the stable part of the system: `send_menu.py` and the GitHub Actions cron.
- It avoids exposing privileged Supabase credentials in the browser.
- It lets you ship the new website first, then decide later whether to port backend logic to TypeScript.

## Current Behavior To Preserve

The new frontend should match the current `app.py` behavior:

- New user enters email and preferences
- Existing active user gets a secure manage-link email instead of immediate form-based updates
- New or inactive user receives a confirmation email
- `?token=...&action=confirm` activates the user
- `?token=...` loads preference management for an existing user
- `?token=...&action=unsubscribe` deactivates the user
- Confirmed users receive the daily menu from the existing scheduled backend

## Important Security Constraint

Do not move the current Supabase key usage directly into browser code.

The current repo assumes trusted server-side access:

- `app.py` reads Supabase secrets server-side
- `send_menu.py` reads Supabase and SMTP secrets server-side
- `database/schema.sql` does not define RLS policies for safe public-client access

For the migration, assume:

- Browser never gets service-role credentials
- Browser only talks to Next.js server routes
- Next.js server routes talk to Supabase and SMTP

## Migration Strategy

Use a two-phase cutover:

1. Build and deploy the new Next.js frontend while keeping `send_menu.py` and GitHub Actions unchanged.
2. Switch email links and public traffic to the new frontend only after end-to-end testing passes.

## Proposed Repo Layout

You can keep this as a monorepo. Recommended structure:

```text
.
├─ app.py
├─ send_menu.py
├─ services/
├─ database/
├─ .github/
└─ web/
   ├─ app/
   ├─ components/
   ├─ lib/
   ├─ public/
   ├─ package.json
   ├─ next.config.ts
   └─ .env.local
```

## Proposed Next.js Pages And Routes

### User-Facing Pages

- `/`
  - landing page
  - email input
  - meal selection
  - station selection
  - subscribe action

- `/manage?token=<uuid>`
  - loads existing user by token
  - displays saved preferences
  - updates preferences

- `/confirm?token=<uuid>`
  - confirms subscription
  - shows success/error state
  - optional later enhancement: trigger immediate send of today's menu

- `/unsubscribe?token=<uuid>`
  - confirm unsubscribe action
  - updates `is_active=false`

- `/invalid-link`
  - handles bad or expired tokens cleanly

### Server Routes

- `POST /api/subscribe`
  - input: `email`, `meals`, `stations`
  - behavior:
    - if active user exists: send manage-link email
    - if inactive or new user exists: rotate token, upsert, send confirmation email

- `GET /api/preferences?token=<uuid>`
  - loads email and preferences for a valid token

- `POST /api/preferences`
  - input: `token`, `meals`, `stations`
  - updates preferences for token owner

- `POST /api/confirm`
  - input: `token`
  - sets `is_active=true`

- `POST /api/unsubscribe`
  - input: `token`
  - sets `is_active=false`

- `POST /api/send-manage-link`
  - optional if separated from `/api/subscribe`
  - not required if `/api/subscribe` handles it

## File-Level Mapping From Streamlit To Next.js

### Current Streamlit Responsibilities In `app.py`

- render form UI
- read token/action from query params
- query Supabase directly
- send confirmation/manage emails directly
- confirm and unsubscribe directly
- update preferences directly
- on confirm, optionally send today's menu immediately

### Recommended Next.js Split

- `web/app/page.tsx`
  - landing page and subscribe form

- `web/app/manage/page.tsx`
  - manage preferences page

- `web/app/confirm/page.tsx`
  - confirmation page

- `web/app/unsubscribe/page.tsx`
  - unsubscribe page

- `web/app/api/subscribe/route.ts`
  - subscribe behavior

- `web/app/api/preferences/route.ts`
  - load/update preferences

- `web/app/api/confirm/route.ts`
  - confirm behavior

- `web/app/api/unsubscribe/route.ts`
  - unsubscribe behavior

- `web/lib/supabase-admin.ts`
  - server-side Supabase client using service credentials

- `web/lib/email.ts`
  - SMTP sending helper

- `web/lib/menu.ts`
  - optional later port of menu fetching/filtering logic if you want feature parity for instant send on confirm

- `web/lib/validators.ts`
  - request validation for email, token, meals, stations

- `web/components/`
  - form UI and reusable presentational components

## Data And API Contract Checklist

### Reuse Existing Data Model

Keep the current `users` table contract:

- `email`
- `created_at`
- `preferences`
- `is_active`
- `token`

Keep the existing preference JSON shape:

```json
{
  "meals": ["breakfast", "lunch", "dinner"],
  "stations": ["Grill", "Pizza"]
}
```

### Validate Inputs Server-Side

Validate all incoming data in Next.js routes:

- email format
- token UUID format
- meals must be subset of `breakfast|lunch|dinner`
- stations must be subset of the allowed station list
- at least one meal selected
- at least one station selected

## Environment Variables

### Vercel Project Env Vars

Set these in Vercel:

- `SITE_URL`
  - example: `https://your-project.vercel.app`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMTP_EMAIL`
- `SMTP_PASSWORD`
- `SMTP_SERVER`
- `SMTP_PORT`

### GitHub Actions

Keep these as-is for `send_menu.py`:

- `SUPABASE_URL`
- `SUPABASE_KEY`
- `SMTP_EMAIL`
- `SMTP_PASSWORD`
- `SMTP_SERVER`
- `SMTP_PORT`

### Naming Cleanup Recommendation

To reduce ambiguity later:

- keep current Python env var names working
- standardize new frontend server env vars around:
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

If you later update Python too, make both services use explicit names for admin credentials.

## Email Template Changes Required

Current issue:

- `services/email_templates.py` hardcodes `https://dson-dailymenu.streamlit.app`

Required change during migration:

- replace hardcoded base URL with `SITE_URL`
- use the new frontend routes:
  - confirm link: `${SITE_URL}/confirm?token=...`
  - manage link: `${SITE_URL}/manage?token=...`
  - unsubscribe link: `${SITE_URL}/unsubscribe?token=...`

This should be done before or during cutover.

## Station Source Decision

Current behavior:

- station list is fetched via `get_available_stations(...)` in Python
- AGENTS notes also say the station list is effectively hardcoded in `services/utils.py`

Recommended migration decision:

- do not dynamically fetch stations on the client for v1
- define a canonical station list in one server-side or shared file
- use the same list for validation and UI options

If station names change often, revisit this later.

## Immediate-Send-On-Confirm Decision

This is the only feature that meaningfully increases migration complexity.

### Option A: MVP

On confirm:

- activate user
- show success message
- do not send today's menu immediately

Pros:

- much faster migration
- no need to port Nutrislice logic yet

Cons:

- slightly different behavior from current Streamlit app

### Option B: Full Parity

On confirm:

- activate user
- fetch today's menu
- filter by preferences
- send email immediately

Pros:

- matches current behavior

Cons:

- requires either:
  - porting the Python menu logic to TypeScript, or
  - calling a Python service from the frontend backend, which is not worth it for this repo

Recommendation:

- ship Option A first
- add Option B only if users care about immediate first-send

## Concrete Implementation Checklist

### Phase 0: Prep

- [ ] Create a `web/` directory for the Next.js app
- [ ] Initialize Next.js with App Router and TypeScript
- [ ] Add a UI library only if necessary; avoid adding heavy dependencies early
- [ ] Copy logo and static assets from `assets/` into `web/public/`
- [ ] Decide whether this repo stays single-root or becomes a documented monorepo

### Phase 1: Shared Constants And Config

- [ ] Add a canonical station list file for the web app
- [ ] Add meal constants: `breakfast`, `lunch`, `dinner`
- [ ] Add server-side env parsing with hard failure on missing secrets
- [ ] Add `SITE_URL` support

### Phase 2: Server Utilities

- [ ] Create server-only Supabase admin client
- [ ] Create SMTP email helper in the Next.js app
- [ ] Port or recreate confirmation/manage email templates
- [ ] Add request validation helpers
- [ ] Add reusable token lookup helper

### Phase 3: API Routes

- [ ] Implement `POST /api/subscribe`
- [ ] Implement `GET /api/preferences`
- [ ] Implement `POST /api/preferences`
- [ ] Implement `POST /api/confirm`
- [ ] Implement `POST /api/unsubscribe`
- [ ] Return explicit status codes and clear JSON errors

### Phase 4: Frontend Pages

- [ ] Build landing page with subscribe form
- [ ] Build manage page with token lookup and preference editing
- [ ] Build confirm page
- [ ] Build unsubscribe page
- [ ] Build invalid-token and generic error states
- [ ] Make all pages work on mobile and desktop

### Phase 5: Testing Locally

- [ ] Test new user signup
- [ ] Test existing active user requesting manage link
- [ ] Test inactive user resubscribe flow
- [ ] Test confirm flow with valid token
- [ ] Test confirm flow with invalid token
- [ ] Test manage flow with valid token
- [ ] Test update preferences
- [ ] Test unsubscribe flow
- [ ] Test resend/manage email content and links

### Phase 6: Deployment

- [ ] Create Vercel project from the repo
- [ ] Configure root directory as `web/` if using a subfolder app
- [ ] Add all required Vercel env vars
- [ ] Deploy preview build
- [ ] Test production domain routes and API responses

### Phase 7: Cutover

- [ ] Update all email templates to use the new domain
- [ ] Redeploy backend if Python email templates still generate links
- [ ] Run a real end-to-end subscription test against production
- [ ] Verify GitHub Actions daily job still succeeds
- [ ] Stop using the Streamlit deployment

### Phase 8: Post-Cutover Cleanup

- [ ] Remove Streamlit-specific deployment documentation from `README.md`
- [ ] Mark `app.py` as deprecated or remove it after a safe window
- [ ] Remove `.streamlit/` deployment dependency if no longer needed
- [ ] Document the new local dev workflow

## Testing Matrix

Run these before final cutover:

- [ ] New email, valid preferences, receives confirmation email
- [ ] Existing active email does not overwrite preferences directly
- [ ] Existing active email receives manage-link email
- [ ] Invalid token does not expose whether arbitrary users exist
- [ ] Token-based manage page loads correct email and preferences
- [ ] Preferences update persists in Supabase
- [ ] Unsubscribe sets `is_active=false`
- [ ] Resubscribe rotates token and sends fresh confirmation link
- [ ] Daily cron still sends to active users only

## Suggested Acceptance Criteria

The migration is complete when:

- the public website is served by Vercel
- signup, confirm, manage, and unsubscribe all work without Streamlit
- no admin Supabase credentials are exposed in browser code
- GitHub Actions continues sending the daily email without changes to user-facing behavior
- all emailed links point to the new frontend domain

## Nice-To-Have Improvements After Migration

- Port menu parsing/filtering from Python to TypeScript
- Add rate limiting to subscribe and token routes
- Add better token expiration or one-time-use flows if desired
- Add basic analytics on signups and confirmations
- Add RLS policies if you ever want direct browser access with a public Supabase key
- Add a transactional email provider later if SMTP becomes fragile

## Recommended First Execution Order

If you want the shortest path to production, do the work in this order:

1. Create the `web/` Next.js app.
2. Implement server-only Supabase and SMTP helpers.
3. Implement `subscribe`, `confirm`, `manage`, and `unsubscribe` routes.
4. Build the four user-facing pages.
5. Switch email links to `SITE_URL`.
6. Deploy to Vercel and test end to end.
7. Retire Streamlit only after production verification.

## Notes Specific To This Repo

- Keep `.github/workflows/daily_menu.yml` unchanged during the first migration pass.
- Keep `send_menu.py` unchanged during the first migration pass.
- Treat `app.py` as the source of truth for current UX behavior, but not as the architecture to preserve.
- Treat `services/email_templates.py` as the first required backend file to update for cutover because it currently owns the public URLs inside emails.
