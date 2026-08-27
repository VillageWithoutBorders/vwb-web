-- =============================================
-- Village Without Borders: Complete Schema
-- Supabase project: jgabhhobqkuteuqtikpi.supabase.co
-- Last updated: August 2026
--
-- DO NOT re-run this if your database is already set up.
-- This file is a reference copy of the full schema.
-- =============================================


-- =============================================
-- 1. ENUMS
-- =============================================

CREATE TYPE user_role AS ENUM ('member', 'organizer', 'admin');
CREATE TYPE skill_type AS ENUM ('offer', 'need');
CREATE TYPE urgency_level AS ENUM ('now', 'today', 'this_week', 'flexible');
CREATE TYPE help_request_status AS ENUM ('open', 'matched', 'in_progress', 'completed', 'cancelled');
CREATE TYPE verification_status AS ENUM ('unverified', 'vouched', 'verified');
CREATE TYPE safety_alert_type AS ENUM ('flag', 'block', 'safety_check', 'emergency');


-- =============================================
-- 2. TABLES
-- =============================================

-- Profiles (created on first login, not signup)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  zip_code TEXT,
  neighborhood TEXT,
  skills TEXT[],
  is_hope_ambassador BOOLEAN DEFAULT false,
  radius_miles NUMERIC DEFAULT 10,
  role user_role DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Skill categories (database-driven, not hardcoded)
CREATE TABLE skill_categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed the 10 mutual aid categories
INSERT INTO skill_categories (name, sort_order) VALUES
  ('Home Repair', 1),
  ('Storm and Flood Recovery', 2),
  ('Tree and Yard Work', 3),
  ('Transportation', 4),
  ('Food and Meals', 5),
  ('Childcare', 6),
  ('Pet Care', 7),
  ('Paperwork and Benefits', 8),
  ('Tech Help', 9),
  ('Translation', 10);

-- Helper profiles (extended info for Hope Ambassadors)
CREATE TABLE helper_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  skills TEXT[],
  availability TEXT,
  interests TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  radius_miles NUMERIC DEFAULT 10,
  is_available BOOLEAN DEFAULT true,
  verification verification_status DEFAULT 'unverified',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Help requests
