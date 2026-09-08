# Village Without Borders (VWB) - Complete Project Context

You are helping Jade Michalski build and maintain Village Without Borders (VWB), a mutual aid Progressive Web App serving the Chattanooga Valley and Northwest Georgia area. The app connects neighbors who need help with Hope Ambassador volunteers who can provide it. It is in active beta with real users.

---

## 1. PROJECT OVERVIEW

**What it does:** A community safety net. Anyone can sign up and ask for help or report an emergency. Verified volunteers (Hope Ambassadors) can offer help, coordinate emergency response, and use the Campfire group chat. Admins manage the platform. The founder (Jade) has the highest-privilege role.

**Live app:** `https://app.villagewithoutborders.org`
**Marketing site:** `https://villagewithoutborders.org` (Squarespace, separate)
**GitHub repo:** `VillageWithoutBorders/vwb-web`
**Local path:** `C:\Users\Deb\Desktop\Jade HQ\2_VWB\Village Without Borders\vwb-web`

**Trust ladder (3 tiers plus founder):**
- **Neighbor** (default, `member` role): Can ask for help, offer help, report emergencies
- **Hope Ambassador** (`is_hope_ambassador = true`): Neighbors who opt in. Access to Campfire group chat, can verify emergency events, can coordinate responses
- **Admin** (`admin` role): Can manage users, approve/reject events, view reports. Invited by founder or applied for by ambassadors
- **Founder** (`founder` role): Jade only. All admin powers plus founder-exclusive features like Grant Report and inviting admins

**Jade's Supabase user ID:** `f12b2daf-c7dd-4954-a300-e52b11fe543c`

---

## 2. TECH STACK

- **Frontend:** React 18 + Vite (no TypeScript, plain JSX)
- **Backend/DB:** Supabase (project ID: `jgabhhobqkuteuqtikpi`)
- **Auth:** Supabase Auth with email confirmation
- **Hosting:** Cloudflare Pages (deploy target: `vwb-web.pages.dev`, custom domain via Squarespace CNAME)
- **PWA:** VitePWA plugin with `injectManifest` strategy (custom service worker at `src/sw.js`)
- **Push notifications:** VAPID keys + `web-push`, Supabase Edge Function (`send-push-notification`), database trigger via `pg_net`
- **Email:** Resend SMTP (`smtp.resend.com`, port 465, username `resend`, sender `noreply@villagewithoutborders.org`)
- **Avatars:** DiceBear v7 (seed-based URLs only, API rejects individual feature params)
- **Icons/assets:** PWA icons at `public/icons/` (icon-192.png, icon-512.png)
- **No TypeScript. No testing framework. No state management library (just React state + context).**

---

## 3. FOLDER STRUCTURE

