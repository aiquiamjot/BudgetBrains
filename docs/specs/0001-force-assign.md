# Force Assign

Status: partly implemented — #3 (checkbox, persistence, feedback) and #4 (glossary, ADR)
are done; #2 (extract the packing seam) and #5 (pack around Force Assigned Subitems)
remain open.
Branch: `force-assign-to-cutoff`

The sibling map is named `forced` in code and storage, not `forceAssign`. This spec was
written before that name settled; ADR 0005 and `CLAUDE.md` are the authority.

## Problem Statement

A person plans their pay period by assigning each Subitem to Cutoff 1, Cutoff 2 or
Both. Auto-Suggest balances those assignments as evenly as it can between the two
cutoffs — and in doing so it throws away every assignment already there. Rent has to
come out of the first cutoff because that is when it is due; a Subitem deliberately set
to Both gets collapsed onto one side. Every Auto-Suggest is all-or-nothing: either
accept a balanced plan that ignores the person's real constraints, or never press the
button and place all Subitems by hand.

There is no way to say "balance everything else, but leave *this* where I put it."

## Solution

Each row in the Biweekly Strategy table gains a **Force** checkbox, directly after the
Assign to Cutoff column. Ticking it Force Assigns that Subitem: Auto-Suggest will never
move it.

Auto-Suggest then packs *around* the Force Assigned Subitems rather than ignoring them.
It starts each cutoff's running total with the amounts already fixed there, and
distributes only the unforced Subitems into whatever room is left. The result is a plan
that honours the person's fixed commitments and balances everything else against them.

Force Assigned Subitems are marked with a padlock in the Cutoff 1 and Cutoff 2 panels,
so after pressing Auto-Suggest it is immediately visible why a given Subitem did not
move.

## User Stories

1. As a person budgeting a pay period, I want to mark a Subitem as Force Assigned, so
   that Auto-Suggest cannot move it out of the cutoff I chose.
2. As a person with a fixed due date, I want to Force Assign rent to Cutoff 1, so that a
   balanced plan never schedules it for the second half of the month.
3. As a person who splits an expense deliberately, I want to Force Assign a Subitem set
   to Both, so that Auto-Suggest stops collapsing it onto one cutoff.
4. As a person with several fixed commitments, I want Auto-Suggest to balance the
   remaining Subitems around all of them at once, so that I get a usable plan in one
   press instead of re-fixing items after every run.
5. As a person reviewing the Cutoff panels, I want a padlock beside each Force Assigned
   Subitem, so that I can tell at a glance which placements were mine and which were
   suggested.
6. As a person who has just pressed Auto-Suggest, I want to see how many Subitems were
   held in place, so that I understand why the result is not perfectly even.
7. As a person who has Force Assigned nothing yet, I want the helper text to keep
   describing what Auto-Suggest does, so that I am not shown a count for a feature I
   have not used.
8. As a person changing my mind, I want to untick Force, so that the Subitem rejoins the
   pool Auto-Suggest is free to place.
9. As a person moving a Force Assigned Subitem to the other cutoff, I want the Force to
   travel with it, so that I do not have to re-tick the box every time I adjust a
   placement.
10. As a person setting a Force Assigned Subitem back to Unassigned, I want the Force to
    be released automatically, so that no hidden constraint survives on a Subitem that
    is no longer placed anywhere.
11. As a person looking at an Unassigned Subitem, I want its Force checkbox disabled, so
    that I am not invited to fix a Subitem in a cutoff it has not been given.
12. As a person unsure what the checkbox does, I want a tooltip explaining it, so that I
    can find out without leaving the table.
13. As a person who Force Assigned more than half my pay into one cutoff, I want the app
    to honour that anyway and show the overage in red, so that I see the consequence
    rather than having my instruction silently overridden.
14. As a person who has Force Assigned every Subitem, I want Auto-Suggest to do nothing
    rather than error, so that the button is never a trap.
15. As a person who deletes a Subitem, I want its Force Assignment removed with it, so
    that no stale constraint is left behind in my saved data.
16. As a person who duplicates a Profile, I want the Force Assignments to come with it,
    so that the copy starts out as a true copy.
17. As a person switching between Profiles, I want each Profile's Force Assignments kept
    separate, so that a constraint in one budget never leaks into an alternative one.
18. As a person who used the app before this feature existed, I want my saved plans to
    open normally with nothing Force Assigned, so that the upgrade costs me nothing.
19. As a person on a second device, I want my Force Assignments to be there, so that my
    plan is the same wherever I sign in.
20. As a person planning transfers, I want Force Assign to change only which cutoff a
    Subitem sits in, so that the Transfer tab keeps working exactly as it did.
21. As a developer, I want the packing logic available as a pure function, so that the
    balancing rules can be reasoned about and checked without driving the DOM.
22. As a developer, I want the storage shape to extend without a migration, so that
    deploying this feature cannot corrupt or orphan existing saved plans.

## Implementation Decisions

### Domain language

