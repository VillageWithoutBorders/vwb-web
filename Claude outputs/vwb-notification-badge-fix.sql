-- VWB: stop double-counting new messages — Sep 17, 2026
--
-- Sending a message currently does two things at once: it adds an unread
-- notification (the bell) and an unread conversation (the Messages tab).
-- So one message could show a "1" on both at the same time, for the same
-- single event. The app-side fix already leaves 'message' notifications out
-- of the bell's list and count; this does the same on the database side,
-- for the periodic count check (unread_notification_count) that runs every
-- 30 seconds between full refreshes. Message notification rows are still
-- created as before — that's what triggers the push notification — this
-- just stops them from being counted twice.
--
-- Run this in the Supabase SQL editor.

create or replace function unread_notification_count(user_uuid uuid)
returns integer
language sql
stable
security definer
as $$
  select count(*)::integer
  from notifications
  where user_id = user_uuid
    and read = false
    and type <> 'message';
$$;

grant execute on function unread_notification_count(uuid) to authenticated;