```
vwb-web/
├── public/
│   ├── icons/              # PWA icons (icon-192.png, icon-512.png)
│   ├── _redirects           # Cloudflare SPA routing (/* /index.html 200)
│   └── ...
├── src/
│   ├── components/
│   │   ├── AvatarDisplay.jsx       # DiceBear avatar rendering
│   │   ├── AvailabilityPicker.jsx  # 7-day AM/PM grid picker
│   │   ├── BottomTabs.jsx          # Bottom navigation bar
│   │   ├── InstallBanner.jsx       # PWA install prompt (Android + iOS)
│   │   ├── PushBanner.jsx          # Push notification opt-in banner
│   │   ├── VouchButton.jsx         # Vouch/unvouch toggle
│   │   └── ...
│   ├── context/
│   │   └── AuthContext.jsx         # Auth state, profile, role helpers (isAdmin, isFounder)
│   ├── hooks/
│   │   ├── useNotifications.js     # In-app notification polling (30s interval)
│   │   └── useUnreadCount.js       # Unread message count polling
│   ├── pages/
│   │   ├── Login.jsx               # Sign-in/sign-up with multi-step registration
│   │   ├── Dashboard.jsx           # Home screen with action cards, emergency button, PushBanner
│   │   ├── Feed.jsx                # SkillShare feed (help requests + offers)
│   │   ├── AskForHelp.jsx          # Post a help request form
│   │   ├── ActiveTasks.jsx         # Active/Archived tabs, completion tracking
│   │   ├── Messages.jsx            # Conversations list, help offer cards, unread filter
│   │   ├── Conversation.jsx        # Individual chat thread
│   │   ├── Profile.jsx             # User profile, ambassador signup, admin application
│   │   ├── PublicProfile.jsx       # Read-only profile at /profile/:userId
│   │   ├── EmergencyEvents.jsx     # Emergency event list with pending/verified split
│   │   ├── EventDetail.jsx         # Event detail with check-ins, resources, close flow
│   │   ├── Campfire.jsx            # Group chat for ambassadors and admins
│   │   ├── Community.jsx           # Resource library with accordion categories
│   │   ├── Admin.jsx               # Admin panel (stats, users, approvals)
│   │   ├── GrantReport.jsx         # Founder-only grant report with CSV export (/admin/report)
│   │   ├── Help.jsx                # Help/FAQ page
│   │   ├── Layout.jsx              # App shell with header, bell icon, outlet
│   │   ├── Notifications.jsx       # In-app notification list with All/Unread filter
│   │   └── ...
│   ├── utils/
│   │   └── notificationHelpers.js  # createNotification() utility
│   ├── sw.js                       # Custom service worker (push handler, notification click)
│   ├── App.jsx                     # Router with ProtectedRoute/PublicRoute wrappers
│   ├── index.css                   # All app styles (single CSS file)
│   ├── main.jsx                    # Vite entry point
│   └── supabaseClient.js           # Supabase client init
├── supabase/
│   └── functions/
│       └── send-push-notification/ # Edge Function for push delivery
├── vite.config.js
├── package.json
├── .env                            # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_VAPID_PUBLIC_KEY
└── ...
```

---

## 4. ROUTING (App.jsx)

All authenticated routes are wrapped in `<ProtectedRoute>` inside `<Layout>`. Login is a `<PublicRoute>` (redirects to `/` if already logged in).

| Path | Component | Notes |
|------|-----------|-------|
| `/login` | Login.jsx | Public only |
| `/` | Dashboard.jsx | Home screen |
| `/skillshare` | Feed.jsx | Help requests and offers feed |
| `/ask` | AskForHelp.jsx | Post a help request |
| `/tasks` | ActiveTasks.jsx | Active/Archived task tracking |
| `/messages` | Messages.jsx | Conversation list |
| `/messages/:conversationId` | Conversation.jsx | Individual chat |
| `/profile` | Profile.jsx | Own profile |
| `/profile/:userId` | PublicProfile.jsx | Public profile view |
| `/emergency` | EmergencyEvents.jsx | Emergency event list |
| `/emergency/:eventId` | EventDetail.jsx | Event detail |
| `/campfire` | Campfire.jsx | Ambassador/admin group chat |
| `/community` | Community.jsx | Resource library |
| `/admin` | Admin.jsx | Admin panel |
| `/admin/report` | GrantReport.jsx | Founder-only grant report |
| `/notifications` | Notifications.jsx | In-app notifications |
| `/help` | Help.jsx | FAQ |
| `*` | Redirects to `/` | Catch-all |

---

## 5. DATABASE SCHEMA

### Enums

```sql
user_role: 'member', 'organizer', 'admin', 'founder'
skill_type: 'offer', 'need'
urgency_level: 'now', 'today', 'this_week', 'flexible'
help_request_status: 'open', 'matched', 'in_progress', 'completed', 'cancelled'
verification_status: 'unverified', 'vouched', 'verified'
safety_alert_type: 'flag', 'block', 'safety_check', 'emergency'
```

### Core Tables

**helper_profiles** (this is the main user profile table, NOT `profiles`)
- `id` BIGSERIAL PK
- `user_id` UUID (references auth.users)
- `display_name` TEXT
- `skills` TEXT[]
- `availability` TEXT (JSON string from AvailabilityPicker)
- `interests` TEXT
- `latitude` NUMERIC (rounded to 2 decimal places by trigger)
- `longitude` NUMERIC (rounded to 2 decimal places by trigger)
- `radius_miles` NUMERIC (default 10)
- `is_available` BOOLEAN (default true)
- `verification` verification_status (default 'unverified')
- `avatar_url` TEXT (DiceBear seed URL)
- `avatar_config` JSONB
- `created_at`, `updated_at` TIMESTAMPTZ