`CONTEXT.md` gains a **Force Assign** entry under Budget, beside Cutoff:

> **Force Assign**: A Cutoff assignment the person has fixed by hand. Auto-Suggest packs
> around Force Assigned Subitems and never reassigns them.

The term is *Force Assign* in prose, code and the glossary. The table column header
abbreviates to **Force**, because it sits directly beneath an Assign to Cutoff column
that already supplies the other half of the phrase.

### Schema

`bb_overview`, `bb_bankAssign`, `bb_manual` and every Account-level row are unchanged.
`bb_biweekly` gains one sibling key:

```
{
  assignments: { [subitemId]: 'cutoff1' | 'cutoff2' | 'both' },
  forced: { [subitemId]: true }
}
```

`forced` is a sibling map rather than a widening of the assignment value (from a
string to `{ cutoff, forced }`) for two reasons. There is no migration runner in this
codebase, so a widened value would read as `undefined` on every row already stored. And
the Transfer tab reads `biweekly.assignments[id]` directly and expects a string — a
widened value would break routing silently. An absent `forced` reads as "nothing
Force Assigned", which is the correct default, so old rows need no migration at all.

This decision is recorded as **ADR 0005**.

Only ids present in the map are Force Assigned; the value is always `true` and is never
read for its value. Nothing is written for an unforced Subitem — un-ticking deletes the
key rather than storing `false`, keeping the stored JSON minimal and making
`id in forced` and truthiness equivalent.

`forced` is per-Profile, living in the same row as `assignments`, so it inherits
Profile isolation, duplication and cross-device sync with no additional work.

### State module

`DEFAULTS.biweekly` becomes `{ assignments: {}, forced: {} }`.

The default alone is insufficient: a loaded row replaces the default object wholesale,
so any Profile saved before this feature would hydrate with `forced` undefined and
throw on the first write. A guard at hydration normalises it — if `forced` is
missing after load, set it to an empty object. Every other read then treats the map as
always present, with no optional chaining scattered through the render.

The guard belongs at the point where a Profile's per-Profile keys are pointed at the
live `S` object, so it runs for the initial load and for every Profile switch. It must
mutate the existing object in place rather than reassigning `S.biweekly`, per the
Profiles invariant that the four per-Profile keys are shared references with
`S._profileData`.

### Biweekly module

**Table.** A fourth column, header `Force` with a padlock icon, after Assign to Cutoff.
Each row renders a checkbox carrying the Subitem id, checked when the id is in
`forced`, and `title="Keep this item in its cutoff when Auto-Suggest runs"`. The
checkbox is disabled when the row's assignment is empty (Unassigned).

**Checkbox change.** Ticking adds the id to `forced`; unticking deletes it. Then
save and re-render.

**Assignment change.** The existing dropdown handler additionally deletes the
`forced` entry when the new value is Unassigned. Any other change leaves
`forced` untouched, so a Force travels with the Subitem when it is moved between
cutoffs — Force Assign expresses "Auto-Suggest keeps its hands off this", an intent that
does not lapse because the person adjusted the placement. Unticking is the only release.

**Cutoff panels.** Each listed Subitem that is Force Assigned is prefixed with a padlock
icon. The panel footer (Total / Half Pay / Remaining) is unchanged, including the
existing red Remaining when a cutoff is over Half Pay.

**Helper text.** The muted line beside the Auto-Suggest button becomes conditional. With
nothing Force Assigned it keeps its current wording. With one or more Force Assigned it
reads to the effect of "N of M items are Force Assigned; the rest will be balanced". The
count is shown only when it explains something; "0 of 8" on a first visit would advertise
a feature the person has not used.

**Button.** Always enabled. When every Subitem is Force Assigned, Auto-Suggest is a
no-op — it recomputes the same assignments and re-renders. No disabled state, no toast;
the helper text already accounts for the case.

### The packing seam

The balancing logic moves out of `autoSuggest()` into a single pure function — the one
seam this feature introduces. It takes the Subitems, the current assignments and the
`forced` map, and returns a new assignments map. It reads no global state, calls no
`save()`, and touches no DOM. `autoSuggest()` becomes: call it, assign the result to
`S.biweekly.assignments`, save, re-render.

Its rules:

- Partition Subitems into Force Assigned and free.
- Seed each cutoff's running total from the Force Assigned Subitems. A Subitem assigned
  to `cutoff1` or `cutoff2` contributes its full amount to that side; one assigned to
  `both` contributes half its amount to *each* side, matching how the Cutoff panels
  already compute totals.
- Carry every Force Assigned Subitem's existing assignment into the result verbatim,
  including `both`.
- Sort the free Subitems by amount descending and place each into whichever cutoff has
  the lower running total, ties going to Cutoff 1 — the existing greedy behaviour,
  unchanged apart from the non-zero starting totals.
- Never emit `both` for a free Subitem. `both` remains a placement only a person can
  choose, preserved through Force Assign.
