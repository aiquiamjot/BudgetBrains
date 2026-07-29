# Banks and Fees belong to the Account, not the Profile

`bb_banks` and `bb_fees` are Account-level and shared by every Profile. Everything keyed
to a Subitem — `bb_overview`, `bb_biweekly`, `bb_bankAssign`, `bb_manual` — is per-Profile.
The line is drawn where the reference arrows are: Banks and Fees describe accounts the
person actually holds and prices that do not change with income, while Subitems and their
assignments describe one plan.

## Consequences

- Scoping Banks per-Profile instead would mean re-registering every bank and re-entering
  the whole route-fee matrix for each Profile, where the real-world values are identical
  and would only drift apart.
- Scoping them per-Profile is also expensive to switch to later, because the shared rows
  would have to be fanned out and thereafter maintained in parallel by hand.
- Free-transfer quotas live on the Bank object, not in `bb_fees`, so they are
  Account-level too. They are configuration only — nothing tracks consumption.
- `deleteBank()` must strip the bank from the `bankAssign` of **every** Profile, not just
  the Active one. Cascading only over the Active Profile leaves other Profiles pointing at
  a Bank that no longer exists, and the Transfer tab will route to it.
- The salary source stays `banks[0]` and is therefore Account-level. A Profile modelling a
  different employer will plan transfers out of the wrong bank. Accepted as out of scope;
  the fix is to move the salary source into the per-Profile `overview` state.