**IMPORTANT:** The schema SQL file shows a `profiles` table but the app primarily uses `helper_profiles`. All Supabase queries should use `supabase.from('helper_profiles')` and filter by `user_id`, NOT `id`. This was a source of bugs when code referenced `profiles` instead.

**help_requests**
- `id` BIGSERIAL PK
- `requester_id` UUID
- `neighborhood` TEXT
- `skill_needed` TEXT (matches skill_categories.name)
- `description` TEXT
- `urgency` urgency_level
- `status` help_request_status
- `max_helpers` INTEGER (default 1, null = unlimited)
- `latitude`, `longitude` NUMERIC (rounded by trigger, null = no location)
- `archived_at` TIMESTAMPTZ (soft delete)
- `created_at`, `updated_at`

**skill_matches** (links helpers to requests)
- `id` BIGSERIAL PK
- `request_id` BIGINT (references help_requests)
- `helper_id` UUID
- `status` TEXT (default 'pending')
- `accepted` BOOLEAN (null = pending, true = accepted, false = declined)
- `helper_completed` BOOLEAN (default false)
- `requester_completed` BOOLEAN (default false)
- `created_at`, `updated_at`

**skill_categories** (database-driven, 10 categories)
- `id`, `name` (UNIQUE), `description`, `icon`, `sort_order`, `created_at`
- Categories: Home Repair, Storm and Flood Recovery, Tree and Yard Work, Transportation, Food and Meals, Childcare, Pet Care, Paperwork and Benefits, Tech Help, Translation
- Query with `.select('name')` NOT `.select('title')`

**conversations** (1:1 messaging)
- `id` BIGSERIAL PK
- `request_id` BIGINT (nullable, links to help request)
- `participant_a`, `participant_b` UUID
- `contact_shared_a`, `contact_shared_b` BOOLEAN
- `last_read_helper`, `last_read_requester` TIMESTAMPTZ (for unread tracking)
- `created_at`

**messages**
- `id`, `conversation_id`, `sender_id`, `body`, `created_at`

**message_deletions** (per-message soft delete tracking)

**campfire_messages** (group chat for ambassadors/admins)
- Separate from conversations/messages tables
- RLS restricts to users where `is_hope_ambassador = true` OR role in ('admin', 'founder')

**emergency_events**
- `id`, `reporter_id`, `title`, `description`, `event_type`, `latitude`, `longitude`
- `is_verified` BOOLEAN, `verification_count` INTEGER (threshold: 2 for auto-verify)
- `resolved_at` TIMESTAMPTZ, `close_reason` TEXT
- `merged_into_event_id` BIGINT (for duplicate merging)
- `created_at`

**event_signups** (who signed up to help)
- `event_id`, `user_id`, `role` TEXT, `created_at`

**event_check_ins** (status tracking during events)
- `event_id`, `user_id`, `status` ('safe', 'evacuated', 'sheltering', 'needs_help')

**event_resources** (need/offer/claim/fulfill flow)
- `event_id`, `user_id`, `type` ('need'/'offer'), `category`, `description`
- `claimed_by` UUID, `fulfilled` BOOLEAN

**vouches** (community trust, one per pair)
- `voucher_id`, `vouchee_id`, `note`, `created_at`
- UNIQUE(voucher_id, vouchee_id)

**notifications** (in-app)
- `id`, `user_id`, `type`, `title`, `body`, `link`, `is_read`, `created_at`
- Insert trigger fires `send-push-notification` Edge Function via `pg_net`

**push_subscriptions** (browser push endpoints)
- `id`, `user_id`, `endpoint`, `keys` JSONB, `created_at`

**admin_applications** (Hope Ambassadors applying/being invited to admin)
- `user_id`, `status` ('pending', 'approved', 'declined'), `type` ('application', 'invitation')
- `created_at`

**safety_alerts, flags, blocks** (safety system)

**feedback** (user feedback submissions)

### Key SQL Functions

- `nearby_matching_requests(helper_lat, helper_lng, helper_radius, helper_skills)` - Haversine geofencing, returns open requests sorted by urgency then distance then newest. SECURITY DEFINER.
- `unread_conversation_count(uid)` - Returns count of conversations with unread messages
- `nearest_admin(lat, lng)` - Returns closest admin by geolocation (Haversine)

