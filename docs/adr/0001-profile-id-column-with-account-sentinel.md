# Scope rows to a Profile with a `profile_id` column and an `'account'` sentinel

`user_data` was a flat key-value table unique on `(user_id, key)`. Introducing Profiles
needed a third dimension, so we added `profile_id text NOT NULL DEFAULT 'account'` and
moved the unique constraint to `(user_id, profile_id, key)`. Rows that belong to the
whole Account rather than to any one Profile — `bb_banks` and `bb_fees` — carry the
literal string `'account'` rather than `NULL`.

## Considered Options

- **Namespaced keys** — store `bb_overview:<profileId>` in the existing `key` column.
  No DDL, but the column would carry two facts, every read would parse strings, and
  the existing rows still need renaming — so it trades a visible migration for a
  hidden one rather than avoiding it.
- **Single blob** — one `bb_profiles` row holding every Profile's data at once.
  Rejected on blast radius: the write path is fire-and-forget with no retry
  (`js/state.js`), so a dropped request would take out every Profile instead of one
  key of one Profile.

## Consequences

- The sentinel is deliberate, not laziness. Postgres treats `NULL != NULL` in a unique
  index, so a nullable `profile_id` would let two `bb_banks` rows both insert and
  silently produce duplicate bank lists. A non-null sentinel makes the constraint bite.
- `NOT NULL DEFAULT 'account'` backfills existing rows in the same statement, which
  leaves the per-Profile keys (`bb_overview`, `bb_biweekly`, `bb_bankAssign`,
  `bb_manual`) sitting on the sentinel. They are moved onto a real Profile by the
  client, not by a one-off `UPDATE` — see ADR-0002.
- Every `upsert` must pass `onConflict: 'user_id,profile_id,key'`. The old
  `'user_id,key'` will not error loudly — it will just write to the wrong row.
