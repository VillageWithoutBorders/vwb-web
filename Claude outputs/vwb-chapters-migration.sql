-- VWB: Chapters (regional Campfire rooms) — Sep 17, 2026
-- Run this whole thing in the Supabase SQL editor.

-- 1. Chapters table: named local communities the app can operate multiple of.
create table chapters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region_label text,
  slug text unique not null,
  active boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

-- Seed the one chapter that already exists today. Everyone currently in the
-- app gets backfilled into this one below, so nothing breaks for them.
insert into chapters (name, region_label, slug, is_default)
values ('Northwest Georgia', 'Chattanooga Valley, GA', 'nwga', true);

-- 2. Tie each profile to a chapter, backfill existing users to the seed chapter.
alter table helper_profiles add column chapter_id uuid references chapters(id);
update helper_profiles
set chapter_id = (select id from chapters where slug = 'nwga')
where chapter_id is null;

-- 3. Tie each Campfire message to a chapter, backfill existing messages too.
alter table campfire_messages add column chapter_id uuid references chapters(id);
update campfire_messages
set chapter_id = (select id from chapters where slug = 'nwga')
where chapter_id is null;

-- 4. RLS on the new chapters table.
alter table chapters enable row level security;

create policy "Anyone signed in can view active chapters"
on chapters for select
using (
  active = true
  or exists (select 1 from helper_profiles where user_id = auth.uid() and role in ('admin', 'founder'))
);

create policy "Admins and founders manage chapters"
on chapters for insert
with check (exists (select 1 from helper_profiles where user_id = auth.uid() and role in ('admin', 'founder')));

create policy "Admins and founders update chapters"
on chapters for update
using (exists (select 1 from helper_profiles where user_id = auth.uid() and role in ('admin', 'founder')));

-- 5. campfire_messages RLS: still open. The app now filters by chapter_id
-- client-side, but that's not a real boundary on its own (same caveat as the
-- vouching gate a few days ago) -- see the note below before this is done.
