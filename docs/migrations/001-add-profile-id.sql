-- Adds Profile scoping to user_data. See docs/adr/0001-profile-id-column-with-account-sentinel.md
--
-- Run this in the Supabase SQL editor BEFORE deploying the client that knows about
-- Profiles. The new client sends profile_id on every upsert; without the column those
-- writes fail. The old client ignores the column entirely, so running this early is safe.
--
-- Existing rows land on 'account'. They are NOT moved to a real Profile here — the client
-- adopts them on first load (ADR-0002).

begin;

-- 1. The column. NOT NULL DEFAULT backfills every existing row in the same statement.
alter table public.user_data
  add column if not exists profile_id text not null default 'account';

-- 2. Drop whatever currently enforces uniqueness on exactly (user_id, key) — it may be
--    the primary key or a unique constraint, and its generated name varies. Matching on
--    the column set rather than the name avoids guessing.
do $$
declare
  target text;
begin
  select c.conname into target
  from pg_constraint c
  where c.conrelid = 'public.user_data'::regclass
    and c.contype in ('p', 'u')
    and (
      select array_agg(a.attname order by a.attname)
      from unnest(c.conkey) k
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
    ) = array['key', 'user_id']
  limit 1;

  if target is not null then
    execute format('alter table public.user_data drop constraint %I', target);
  end if;
end $$;

-- 3. Uniqueness on the triple. This is what onConflict: 'user_id,profile_id,key' targets.
alter table public.user_data
  add constraint user_data_user_profile_key_uniq unique (user_id, profile_id, key);

commit;

-- Row-level security needs no change: existing policies filter on user_id, and a new
-- column does not widen them.
--
-- Verify:
--   select profile_id, key from public.user_data order by profile_id, key;
-- Every row should read 'account' at this point.