### Key Views

- `help_request_feed` - All non-archived requests with requester display name
- `open_requests_by_urgency` - Open requests sorted by urgency (fallback for no-location users)
- `vouch_counts` - Vouch count per user

### Triggers

- `update_updated_at` on profiles, helper_profiles, help_requests, skill_matches, projects
- `round_location` on help_requests and helper_profiles (rounds lat/lng to 2 decimal places for privacy)
- `push_notification_on_insert` on notifications table (calls Edge Function)

### Duplicate Event Detection

Emergency events use weighted similarity scoring:
- Type: 30%
- Title: 35%
- Location: 20%
- Description: 15%

---

## 6. AUTH FLOW

1. User signs up with email + password on Login.jsx (multi-step form)
2. Supabase sends confirmation email via Resend SMTP
3. User confirms email, redirected back to app
4. On first login, a `helper_profiles` row is created (profile created on login, NOT signup)
5. Step 1: name, email, password, "Become a Hope Ambassador" checkbox
6. Step 2 (if ambassador): skills picker, availability grid (AvailabilityPicker), interests
7. AuthContext.jsx provides: `user`, `profile`, `loading`, `signOut`, `isAdmin`, `isFounder`

**AuthContext role helpers:**
```jsx
const isAdmin = profile?.role === 'admin' || profile?.role === 'founder'
const isFounder = profile?.role === 'founder'
```

These are exported and used across all pages. Never hardcode `profile?.role === 'admin'` checks directly.

**RLS approach:** Most tables have `USING (true)` for SELECT (public read), `WITH CHECK (auth.uid() = user_id)` for INSERT/UPDATE. Safety alerts restricted to reporter only. Messages restricted to conversation participants.

---

## 7. KEY ARCHITECTURAL DECISIONS AND WHY

**PWA over native app:** Serves a population that may not have Google Play access or storage space. PWA works on any browser, installable, no app store gatekeeping.

**Supabase over custom backend:** Solo developer, need auth + database + storage + edge functions in one place. RLS handles authorization at the database level.

**Single CSS file (index.css):** All styles in one file. No CSS modules, no Tailwind, no styled-components. Component-scoped class names (e.g., `.feed-card`, `.admin-panel`).

**Database-driven over hardcoded:** Skill categories, resource library entries, etc. come from the database, not hardcoded arrays. Single source of truth.

**Privacy-first schema:** Lat/lng rounded to 2 decimal places by database trigger. No contact info stored in DB. No email visible on profiles. Soft delete via `archived_at`. Safety alerts restricted to reporter and admin.

**helper_profiles as the main profile table:** The `profiles` table exists in the schema but `helper_profiles` is what the app actually queries. This was an evolution from early development. Always use `helper_profiles` with `user_id` as the join key.

**No photo documentation feature:** Was built then deliberately removed. Photos risk exposing location and identity of vulnerable populations. Structured data (requests, matches, check-ins, resources) is sufficient for grant reporting.

**VitePWA injectManifest strategy:** Custom service worker needed for push notification handling. The auto strategy doesn't support custom push event listeners.

**Conversations created on acceptance, not on offer:** When a helper taps "I can help," only a `skill_match` is created with `accepted: null`. The conversation is created only when the requester accepts. This prevents unwanted messaging.

---

## 8. PUSH NOTIFICATION PIPELINE

1. App code calls `createNotification()` from `src/utils/notificationHelpers.js`
2. This inserts a row into the `notifications` table
3. Database trigger `push_notification_on_insert` fires
4. Trigger calls `send-push-notification` Supabase Edge Function via `pg_net`
5. Edge Function reads the user's `push_subscriptions`, sends VAPID-signed push via `web-push`
6. Custom service worker (`src/sw.js`) catches the push event and shows a native notification
7. `notificationclick` handler in sw.js opens the deep link URL from the notification payload

**Known issues:**
- `navigator.serviceWorker.ready` hangs in dev mode (no active SW). All push utility functions use `Promise.race()` with a 2-second timeout.
- Brave browser requires Google Push Messaging enabled explicitly in `brave://settings/privacy`.

