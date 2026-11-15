# Village Without Borders

Village Without Borders is a free mutual aid app. It helps neighbors find each other, share skills, and take care of one another.

It started in Northwest Georgia and the Chattanooga Valley. It is built so any town can use it.

Live app: https://app.villagewithoutborders.org

## How VWB started

Village Without Borders grew out of mutual aid work in Northwest Georgia and the Chattanooga Valley.

In the fall of 2025, our founder, Jade Michalski, kept running into the same gap. People needed help. Neighbors had the skills to help. But there was no simple, safe way for them to find each other.

In February 2026, Jade started learning to code. The first version was an Android app. In August 2026 it became a web app, so it would work on any phone and need no app store.

In November 2026, VWB became free and open source. It started here, but it was built so any town can grow a village of its own.

## Start a village in your town

You are welcome to copy this code and run your own version for your community.

What you need:

- A free [Supabase](https://supabase.com) project (accounts, database, and storage)
- A place to host the site, like [Cloudflare Pages](https://pages.cloudflare.com)
- [Node.js](https://nodejs.org) on your computer

Getting started:

1. Copy (fork) this repository.
2. Run `npm install`.
3. Make a `.env` file with your own keys: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Optional: `VITE_TURNSTILE_SITE_KEY` (spam protection) and `VITE_VAPID_PUBLIC_KEY` (push notifications).
4. Run `npm run dev` and open `http://localhost:5173`.

Please give your village its own name and logo. See "Name and logo" below.

If you get stuck or want to work together, reach out to us. We would love to hear about your village.

## License

### Code: AGPL v3

The code is free and open source under the [GNU Affero General Public License v3.0 or later](LICENSE).

In plain words:

- You can use, copy, change, and share this code.
- If you change it and run it for other people, even as a website, you must share your changes under the same license.
- It comes with no warranty.

This keeps the work in the commons. No one can take it and close it off.

### Art, writing, and help pages: CC BY-SA 4.0

Art, images, stories, and written content are shared under [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/). See [LICENSE-CONTENT.md](LICENSE-CONTENT.md) for details.

### Name and logo

The name "Village Without Borders" and the VWB logo are not covered by either license. If you run your own version, please use your own name and logo, so people know which village they are joining.

Copyright (C) 2026 Village Without Borders