CREATE TABLE help_requests (
  id BIGSERIAL PRIMARY KEY,
  requester_id UUID REFERENCES auth.users ON DELETE CASCADE,
  neighborhood TEXT,
  skill_needed TEXT,
  description TEXT,
  urgency urgency_level DEFAULT 'flexible',
  status help_request_status DEFAULT 'open',
  latitude NUMERIC,
  longitude NUMERIC,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Skill matches
CREATE TABLE skill_matches (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT REFERENCES help_requests ON DELETE CASCADE,
  helper_id UUID REFERENCES auth.users ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Vouches (community trust system)
CREATE TABLE vouches (
  id BIGSERIAL PRIMARY KEY,
  voucher_id UUID REFERENCES auth.users ON DELETE CASCADE,
  vouchee_id UUID REFERENCES auth.users ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(voucher_id, vouchee_id)
);

-- Safety alerts
CREATE TABLE safety_alerts (
  id BIGSERIAL PRIMARY KEY,
  reporter_id UUID REFERENCES auth.users ON DELETE CASCADE,
  reported_user_id UUID REFERENCES auth.users,
  alert_type safety_alert_type NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Categories and tags (for projects)
CREATE TABLE categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE tags (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Projects
CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category_id BIGINT REFERENCES categories,
  created_by UUID REFERENCES auth.users ON DELETE SET NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE projects_tags (
  project_id BIGINT REFERENCES projects ON DELETE CASCADE,
  tag_id BIGINT REFERENCES tags ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);

CREATE TABLE project_tasks (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT REFERENCES projects ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES auth.users ON DELETE SET NULL,
  status TEXT DEFAULT 'todo',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Messaging
CREATE TABLE conversations (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT REFERENCES help_requests,
  participant_a UUID REFERENCES auth.users ON DELETE CASCADE,
  participant_b UUID REFERENCES auth.users ON DELETE CASCADE,
  contact_shared_a BOOLEAN DEFAULT false,
  contact_shared_b BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT REFERENCES conversations ON DELETE CASCADE,
  sender_id UUID REFERENCES auth.users ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE flags (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT REFERENCES conversations ON DELETE CASCADE,
  reporter_id UUID REFERENCES auth.users ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE blocks (
  id BIGSERIAL PRIMARY KEY,
  blocker_id UUID REFERENCES auth.users ON DELETE CASCADE,
  blocked_id UUID REFERENCES auth.users ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);


-- =============================================
-- 3. TRIGGERS
-- =============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON helper_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON help_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON skill_matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Round location for privacy (2 decimal places)
CREATE OR REPLACE FUNCTION round_location()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL THEN
    NEW.latitude = ROUND(NEW.latitude::NUMERIC, 2);
  END IF;
  IF NEW.longitude IS NOT NULL THEN
    NEW.longitude = ROUND(NEW.longitude::NUMERIC, 2);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER round_help_request_location
  BEFORE INSERT OR UPDATE ON help_requests
  FOR EACH ROW EXECUTE FUNCTION round_location();

CREATE TRIGGER round_helper_profile_location
  BEFORE INSERT OR UPDATE ON helper_profiles
  FOR EACH ROW EXECUTE FUNCTION round_location();


-- =============================================
-- 4. FUNCTIONS
-- =============================================

-- Geofenced matching: returns open requests within a helper's radius
-- sorted by urgency, then distance, then newest
CREATE OR REPLACE FUNCTION nearby_matching_requests(
  helper_lat NUMERIC,
  helper_lng NUMERIC,
  helper_radius NUMERIC DEFAULT 10,
  helper_skills TEXT[] DEFAULT '{}'
)
RETURNS TABLE (
  id BIGINT,
  requester_id UUID,
  requester_name TEXT,
  neighborhood TEXT,
  skill_needed TEXT,
  description TEXT,
  urgency urgency_level,
  status help_request_status,
  distance_miles NUMERIC,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    hr.id,
    hr.requester_id,
    hp.display_name AS requester_name,
    hr.neighborhood,
    hr.skill_needed,
    hr.description,
    hr.urgency,
    hr.status,
    ROUND(
      3959 * ACOS(
        LEAST(1, GREATEST(-1,
          COS(RADIANS(helper_lat)) * COS(RADIANS(hr.latitude))
          * COS(RADIANS(hr.longitude) - RADIANS(helper_lng))
          + SIN(RADIANS(helper_lat)) * SIN(RADIANS(hr.latitude))
        ))
      )::NUMERIC,
      1
    ) AS distance_miles,
    hr.created_at
  FROM help_requests hr
  LEFT JOIN helper_profiles hp ON hp.user_id = hr.requester_id
  WHERE hr.status = 'open'
    AND hr.latitude IS NOT NULL
    AND hr.longitude IS NOT NULL
    AND (
      3959 * ACOS(
        LEAST(1, GREATEST(-1,
          COS(RADIANS(helper_lat)) * COS(RADIANS(hr.latitude))
          * COS(RADIANS(hr.longitude) - RADIANS(helper_lng))
          + SIN(RADIANS(helper_lat)) * SIN(RADIANS(hr.latitude))
        ))
      )
    ) <= helper_radius
    AND (
      CARDINALITY(helper_skills) = 0
      OR hr.skill_needed = ANY(helper_skills)
    )
  ORDER BY
    CASE hr.urgency
      WHEN 'now' THEN 0
      WHEN 'today' THEN 1
      WHEN 'this_week' THEN 2
      WHEN 'flexible' THEN 3
    END,
    distance_miles ASC,
    hr.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION nearby_matching_requests TO authenticated;


-- =============================================
-- 5. VIEWS
-- =============================================

-- Vouch counts per user
CREATE OR REPLACE VIEW vouch_counts AS
  SELECT
    vouchee_id AS user_id,
    COUNT(*) AS vouch_count
  FROM vouches
  GROUP BY vouchee_id;

GRANT SELECT ON vouch_counts TO authenticated;

-- Help request feed (all requests, no geofence)
CREATE OR REPLACE VIEW help_request_feed AS
  SELECT
    hr.id,
    hr.requester_id,
    hp.display_name AS requester_name,
    hr.neighborhood,
    hr.skill_needed,
    hr.description,
    hr.urgency,
    hr.status,
    hr.latitude,
    hr.longitude,
    hr.created_at
  FROM help_requests hr
  LEFT JOIN helper_profiles hp ON hp.user_id = hr.requester_id
  WHERE hr.archived_at IS NULL
  ORDER BY hr.created_at DESC;

GRANT SELECT ON help_request_feed TO authenticated;

-- Open requests sorted by urgency (fallback for no-location users)
CREATE OR REPLACE VIEW open_requests_by_urgency AS
  SELECT
    hr.id,
    hr.requester_id,
    hp.display_name AS requester_name,
    hr.neighborhood,
    hr.skill_needed,
    hr.description,
    hr.urgency,
    hr.status,
    hr.created_at
  FROM help_requests hr
  LEFT JOIN helper_profiles hp ON hp.user_id = hr.requester_id
  WHERE hr.status = 'open'
  ORDER BY
    CASE hr.urgency
      WHEN 'now' THEN 0
      WHEN 'today' THEN 1
      WHEN 'this_week' THEN 2
      WHEN 'flexible' THEN 3
    END,
    hr.created_at DESC;

GRANT SELECT ON open_requests_by_urgency TO authenticated;


-- =============================================
-- 6. ROW LEVEL SECURITY
-- =============================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE helper_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE help_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouches ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, update own
CREATE POLICY "profiles_read" ON profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Helper profiles: users can read all, update own
CREATE POLICY "helper_read" ON helper_profiles FOR SELECT USING (true);
CREATE POLICY "helper_insert" ON helper_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "helper_update" ON helper_profiles FOR UPDATE USING (auth.uid() = user_id);

-- Help requests: anyone can read open, owner can update
CREATE POLICY "requests_read" ON help_requests FOR SELECT USING (true);
CREATE POLICY "requests_insert" ON help_requests FOR INSERT WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "requests_update" ON help_requests FOR UPDATE USING (auth.uid() = requester_id);

-- Skill matches: participants can read
CREATE POLICY "matches_read" ON skill_matches FOR SELECT USING (auth.uid() = helper_id OR auth.uid() IN (SELECT requester_id FROM help_requests WHERE id = request_id));
CREATE POLICY "matches_insert" ON skill_matches FOR INSERT WITH CHECK (auth.uid() = helper_id);

-- Vouches: anyone can read, authenticated can create
CREATE POLICY "vouches_read" ON vouches FOR SELECT USING (true);
CREATE POLICY "vouches_insert" ON vouches FOR INSERT WITH CHECK (auth.uid() = voucher_id AND auth.uid() != vouchee_id);

-- Safety alerts: only reporter and admin
CREATE POLICY "alerts_insert" ON safety_alerts FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "alerts_read" ON safety_alerts FOR SELECT USING (auth.uid() = reporter_id);

-- Conversations: participants only
CREATE POLICY "convos_read" ON conversations FOR SELECT USING (auth.uid() IN (participant_a, participant_b));
CREATE POLICY "convos_insert" ON conversations FOR INSERT WITH CHECK (auth.uid() IN (participant_a, participant_b));
CREATE POLICY "convos_update" ON conversations FOR UPDATE USING (auth.uid() IN (participant_a, participant_b));

-- Messages: conversation participants only
CREATE POLICY "messages_read" ON messages FOR SELECT USING (
  conversation_id IN (SELECT id FROM conversations WHERE auth.uid() IN (participant_a, participant_b))
);
CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (
  auth.uid() = sender_id AND conversation_id IN (SELECT id FROM conversations WHERE auth.uid() IN (participant_a, participant_b))
);

-- Flags: reporter can create and read own
CREATE POLICY "flags_insert" ON flags FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "flags_read" ON flags FOR SELECT USING (auth.uid() = reporter_id);

-- Blocks: blocker can manage
CREATE POLICY "blocks_insert" ON blocks FOR INSERT WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "blocks_read" ON blocks FOR SELECT USING (auth.uid() = blocker_id);
CREATE POLICY "blocks_delete" ON blocks FOR DELETE USING (auth.uid() = blocker_id);

-- Skill categories: anyone can read
ALTER TABLE skill_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "skill_cats_read" ON skill_categories FOR SELECT USING (true);
