# Store Force Assignments as a sibling map, not by widening the Cutoff assignment

`bb_biweekly` gains a second map alongside the existing one:
`{ assignments: { [subitemId]: 'cutoff1'|'cutoff2'|'both' }, forced: { [subitemId]: true } }`.
Only ids present in `forced` are Force Assigned; unticking the checkbox deletes the id
rather than storing `false`. The `assignments` map keeps its existing shape untouched.

## Considered Options

- **Widen the Cutoff assignment** — turn each value from a plain string into
  `{ cutoff, forced }`. This is the tidier model: one Subitem's placement is one value,
  and the two facts cannot drift apart. Rejected for two concrete reasons.

  This codebase has no migration runner, so a widened value would read as `undefined` on
  every plan already saved — `asgn[id].cutoff` on a stored string is `undefined`, and every
  existing budget would silently lose its cutoffs on first load.

  And `js/transfer.js` reads the Cutoff assignment directly and expects a string. Widening
  it would break transfer routing quietly rather than loudly: routes would still be
  computed, just against a value that no longer compares equal to `'cutoff1'`.

## Consequences

- An absent `forced` map reads as "nothing Force Assigned", which is exactly the right
  default, so existing saved plans need no migration whatsoever.
- The absent map still has to be materialised before anything writes into it. A profile
  saved before this feature *has* a `bb_biweekly` row, so `DEFAULTS.biweekly` never applies
  to it — the loaded value replaces the default wholesale. `hydrateProfile()` therefore
  calls `normaliseBiweekly()`, which runs on first load and on every profile switch, and
  mutates the plan in place because the profile machinery relies on those objects being
  shared references. That call looks redundant next to the default and is not; it carries a
  comment saying so.
- The two maps can drift, which is the cost of the shape. Both release paths are explicit:
  setting a Subitem to Unassigned deletes its `forced` entry, and deleting a Subitem
  removes it from `assignments`, `forced` and `bankAssign` together.
- Duplicating a Profile carries Force Assignments over for free — `createProfile()` clones
  the whole `biweekly` value, and Subitem ids are copied verbatim.
- This sits alongside [ADR-0001](0001-profile-id-column-with-account-sentinel.md), which
  records a structurally identical choice: a storage shape picked to protect rows that
  already exist from a migration path that does not.
