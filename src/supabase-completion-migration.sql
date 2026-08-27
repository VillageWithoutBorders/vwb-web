-- =============================================
-- VWB Task Completion Migration
-- Run this in your Supabase SQL Editor
-- =============================================

-- 1. Add confirmation columns to skill_matches
ALTER TABLE skill_matches
  ADD COLUMN IF NOT EXISTS requester_confirmed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS helper_confirmed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- 2. Allow requesters to update matches on their requests
DROP POLICY IF EXISTS "matches_update_helper" ON skill_matches;
DROP POLICY IF EXISTS "matches_update" ON skill_matches;
CREATE POLICY "matches_update" ON skill_matches FOR UPDATE USING (
  auth.uid() = helper_id
  OR auth.uid() IN (
    SELECT requester_id FROM help_requests WHERE id = request_id
  )
);