**VAPID secrets stored in:**
- Public key: Cloudflare Pages env var `VITE_VAPID_PUBLIC_KEY` + local `.env`
- Private key: Supabase Edge Function secret `VAPID_PRIVATE_KEY`
- Subject: Supabase Edge Function secret `VAPID_SUBJECT` (`mailto:jade@villagewithoutborders.org`)

---

## 9. KNOWN BUGS AND TECH DEBT

### Open Bugs
- **Messages tab unread badge doesn't clear** after opening the corresponding conversation. Needs investigation.

### Pending Features (in priority order)
1. **Admin invitation acceptance UI** on Profile.jsx (invited ambassadors see Accept/Decline)
2. **Admin approval cards** on Admin.jsx Approvals tab (for self-submitted applications)
3. **Admin setup screen** (region name + location sharing on acceptance)
4. **Help Request Acceptance Flow** (full pipeline from VWB-Session-Plan-Sep3.md, partially built):
   - Phase 1 (DB migrations) and Phase 2 (Feed.jsx offer flow) are done
   - Phase 3 (Messages.jsx accept/decline cards) is done
   - Phase 4 (ActiveTasks.jsx rework with completion tracking) is done
   - Phase 5 (Feed.jsx helper count display) may need verification
5. **Avatar display wiring** into Messages, Feed, Campfire, and EventDetail pages
6. **DiceBear v10 customization** (v7 only supports seed-based, no individual feature params)
7. **Marketing site updates** (refresh branding, anonymous story intake form, Givebutter donation link)

### Future Features (from VWB-Session-Plan-Next.md)
- Public profiles with tabbed archive (requests/offers history)
- Upvote/downvote reputation system (separate from safety reports)
- Emergency close event flow improvements (3 paths: resolved, false alarm, duplicate)
- Auto-archive completed tasks to user profiles

### Resolved Infrastructure Issues
- **Root domain hijack (Sep 5, 2026):** `villagewithoutborders.org` was serving an old React app build instead of the Squarespace marketing site. Cause: the old Netlify site (`vwb-web.netlify.app`) still had `app.villagewithoutborders.org` claimed as its primary domain and was serving a stale build. Fix: deleted the entire Netlify site. Netlify is no longer used for anything. If the root domain ever starts serving the app again, check for stale DNS zones or domain claims on old hosting platforms.

### Tech Debt
- `profiles` table exists but app uses `helper_profiles`. Should be consolidated or `profiles` dropped.
- `user_role` enum has 'organizer' which is unused.
- No automated tests.
- All styles in one `index.css` file (growing large).
- No error boundary components.

---

## 10. CONVENTIONS AND PATTERNS

### File Editing Workflow
- Jade works on Windows with PowerShell
- Runs dev server at `localhost:5173` via `npm run dev`
- Tests changes locally, then: `git add -A` → `git commit -m "..."` → `git push`
- Stops dev server before committing
- Cloudflare Pages auto-deploys from GitHub main branch

### PowerShell Gotchas (CRITICAL)
- **Multiline replacement with backtick-n is unreliable.** Use line-index array edits or full file rewrites.
- **`Out-File -Encoding utf8` adds BOM** that breaks Vite `.env` parsing. Use `[System.IO.File]::WriteAllText()` instead.
- **Never run two PowerShell commands on the same line.** They merge and break.
- **`.Replace()` over `-replace` regex** for strings with special characters like `?.` and `[]`.
- **Verify edits landed** with `Select-String -Path [file] -Pattern [term]` or `(Get-Content file)[n]` before pushing.
- **Heredoc syntax for full file rewrites:** `@'...'@ | Set-Content [path]`
- **Downloaded files have overwritten existing files accidentally.** Writing files directly via PowerShell heredocs is safer than extracting from zip packages.

### Code Patterns
- **Full file rewrites over patches** for JSX components (unless the change is truly surgical)
- **Supabase queries:** Always `supabase.from('helper_profiles')` with `.eq('user_id', userId)`, never `supabase.from('profiles')` with `.eq('id', userId)`
- **Role checks:** Always use `isAdmin` and `isFounder` from AuthContext, never inline `profile?.role === 'admin'`
- **Notifications:** Use `createNotification(supabase, { user_id, type, title, body, link })` from `src/utils/notificationHelpers.js`
- **Soft delete:** Set `archived_at = new Date().toISOString()`, never hard delete user content
- **Skill categories:** Queried from DB with `.select('name')` not `.select('title')`
- **Git commit messages:** Concise and descriptive, e.g., `"Add max_helpers picker to AskForHelp form"`

