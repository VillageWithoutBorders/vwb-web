# CLAUDE.md

## Project
Village Without Borders (VWB): a mutual aid and skillshare web app for Northwest Georgia and the Chattanooga Valley. Neighbors ask for help, offer help, join zip code villages, and work with organizations and emergency response groups. Adults only (18+). No AI features in the app; Claude is used for building it.

Goal: finished and simple enough that it runs without its founder (Jade Michalski) and communities govern themselves.

## Stack
- React 19 + Vite 8, plain JavaScript (`.jsx`, not TypeScript). React Router 7.
- Plain CSS: `src/index.css` plus `village-scene.css`, `world.css`, `dashboard.css`, `find-help.css`, and inline styles. Colors are CSS variables (`--surface`, `--accent`, `--gold`, `--danger`, ...). Dark is the default; light mode is warm cream. No Tailwind, no component library.
- Supabase: auth, Postgres with row level security, RPC functions, Edge Functions, Storage, `pg_net`, `pg_cron`.
- Leaflet for maps. libsodium for scrambled (end-to-end encrypted) chats. VitePWA with `injectManifest` (`src/sw.js`). Hosted on Cloudflare Pages.

## Build & Run
- `npm run dev`: local dev on localhost:5173
- `npm run build`: production build
- `npm run lint`: oxlint
- No test suite. Check work by building, running dev, and the 320px checklist in the project instructions.
- Jade works in PowerShell on Windows.

## Architecture
- Routes: `src/App.jsx` (pages are lazy loaded). Pages in `src/pages`, shared parts in `src/components`, helpers in `src/utils`, lookup data in `src/data`.
- State: React context (`AuthContext`: user, profile, isAdmin, isFounder, organizations, established; `NotificationsContext`; `UnreadCountContext`) plus local `useState`. Nothing else.
- Data: the client in `src/supabaseClient.js`. Anything touching privacy goes through `security definer` RPCs. Every table has RLS.
- Icons: `<Icon name="..." />` from `components/Icon.jsx`, art in `public/art/icons`. Picture icons, not emoji. People show as a letter. No photos of people anywhere.
- Database changes: a `vwb-<topic>.sql` file in the repo root (gitignored). Jade runs it by hand in the Supabase SQL Editor before pushing the app. Every file is safe to run twice, deletes nothing people made, and ends with a CHECK query where every column says true.
- The full schema is not in the repo. Check the repo SQL files and project docs before assuming a column. If still unknown, make the SQL check for itself and stop with a clear error.

## Roles
- Member. A new account (first 14 days, unless vouched for or finished a task with someone) has limits.
- Hope Ambassador. VWB admin (`role = 'admin'`). Founder.
- Organizations: Heads (`role 'admin'`) and organizers.
- Groups (`organizations.kind = 'group'`, tent icon): emergency response crews run by a Lead keeper (`'admin'`) and keepers (`'organizer'`). Called to emergencies only after a Hope Ambassador or VWB admin outside the group approves.
- Neighborhood villages: one keeper.
- Enforce roles in the database (RLS or RPC), not only on screen.

## Core flows
- Help requests: `open` → `accepted` → `completed` → archived once both people say how it went. `cancelled` too. Check current values in code before changing any.
- Emergencies: report → verified (2 neighbors confirm, or an Ambassador or admin) → Response Camp chat opens and covering groups are asked → closed (chat read-only, deleted 30 days later).
- Chat names follow `claude/VWB-Vocabulary.md` in the project: village chat, Campfire, Cottage Chat, Sister Campfire, Response Camp, Announcements, Spark.

## Rules
- Privacy first. Defaults lean private. VWB admins cannot read village chats, Campfires or Cottage Chats. VWB keeps no message archive. Never show an address; locations are rounded.
- Never leave a Supabase call unchecked: log the error and tell the person in plain words.
- Mobile first: follow the project's mobile checklist (320px with no sideways scroll, 44px touch targets, 16px text, visible focus, reduced motion, dark and light).
- App wording: short plain sentences for people with low literacy or learning disabilities. No em dashes. No jargon. Say "VWB admins", never "staff". Private chats between chosen people are "Cottage Chats", not groups.

## Don'ts
- Don't install new dependencies without asking.
- Don't change a status value or enum without updating everything that reads it.
- Don't add a new state library or styling system.
- Don't add marketing or landing page copy; work on the app itself.
- Don't add photos of people.
- No co-author or session lines in commit messages. Give Jade one PowerShell line: `cd "<repo>"; git add -A; git commit -m "..."; git push`.

## Gotchas
- Save files as UTF-8 without a BOM. PowerShell `Out-File -Encoding utf8` adds one and breaks Vite.
- Keep line endings as git has them (LF). A CRLF flip makes git show the whole file as changed.
- Vite can serve an old copy of a file changed from outside the editor. Restart `npm run dev` if a change doesn't show.
- `navigator.serviceWorker.ready` hangs in dev. Race it with a timeout.
- `notifications.type` has a check constraint (`notifications_type_allowed`). A new alert type must be added to it.
- `campfire_boards` names must be unique among open boards.
- Gitignored on purpose: root `vwb-*.sql`, `vwb-*.css`, `*.patch`, `vwb-art/`, `Claude outputs/`, `_to_delete/`.

## Where context lives
Project docs on claude.ai: the newest `claude/VWB-Handoff-*.md` says what is next; `claude/VWB-Closeout-*.md` says what each session built.
