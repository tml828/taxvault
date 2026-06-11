# TaxVault — Developer Notes

## What This Is

Single-file personal tax management web app (`index.html`) for a married couple each owning a business. No build process. Deployed to GitHub Pages from the `main` branch at https://tml828.github.io/taxvault/.

## Architecture

- **One file**: all HTML, CSS, and JS live in `index.html` (~6500+ lines).
- **localStorage** for per-device persistence. Keys prefixed with `tv_`. Year-scoped data stored under `tv_yearData_yXXXX`.
- **Supabase** for cloud sync. Project URL and anon key are hardcoded constants near the top of the JS.
- **No build step**. Edit `index.html`, commit, push to `main`, GitHub Pages serves it.

## Data Flow

```
User edits → APP object (in-memory)
           → saveLocal() → localStorage (tv_* keys)
           → saveToCloud() → Supabase taxvault_user_data (background, debounced)
```

On load: localStorage is read first (instant), then cloud is fetched in background and merged.

## Supabase Schema

Table: `public.taxvault_user_data`

| Column | Type | Notes |
|--------|------|-------|
| user_id | uuid PK | references auth.users(id), RLS gated |
| questionnaire | jsonb | business/filing setup |
| tax_year | text | not used on read (app ignores cloud tax_year) |
| owner_name | text | display name |
| deleted_doc_ids | jsonb | array of deleted document IDs |
| year_data | jsonb | all year-scoped data; includes `_meta` key |
| updated_at | timestamptz | |

`year_data._meta` carries `{ pinHash, pinChangedAt, apiKey }` — synced to all devices securely.

RLS policy: `auth.uid() = user_id` (all operations). Setup SQL in `supabase_setup.sql`.

Old table `taxvault_data` (pin_hash keyed) has RLS enabled with no policies — fully locked out.

## Auth Architecture

- **Supabase email/password auth** — session tokens stored in localStorage (`tv_sb_session`).
- `getValidSession()` auto-refreshes the session 60 seconds before expiry.
- `sbFetch()` accepts an optional `accessToken` and sends it as the Bearer token (required for RLS).
- On first signed-in load, the app migrates any legacy `taxvault_data` row into the new account table.

## PIN / Screen Lock

- PIN is a **local screen lock only** — it does not gate the database.
- Hashed with SHA-256 + salt `:taxvault:v2` (same digits produce a different hash than the hardcoded default).
- `hashPin(pin, legacy=false)` — pass `legacy=true` to compute the old unsalted hash (used for silent upgrade).
- On login, app tries v2 hash first; if no match tries legacy hash and silently upgrades.
- Cross-device PIN sync uses `pinChangedAt` timestamp — only adopt cloud PIN if it's newer than local.

## Key Functions

| Function | Purpose |
|----------|---------|
| `saveLocal()` | Write APP state to localStorage; stamps `tv_dataSavedAt` |
| `saveToCloud()` | Upsert to `taxvault_user_data`; includes `_meta` in year_data |
| `loadFromCloud()` | Fetch cloud row, merge into APP, adopt newer PIN if applicable |
| `getValidSession()` | Return valid session, auto-refresh if expiring soon |
| `hashPin(pin, legacy)` | SHA-256 hash with v2 salt (or legacy unsalted) |
| `assetDeductionForYear(asset, taxYear)` | Section 179: full cost in purchase year only; straight-line: cost/5 per year within life |
| `esc(s)` | HTML-escape user/AI strings before inserting into DOM |
| `manualSync()` | Step-by-step diagnostics: session, table, sync, API key, storage, PIN, build version |
| `setTaxYear(year)` | Switch active tax year; reloads mileage, deductions, contractors |
| `clearAllData()` | Deletes both cloud rows + all `tv_*` localStorage keys; preserves PIN and session |

## Tax Calculations

- **QBI (§199A)**: Filing-status-aware thresholds — MFJ $383,900 / others $191,950. Phase-in over $100K (MFJ) / $50K range. W-2 wages = 0 → deduction is 0 above threshold.
- **Home office (Form 8829)**: Income cap = `max(0, bizNetForHO)`. Both simplified and actual methods capped. Office% clamped to ≤1.
- **SE tax**: Applied only to `bizNetSE` (self-employment income minus expenses), not W-2 wages.
- **Section 179**: Full cost deducted in purchase year only; zero in all subsequent years.
- **Straight-line depreciation**: `cost / life` per year, only within the asset's useful life.

## Dashboard Workflow Guide

10-step filing guide replaces the old two-column checklist. Steps are color-coded:
- Green ✓ = done
- Yellow = current step
- Red "!" = optional step that was skipped (past current step)

Clicking a step navigates to the relevant page.

## Mobile / iOS

- Viewport: `width=device-width, initial-scale=1.0, maximum-scale=1.0, viewport-fit=cover`
- All inputs/selects/textareas set to `font-size: 16px` on mobile (prevents iOS Safari auto-zoom).
- Touch targets: 52px min-height.
- Dropdown menus lock `body` and `main-content` scroll while open; `overscroll-behavior: contain` on dropdown.

## Security Notes

- `esc()` must be used for ALL user-supplied and AI-sourced strings rendered into innerHTML.
- Cloud data is gated by Supabase RLS — the anon key alone cannot read another user's row.
- PIN hash is never sent in plaintext; only the SHA-256 hash is stored/synced.
- `_meta` in `year_data` is the secure channel for syncing PIN hash and Anthropic API key across devices.

## Deployment

Push to `main` branch → GitHub Pages auto-deploys. No CI, no build step.

Current build version constant (near top of JS): `BUILD_VERSION = 'v2026.06.11-5'`

Bump this string on every deploy for cache verification via the Sync diagnostics panel.

## Development Branch

Active feature branch: `claude/beautiful-bardeen-s5lki1`