- Never clamp or reject a seed. If Force Assigned Subitems exceed Half Pay, the free
  Subitems simply flow to the other side and the panel's Remaining goes red. A Force is
  an instruction, and the red figure is already this app's way of reporting that a plan
  does not fit.
- A Force Assigned Subitem that is Unassigned cannot occur — the UI prevents it and the
  dropdown handler cleans it up — but the function should treat an unassigned entry in
  `forced` as free rather than trusting the invariant blindly.

Because the project has no build step and every module is a global-scope script tag,
this function is a plain global alongside `renderBiweekly` and `autoSuggest`. Extracting
it is worthwhile independent of automated tests: it gives the balancing rules one
name, one place, and no side effects.

### Overview module

Subitem deletion already removes the Subitem's `assignments` and `bankAssign` entries.
It additionally deletes the `forced` entry, within the same save. Orphans would be
harmless to read but would accumulate permanently in the stored JSON and would resurrect
if an id were ever reused.

### Modules needing no change

`js/transfer.js` reads `biweekly.assignments[id]` and continues to see the same string
values. `js/profiles.js` copies the whole `bb_biweekly` object on duplicate and copies
Subitem ids verbatim, so `forced` carries over correctly with no remapping.
`save('biweekly')` already persists the whole row, so the new key syncs with no change
to the write path. Banks and Fees are Account-level and unaffected.

## Testing Decisions

There is no test runner in this project, and adding one would mean introducing npm and a
module system to a codebase whose defining constraint is that it has no build step. The
decision is to extract the packing seam without adding tooling: the logic gets an
isolated, side-effect-free form now, and a runner can be introduced later without
touching this feature again.

A good test here would exercise only the seam's external behaviour — given Subitems,
assignments and a `forced` map, what assignments come back. It would assert nothing
about how the function iterates, what it names its variables, or how many passes it
makes, and it would never reach into `S` or the DOM.

The cases that matter, and that must be verified manually in the browser until a runner
exists:

1. Nothing Force Assigned — the result matches today's Auto-Suggest exactly, so the
   change is a no-op for existing behaviour.
2. One Subitem Force Assigned to Cutoff 1 — it stays, and the free Subitems balance
   against a non-zero starting total on that side.
3. A Subitem Force Assigned to Both — it stays `both`, and half its amount is seeded into
   each cutoff.
4. Force Assigned Subitems exceeding Half Pay on one side — they are all kept, every free
   Subitem lands on the other side, and Remaining shows red.
5. Every Subitem Force Assigned — the returned assignments equal the input assignments.
6. No Subitems at all — no error; the Biweekly tab already renders its empty state before
   the button exists.
7. A Force Assigned Subitem with no assignment — treated as free, not crashed on.

Alongside those, the interaction paths to walk through in the browser: ticking and
unticking; the checkbox disabled on Unassigned; moving a Force Assigned Subitem between
cutoffs and confirming the tick survives; setting one to Unassigned and confirming the
tick clears; deleting a Force Assigned Subitem; duplicating a Profile and confirming the
Force Assignments came with it; switching Profiles and confirming they stay separate;
and opening a Profile saved before this feature to confirm it loads with nothing Force
Assigned and can be Force Assigned without error.

There is no prior art for automated tests in this codebase — this seam is the first
piece of logic deliberately shaped to be testable.

## Out of Scope

- **Teaching Auto-Suggest to emit `both`.** It has never done so and will not start here.
  Splitting an oversized Subitem across cutoffs is a separate algorithm change.
- **Force Assign as an exclusion.** Ticking Force on an Unassigned Subitem to mean "leave
  this out of the pay period entirely" is a genuinely useful and genuinely different
  feature. It would make an empty checkbox mean two things, so the checkbox is disabled
  on Unassigned instead.
- **Bulk clear.** No "release all" affordance; Force Assignments are released one at a
  time.
- **Warning or blocking when Force Assignments exceed Half Pay.** The existing red
  Remaining is the report.
- **A test runner, npm, or a module system.** See Testing Decisions.
- **Any change to the Transfer, Banks or Overview algorithms.** Overview is touched only
  for the one-line deletion cleanup.
- **Force Assign at the Account level or shared across Profiles.** It is per-Profile, like
  every other Subitem-keyed thing.

## Further Notes

The migration story is deliberately nil. Every existing `bb_biweekly` row stays valid,
reads as "nothing Force Assigned", and gains its empty map the first time it is
hydrated. Nothing needs to be backfilled in Supabase and no deploy ordering matters.

The hydration guard is the one piece with a real failure mode if skipped: the default in
the state module covers new Profiles only, because a loaded row replaces the default
object entirely. Without the guard, any Profile saved before this feature throws on the
first tick of the checkbox. This is worth a comment in the code, because it looks
redundant next to the default and invites removal.

The padlock appears in three places — the column header, each Force Assigned row's
context in the Cutoff panels, and conceptually in the tooltip's wording. Keeping the same
icon across all of them is what makes the feature legible without a legend.