### Naming Conventions
- Pages: PascalCase (`ActiveTasks.jsx`, `EventDetail.jsx`)
- Components: PascalCase (`VouchButton.jsx`, `PushBanner.jsx`)
- Hooks: camelCase with `use` prefix (`useNotifications.js`, `useUnreadCount.js`)
- Utils: camelCase (`notificationHelpers.js`)
- CSS classes: kebab-case (`.feed-card`, `.admin-panel`, `.bottom-tabs`)
- DB tables: snake_case (`help_requests`, `skill_matches`, `event_check_ins`)

---

## 11. ENVIRONMENT VARIABLES

### Local `.env`
```
VITE_SUPABASE_URL=https://jgabhhobqkuteuqtikpi.supabase.co
VITE_SUPABASE_ANON_KEY=[anon key]
VITE_VAPID_PUBLIC_KEY=BAykyY-oJl4BS09YfNZNtwp35tsNRZQbEncrYg8FbScHgB6xbBoTJLKgq_hbu8ouYIoknnCfff1_8hnSt-RpUfg
```

### Cloudflare Pages
Same three vars set in dashboard under Settings → Environment variables.

### Supabase Edge Function Secrets
```
VAPID_PRIVATE_KEY=[private key]
VAPID_PUBLIC_KEY=BAykyY-oJl4BS09YfNZNtwp35tsNRZQbEncrYg8FbScHgB6xbBoTJLKgq_hbu8ouYIoknnCfff1_8hnSt-RpUfg
VAPID_SUBJECT=mailto:jade@villagewithoutborders.org
```

---

## 12. JADE'S PREFERENCES

**Communication style:**
- Draft first, refine together
- Use headers, short paragraphs, bullets
- Offer 2-3 options when possible
- Anticipate what she needs next
- One clarifying question max, but still give a starting point

**Voice and tone:**
- First person, plain language, warm and direct
- Accessible to people with low literacy or learning disabilities
- Nature imagery welcome
- No em dashes, no AI-sounding phrases

**Never:** Over-explain, use filler, add partisan framing, or claim credentials she hasn't stated

**About Jade:** She/they pronouns, Ringgold GA. Queer, genderfluid, neurodivergent. Community organizer, mutual aid founder, county commissioner candidate. Performer and storyteller rooted in Appalachian culture. Her work centers on emergency housing, tenant outreach, flood and mold response, and building local infrastructure.

---

## 13. RLS POLICY REFERENCE

Missing or misconfigured RLS policies have been a recurring source of silent failures. When adding new tables, always:
1. `ALTER TABLE [name] ENABLE ROW LEVEL SECURITY;`
2. Add explicit SELECT/INSERT/UPDATE/DELETE policies for each role that needs access
3. If public-facing pages need to read the table (like login or public profiles), add a policy for the `anon` role too
4. Grant execute on any functions: `GRANT EXECUTE ON FUNCTION [name] TO authenticated;`
5. Grant select on views: `GRANT SELECT ON [view_name] TO authenticated;`

The `skill_categories` table needed an explicit `anon` role GRANT for public-facing pages to load categories before login.

`chat_messages` (campfire) once had RLS enabled with zero policies, blocking all reads and writes silently.

---

## 14. EMERGENCY EVENT CLOSE FLOW

Three paths when closing an event:

1. **Event Resolved:** Closes all response options, moves to Resolved tab, archives participation
2. **False Alarm:** If verified, sends to admin for approval. If unverified, deletes entirely. Admin approves from Admin.jsx Approvals tab.
3. **Duplicate Event:** User selects the duplicate, sends to admin. Admin can merge (moves signups, check-ins, resources to target event, closes duplicate).

Admins and founder bypass the review queue for false alarm and duplicate paths. The original reporter can always close without community consent.

Verification threshold: 2 upvotes from Hope Ambassadors or instant-verify by admin/founder.
