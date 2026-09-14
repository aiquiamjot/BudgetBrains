# Unassigned Subitems are unfunded

An unassigned Subitem — one with no Cutoff in its Cutoff Plan `assignments` map —
contributes nothing to either Cutoff's Transfer needs. The Transfer tab computes each
Bank's needs per Cutoff purely through `CutoffPlan.amountIn`, which returns `0` for an
unassigned Subitem. `'both'` still contributes half its amount to each Cutoff.

This deliberately reverses the previous rule, under which `js/transfer.js` treated an
unassigned Subitem the same as `'both'` — half its amount counted toward each Cutoff.
The Biweekly tab, via `CutoffPlan.itemsIn`/`totals`, already counted an unassigned
Subitem toward neither. The two tabs disagreed on what an unassigned Subitem meant, and
the Transfer tab's half-and-half reading moved money in a planned Transfer that the
Biweekly tab's own totals gave no sign of needing — silently, since nothing in either
tab flagged the mismatch.

## Consequences

- The Transfer tab now agrees with the Biweekly tab: unassigned means "not yet placed
  in either Cutoff," full stop, not a hidden third position worth half of each.
- An unassigned Subitem whose Bank assignment is a registered Bank other than the
  Salary source would previously have generated a Transfer; now it generates none,
  and its amount simply sits unmoved in whatever Bank the person assigned it to. That
  silence is the risk this reverses one silence for — so the Optimal Transfer Sequence
  card carries a warning line naming exactly those Subitems, pointing at the Biweekly
  tab as the fix. No warning is needed for Subitems assigned to Cash, to the Salary
  source (money already lands there, no Transfer was ever implied), or to no Bank at
  all (no Transfer was ever implied either).
- The warning reads through `CutoffPlan.unassigned`, so it shares the same definition
  of "unassigned" as the needs calculation and cannot drift from it.
