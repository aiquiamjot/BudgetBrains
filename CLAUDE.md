# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BudgetBrains is a personal budgeting SPA — vanilla HTML/CSS/JS, no build step, backed by Supabase for auth and data persistence.

## Local Development

No npm or build tools. Serve the root directory with any static file server:

```bash
python -m http.server 8080
```

On Windows, `launch.bat` opens Chrome directly to `index.html`.

Deploy target is Vercel (static hosting, no build config needed).

## Architecture

### State Management (`js/state.js`)

All application state lives in a single `S` object. State keys fall into four buckets:

- **ACCOUNT_KEYS** (`banks`, `fees`, `profiles`) — synced to Supabase, shared by every Profile
- **PROFILE_KEYS** (`overview`, `biweekly`, `bankAssign`, `manual`) — synced to Supabase, scoped to one Profile
- **LOCAL_KEYS** (`theme`, `activeTab`, `activeProfile`, `groqKey`) — `localStorage` only
- **LOCAL_PROFILE_KEYS** (`groqProfile`) — `localStorage`, under a key suffixed with the Profile id

`DB_KEYS` is the union of `ACCOUNT_KEYS` and `PROFILE_KEYS` and is what `save()` checks against.

The write path is fire-and-forget: `save(key)` immediately writes to localStorage and issues a Supabase upsert with no awaited error handling.

### Profiles (`js/profiles.js`)

An Account holds several Profiles — alternative budgets, only one Active at a time. See
[CONTEXT.md](CONTEXT.md) for the vocabulary and `docs/adr/` for why the boundaries fall
where they do.

`S` is **flat**: `S.overview` always means the *Active* Profile's overview, so every
feature module reads state exactly as it did before Profiles existed. The other Profiles
live in `S._profileData[profileId]`.

Two rules keep that honest:

1. `hydrateProfile(id)` points `S.overview` / `S.biweekly` / `S.bankAssign` / `S.manual` at
   the **same object references** held in `S._profileData[id]`, so in-place mutations land
   in both. Never reassign those four keys wholesale — mutate them.
2. `save()` re-points the cache before writing, which covers rule 1 being broken.

`loadState()` fetches every Profile's rows in one query, so switching Profiles is purely
in-memory — there is no refetch.

**Bootstrap:** if no `bb_profiles` row exists, the client mints a Profile named "Main" and
adopts any per-Profile keys found on the `'account'` sentinel into it. This one path serves
both new signups and the migration of pre-Profiles data.

### Data Flow

```
User input → event listener → mutate S → save(key) → Supabase upsert
                                       → re-render() → DOM update
```

There is no virtual DOM or reactivity framework — each module exposes a `render()` function that rewrites its section of the DOM from scratch on every state change.

### Feature Modules

Each tab is a self-contained JS module:

| File | Tab | Responsibility |
|---|---|---|
| `js/overview.js` | Overview | Net pay, Needs/Wants/Savings splits, subitems, Chart.js donut + bar charts |
| `js/biweekly.js` | Biweekly | Assign subitems to Cutoff 1/2/Both; greedy bin-packing Auto-Suggest |
| `js/banks.js` | Banks | Register banks/e-wallets, assign subitems to accounts, per-bank totals |
| `js/transfer.js` | Transfer | Route fees, free-transfer quotas, graph-based optimal transfer sequencing |

`js/profiles.js` is not a tab — it renders the Profile switcher into the topbar and owns
Profile create/duplicate/rename/delete/switch.

Because Banks are Account-level but `bankAssign` is per-Profile, `deleteBank()` in
`js/banks.js` must strip the bank from **every** Profile's `bankAssign`, not just the
Active one.

### Transfer Route Algorithm (`js/transfer.js`)

The most complex module. It builds an adjacency graph from configured routes and fees, then for each required transfer finds the cheapest path (direct or via intermediary bank). Results are split into Cutoff 1 and Cutoff 2 sequences, sorted by fee ascending, with same-source/destination transfers merged.

### Auth (`js/auth.js`)

Standard Supabase email/password auth: sign up, sign in, forgot password (email link), password reset. Session validation and state hydration happen on `DOMContentLoaded` in `js/ui.js`.

## Key Utilities

Defined at the top of `js/state.js` and used throughout:

- `ri(id)` — shorthand for `document.getElementById(id)`
- `esc(str)` — HTML-escapes a string before inserting into templates
- `fmt(n)` — formats a number as Philippine Peso currency
- `genId()` — 8-character id, used for subitems, banks and Profiles

## Supabase Schema

Single table `user_data` with columns: `user_id` (UUID), `profile_id` (text), `key`
(string), `value` (JSONB). Unique on `(user_id, profile_id, key)` — every upsert must pass
`onConflict: 'user_id,profile_id,key'`.

`profile_id` holds the literal string `'account'` for Account-level rows. It is never
`NULL`: Postgres treats `NULL != NULL` in a unique index, so a nullable column would let
duplicate `bb_banks` rows through. See `docs/adr/0001-*`.

Account-level rows (`profile_id = 'account'`):
- `bb_profiles`: `[{ id, name }]` — the Profile list, in display order
- `bb_banks`: `[{ id, name, nick, type: 'bank'|'ewallet', freeLimit, resetPeriod }]`
- `bb_fees`: `{ ['${fromId}_${toId}']: { fee } }`

Per-Profile rows (`profile_id` = a Profile id):
- `bb_overview`: `{ netPay, splits: {needs, wants, savings}, subitems: [{id, name, category, amount}] }`
- `bb_biweekly`: `{ assignments: { [subitemId]: 'cutoff1'|'cutoff2'|'both' }, forced: { [subitemId]: true } }`
  — `forced` holds the Force Assigned Subitems; an absent map means none, so plans saved
  before the feature need no migration. See `docs/adr/0005-*`.
- `bb_bankAssign`: `{ [subitemId]: bankId | 'cash' }`
- `bb_manual`: `[{ from, to, amount, note }]`

Free-transfer quotas (`freeLimit`, `resetPeriod`) live on the bank object in `bb_banks`,
not in `bb_fees`. They are configuration only — nothing tracks consumption.

Subitem ids are unique within a Profile, not across them. Duplicating a Profile copies
subitem ids verbatim so `bb_biweekly` and `bb_bankAssign` carry over without remapping.
