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

## Tests

```bash
node --test
```

Nothing to install — Node's built-in test runner. Test files live in `test/`, and load
the app's plain script files into a sandboxed `vm` context via the helper in
`test-helpers/loadScript.js`, so the source files stay browser globals with no module
syntax. Tests exercise a module only through its interface, never through DOM,
`save()`, or Supabase.

## Architecture

### State Management (`js/state.js`)

All application state lives in a single `S` object. State keys fall into four buckets:

- **ACCOUNT_KEYS** (`banks`, `fees`, `profiles`) — synced to Supabase, shared by every Profile
- **PROFILE_KEYS** (`overview`, `biweekly`, `bankAssign`, `manual`) — synced to Supabase, scoped to one Profile
- **LOCAL_KEYS** (`theme`, `activeTab`, `activeProfile`, `groqKey`) — `localStorage` only
- **LOCAL_PROFILE_KEYS** (`groqProfile`) — `localStorage`, under a key suffixed with the Profile id

`DB_KEYS` is the union of `ACCOUNT_KEYS` and `PROFILE_KEYS` and is what `save()` checks against.

The write path is fire-and-forget: `save(key)` immediately writes to localStorage and issues a Supabase upsert that nothing awaits; a failed write is logged, never thrown.

### Profile store (`js/state.js`) and wiring (`js/wiring.js`)

`js/state.js` holds no Supabase reference. Load, bootstrap, activation and every write
go through the **Profile store** — a pure, DOM-free namespace object (`ProfileStore`)
whose `create({ state, remote, local })` returns `{ load, activate, save, saveProfile, create, rename, remove, profileIds, profileData }`:

- `load()` reads device-local keys, fetches every row once, routes them into `state`,
  bootstraps "Main" when there is no Profile list, falls back from a stale Active
  Profile, and resolves to `{ error }` (`null` on success).
- `activate(profileId)` makes a Profile Active in memory only (callers
  `save('activeProfile')` to remember it).
- `save(...keys)` / `saveProfile(profileId, ...keys)` snapshot the Active Profile id
  before anything asynchronous and return a promise that resolves when the write
  completes. The app ignores it; tests await it.
- `create(name, copyFromId?)` returns the new Profile id and makes it Active (deep copy of
  every per-Profile key when a source is given); `rename(profileId, name)`;
  `remove(profileId)` deletes the remote rows and device-local keys, activates the first
  remaining Profile if needed, and throws on the last Profile.

The store sits behind two adapters. The **remote adapter** is row-level —
`loadRows()` → `{ rows: [{ profile_id, key, value }], error }`, `upsert(rows)` →
`{ error }`, `deleteScope(profileId)`. The **local adapter** is anything shaped like
`localStorage`. The store owns the `'account'` sentinel, the state-key → row-name
mapping and which scope each key writes to; the Supabase adapter owns the signed-in
user, the user id and the `user_id,profile_id,key` conflict target.

`js/wiring.js`, loaded right after `js/state.js`, creates the Supabase client `sb`
(the auth module uses it too), the Supabase adapter and the global `profileStore` over
`S`, and defines the global `save` (one line into the store) and `loadState` (calls
`load` and shows the load-failure alert, migration hint included, on an error).
Tests build the store over an in-memory row list and a `Map`-backed stand-in.

### Profiles (`js/profiles.js`)

An Account holds several Profiles — alternative budgets, only one Active at a time. See
[CONTEXT.md](CONTEXT.md) for the vocabulary and `docs/adr/` for why the boundaries fall
where they do.

`S` is **flat**: `S.overview` always means the *Active* Profile's overview, so every
feature module reads state exactly as it did before Profiles existed. The four
per-Profile keys (`overview`, `biweekly`, `bankAssign`, `manual`) are **accessor
properties**: getting or setting one goes to the Active Profile's entry in the Profile
store's private cache, so mutating in place and reassigning wholesale are both safe and
both persisted by `save()`. The cache is not reachable from `S`; the only read access to
other Profiles is `profileStore.profileIds()` and `profileStore.profileData(id)` —
mutate what `profileData` returns, then persist with `profileStore.saveProfile(id, ...keys)`.

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
| `js/transfer.js` | Transfer | Route/fee config UI, manual transfer steps, renders the per-Cutoff steps from one `TransferFunding.fund` call |

