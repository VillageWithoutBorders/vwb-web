-- VWB: Villages (regional Campfire rooms) — Sep 17, 2026
-- Replaces the earlier "chapters" draft — renamed to "villages" to match
-- the app's own name and framing. Nothing from the old draft was ever run,
-- so this is a clean start, no cleanup needed.
-- Run this whole thing in the Supabase SQL editor.

-- 1. Villages table: named local communities the app can operate multiple of.
create table villages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region_label text,
  slug text unique not null,
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- Seed the one village that already exists today. Everyone currently in the
-- app gets backfilled into this one below, so nothing breaks for them.
insert into villages (name, region_label, slug, is_default)
values ('Northwest Georgia', 'Chattanooga Valley, GA', 'nwga', true);

-- 2. Tie each profile to a village, backfill existing users to the seed village.
alter table helper_profiles add column village_id uuid references villages(id);
update helper_profiles
set village_id = (select id from villages where slug = 'nwga')
where village_id is null;

-- 3. Tie each Campfire message to a village, backfill existing messages too.
alter table campfire_messages add column village_id uuid references villages(id);
update campfire_messages
set village_id = (select id from villages where slug = 'nwga')
where village_id is null;

-- 4. RLS on the new villages table.
alter table villages enable row level security;

create policy "Anyone signed in can view active villages"
on villages for select
using (
  active = true
  or exists (select 1 from helper_profiles where user_id = auth.uid() and role in ('admin', 'founder'))
);

create policy "Admins and founders manage villages"
on villages for insert
with check (exists (select 1 from helper_profiles where user_id = auth.uid() and role in ('admin', 'founder')));

create policy "Admins and founders update villages"
on villages for update
using (exists (select 1 from helper_profiles where user_id = auth.uid() and role in ('admin', 'founder')));

-- 5. campfire_messages RLS: layer village scoping on top of the existing
-- membership check (already confirmed from the live policies: an
-- ambassador or an admin/founder). Ambassadors are locked to their own
-- village; admins/founders can read and post in any village, matching the
-- switcher built into Campfire's header for them.
drop policy if exists "campfire_read" on campfire_messages;

create policy "campfire_read"
on campfire_messages for select
using (
  exists (
    select 1 from helper_profiles hp
    where hp.user_id = auth.uid()
    and (
      (hp.is_hope_ambassador = true and hp.village_id = campfire_messages.village_id)
      or hp.role = any (array['admin'::user_role, 'founder'::user_role])
    )
  )
);

drop policy if exists "campfire_insert" on campfire_messages;

create policy "campfire_insert"
on campfire_messages for insert
with check (
  auth.uid() = user_id
  and exists (
    select 1 from helper_profiles hp
    where hp.user_id = auth.uid()
    and (
      (hp.is_hope_ambassador = true and hp.village_id = campfire_messages.village_id)
      or hp.role = any (array['admin'::user_role, 'founder'::user_role])
    )
  )
);

-- campfire_pin_update is untouched — admin-only pin toggling, unrelated to villages.
