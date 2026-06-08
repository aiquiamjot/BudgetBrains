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

All application state lives in a single `S` object. State keys fall into two buckets:

- **DB_KEYS** (`overview`, `biweekly`, `banks`, `bankAssign`, `fees`, `manual`) — synced to Supabase via upsert on every change
- **LOCAL_KEYS** (`theme`, `activeTab`) — stored in `localStorage` only

The write path is fire-and-forget: `save(key)` immediately writes to localStorage and issues a Supabase upsert with no awaited error handling.

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

### Transfer Route Algorithm (`js/transfer.js`)

The most complex module. It builds an adjacency graph from configured routes and fees, then for each required transfer finds the cheapest path (direct or via intermediary bank). Results are split into Cutoff 1 and Cutoff 2 sequences, sorted by fee ascending, with same-source/destination transfers merged.

### Auth (`js/auth.js`)

Standard Supabase email/password auth: sign up, sign in, forgot password (email link), password reset. Session validation and state hydration happen on `DOMContentLoaded` in `js/ui.js`.

## Key Utilities

Defined at the top of `js/ui.js` and used throughout:

- `ri(id)` — shorthand for `document.getElementById(id)`
- `esc(str)` — HTML-escapes a string before inserting into templates
- `fmt(n)` — formats a number as Philippine Peso currency

## Supabase Schema

Single table `user_data` with columns: `user_id` (UUID), `key` (string), `value` (JSONB).

State shape stored under each key:
- `bb_overview`: `{ netPay, splits: {needs, wants, savings}, subitems: [{id, name, category, amount}] }`
- `bb_biweekly`: `{ assignments: { [subitemId]: 'cutoff1'|'cutoff2'|'both' } }`
- `bb_banks`: `[{ id, name, nick, type: 'bank'|'ewallet' }]`
- `bb_bankAssign`: `{ [subitemId]: bankId | 'cash' }`
- `bb_fees`: `{ ['${fromId}_${toId}']: { fee } }` plus free-transfer quota config
- `bb_manual`: `[{ from, to, amount, note }]`
