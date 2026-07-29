# Bootstrap the default Profile in the client, not in a migration script

A brand-new Account has no Profiles, so the client must be able to mint one on load
regardless. That is the same state an existing Account is left in by ADR-0001: per-Profile
keys stranded on the `'account'` sentinel and no `bb_profiles` row. Rather than write a
one-off SQL `UPDATE` for the second case, one client-side step covers both — when
`bb_profiles` is missing, create a Profile named "Main" and adopt any per-Profile keys
found on the sentinel into it.

## Consequences

- Signup and migration share a code path, so the migration cannot rot from disuse.
- It stays correct if an old backup is restored or a stale device signs in later, which a
  one-shot `UPDATE` would not.
- There is no flag day. The `ALTER TABLE` can be run before or after the client deploys.
- The cost is a permanent branch in the load path that will almost never fire again.
  It is deliberate: it is the same branch new signups take, not dead migration code.