`js/profiles.js` is not a tab — it renders the Profile switcher into the topbar and owns
Profile create/duplicate/rename/delete/switch.

`js/cutoffPlan.js` is not a tab either. It holds the Cutoff Plan module — a pure,
DOM-free namespace object (`CutoffPlan`) covering the Cutoff rules and Force Assign
rules for one Profile: `normalise`, `amountIn`, `itemsIn`, `totals`, `unassigned`,
`assign`, `unassign`, `setForced`, `forget`, `autoSuggest`. It is loaded before
`js/state.js`, which calls `CutoffPlan.normalise` while hydrating a Profile. The
Biweekly tab renders and mutates through it; the Overview Subitem delete handler calls
`CutoffPlan.forget`. See [CONTEXT.md](CONTEXT.md) for the term.

Because Banks are Account-level but `bankAssign` is per-Profile, `deleteBank()` in
`js/banks.js` must strip the bank from **every** Profile's `bankAssign`, not just the
Active one.

`js/transferPlanner.js` is not a tab either. It holds the Transfer planner — a pure,
DOM-free namespace object (`TransferPlanner`) with one function, `plan({ banks, fees,
sourceId, needs })`, returning Transfer steps `{ fromId, toId, amount, fee, carries }`,
where `carries: [{ bankId, amount }]` lists the Banks whose need the step's money is
for, each with exactly the need routed through that step — the step's `to` Bank first,
then `banks` order — adding up to `amount`. It owns the Fee-key format used to look up
a Route's Fee. It knows nothing about Subitems or Cutoffs.

`js/transferFunding.js` is not a tab either. It holds the Transfer funding module — a
pure, DOM-free namespace object (`TransferFunding`) with one function, `fund({ banks,
fees, sourceId, subitems, cutoffPlan, bankAssign })`, returning `{ cutoff1, cutoff2,
unfunded }`. It is loaded after `js/cutoffPlan.js` and `js/transferPlanner.js` and
calls both: each Cutoff's Bank need is the sum of the Cutoff Plan's `amountIn` over
Subitems whose Bank assignment is a registered Bank (Cash, a deleted Bank or no Bank
assignment contribute nothing), and `cutoff1` / `cutoff2` are what
`TransferPlanner.plan` returns for that Cutoff, with each `carries` entry enriched to
`{ bankId, amount, subitems: [{ subitem, amount }] }` — the Transfer breakdown: the
whole Subitem objects assigned to that Bank with a nonzero `amountIn` for the Cutoff,
in `subitems` order, adding up to the entry's `amount`. `unfunded` lists the Unfunded
Subitems (whole Subitem objects, in `subitems` order), and the Transfer tab renders its
"No Transfer planned for …" warning from it. The Salary source is an input; the Transfer tab passes the first registered Bank (see
[CONTEXT.md](CONTEXT.md)), makes one `fund` call, and renders each step with Bank names
and its Transfer breakdown from `carries` — a plain list for one Bank, a header per Bank
for several.

### Transfer Route Algorithm (`js/transferPlanner.js`)

The most complex module. `TransferPlanner.plan` builds an adjacency graph from the
given Banks and Fees, then for each Bank with a nonzero need finds the cheapest path
from the Salary source (direct, or via a single intermediary Bank, taken only when
strictly cheaper). Steps sharing the same Bank pair are merged, summing amounts and
concatenating `carries` (each Bank's need takes one path, so no Bank repeats). Results
are sorted by Fee ascending, with no-Route steps (`fee: null`) last. A Bank with a free-transfer quota above 0 gives Fee 0 on its
outgoing Routes.

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

## Agent skills

### Issue tracker

Issues live as GitHub issues in `aiquiamjot/BudgetBrains`, managed with the `gh` CLI.
See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, unmapped — each label string equals its role name.
See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root.
See `docs/agents/domain.md`.
