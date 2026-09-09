-- =============================================
-- Merge duplicate conversations with the same person
-- Village Without Borders
-- =============================================
-- Problem: some pairs of neighbors ended up with more than one row in
-- `conversations` (created by separate help requests/offers/events before
-- conversations were reused). This script keeps only the most recently
-- active conversation per pair of people and deletes the rest, along with
-- their messages and per-user settings.
--
-- Message history in the deleted conversations is NOT preserved (per
-- Jade's OK -- the old messages don't need to be saved).
--
-- HOW TO RUN THIS in the Supabase SQL editor:
--   1. Run the PREVIEW query below by itself first. It's read-only and
--      just shows you which conversations would be kept vs. deleted.
--   2. If that looks right, run the whole ACTUAL MERGE block (BEGIN
--      through COMMIT) together, as one query.
--   3. If anything looks wrong after the DELETE counts print out, run
--      ROLLBACK; instead of COMMIT; and nothing will have changed.
--
-- Already run once in production on 2026-09-09 (merged the "Carrie"
-- duplicate threads plus two other duplicate pairs, 4 conversations
-- total). Kept here so the fix is in the repo, not just the SQL editor
-- history, in case duplicates show up again.
-- =============================================


-- ---------- STEP 1: PREVIEW (safe, read-only, run this alone first) ----------
WITH pair_key AS (
  SELECT
    id,
    LEAST(helper_id, requester_id)    AS user_a,
    GREATEST(helper_id, requester_id) AS user_b,
    created_at
  FROM conversations
),
activity AS (
  SELECT
    pk.id, pk.user_a, pk.user_b,
    COALESCE(MAX(cm.created_at), pk.created_at) AS last_activity
  FROM pair_key pk
  LEFT JOIN chat_messages cm ON cm.conversation_id = pk.id
  GROUP BY pk.id, pk.user_a, pk.user_b, pk.created_at
),
ranked AS (
  SELECT
    id, user_a, user_b, last_activity,
    ROW_NUMBER() OVER (PARTITION BY user_a, user_b ORDER BY last_activity DESC, id DESC) AS rn
  FROM activity
)
SELECT
  r.user_a, r.user_b, r.id AS conversation_id, r.last_activity,
  CASE WHEN r.rn = 1 THEN 'KEEP (survivor)' ELSE 'DELETE' END AS action
FROM ranked r
WHERE (r.user_a, r.user_b) IN (
  SELECT user_a, user_b FROM ranked GROUP BY user_a, user_b HAVING COUNT(*) > 1
)
ORDER BY r.user_a, r.user_b, r.rn;


-- ---------- STEP 2: ACTUAL MERGE (destructive -- run as one block) ----------
BEGIN;

DROP TABLE IF EXISTS _dupe_convos;

CREATE TEMP TABLE _dupe_convos AS
WITH pair_key AS (
  SELECT
    id,
    LEAST(helper_id, requester_id)    AS user_a,
    GREATEST(helper_id, requester_id) AS user_b,
    created_at
  FROM conversations
),
activity AS (
  SELECT
    pk.id, pk.user_a, pk.user_b,
    COALESCE(MAX(cm.created_at), pk.created_at) AS last_activity
  FROM pair_key pk
  LEFT JOIN chat_messages cm ON cm.conversation_id = pk.id
  GROUP BY pk.id, pk.user_a, pk.user_b, pk.created_at
),
ranked AS (
  SELECT
    id, user_a, user_b, last_activity,
    ROW_NUMBER() OVER (PARTITION BY user_a, user_b ORDER BY last_activity DESC, id DESC) AS rn
  FROM activity
)
SELECT id
FROM ranked
WHERE rn > 1;

-- Sanity check: how many conversations are about to be deleted?
-- (Compare this number to the "DELETE" rows in the preview above.)
SELECT COUNT(*) AS conversations_to_delete FROM _dupe_convos;

-- Remove anything that references the duplicate conversations first, then
-- the conversations themselves -- these tables aren't guaranteed to
-- cascade-delete, so we clear them out in dependency order.
DELETE FROM message_deletions
WHERE message_id IN (
  SELECT id FROM chat_messages WHERE conversation_id IN (SELECT id FROM _dupe_convos)
);

DELETE FROM chat_messages
WHERE conversation_id IN (SELECT id FROM _dupe_convos);

DELETE FROM conversation_user_settings
WHERE conversation_id IN (SELECT id FROM _dupe_convos);

DELETE FROM conversation_folder_assignments
WHERE conversation_id IN (SELECT id FROM _dupe_convos);

DELETE FROM conversations
WHERE id IN (SELECT id FROM _dupe_convos);

DROP TABLE _dupe_convos;

-- Look at the "conversations_to_delete" count and the DELETE row counts
-- Supabase prints for each statement above. If they line up with what the
-- preview showed, commit. Otherwise roll back and nothing changes.
COMMIT;
-- ROLLBACK;
