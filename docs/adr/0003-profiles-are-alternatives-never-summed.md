# Profiles are alternatives, never summed

An Account can hold several Profiles, but exactly one is Active and it alone describes
the person's real budget. The app never aggregates across Profiles and offers no
combined view. Profiles model "my budget if I take the raise" — not "my salary budget
plus my freelance budget."

## Consequences

- Nothing in the Transfer tab changes. If Profiles coexisted, two of them could each
  assign Subitems to the same Bank, and the true amount to move would be the sum — so
  transfer sequencing, fee optimisation and free-transfer quotas would all have to run
  over the union of every Profile.
- The free-transfer quota is the specific reason this is hard to undo. A quota is a real
  monthly limit on a Bank's outgoing transfers, and there is no obviously correct way to
  divide one across several simultaneously-real Profiles. Getting it wrong costs real
  fees.
- Coexistence can be added later; it cannot easily be removed. Every total in the app
  would grow a permanent "this Profile / all Profiles" toggle.
- Someone with genuinely separate income streams must model them as Subitems inside one
  Profile and loses the ability to view them apart. That is accepted.
