# Random text chat
```
Browser --WebSocket--> Worker (auth) --> Matchmaker DO (queue) --matched--> Room DO (one per chat)
```
- **Auth:** the browser sends its Supabase access token in the WebSocket subprotocol (`bearer.<jwt>`), not the URL. The Worker asks Supabase Auth who it belongs to, then asks `random_identity_for` (service role) for the identity and eligibility. Banned, restricted and purged identities are refused.
- **Matching:** one global Matchmaker Durable Object. Waiting sockets are the queue (they hibernate). It skips blocked pairs (checked in the database, fails closed), avoids rematching the same pair for 10 minutes (best effort, in memory), and claims both sockets before creating a room so a socket can never be matched twice.
- **Rooms:** matched users get a short-lived HMAC room token that names only a room and a slot, never an identity. The Room relays messages; it keeps nothing except a rolling buffer of the last 30 messages, used only if someone reports. Everything is erased when the chat ends. Limits: 1000 characters per message, 6 messages per 5 seconds, 2 hours max, 90 seconds to join, 30 seconds grace for a dropped connection.
- **Safety:** Report (with transcript) and Block send to the database, which also blocks the stranger for you. Reports are rate limited and land in `private.random_reports` for moderators. A first-time safety screen with an 18+ confirmation appears before the first chat. That confirmation is a deliberate choice beyond the spec (which only requires 18+ for audio/video); remove it in `app/(app)/random/page.tsx` if you disagree.
- **Modes:** text is on. Audio and video exist but are switched off and age-gated; see `17-audio-video.md`.
- **Tested:** `cloudflare/workers/random/e2e.mjs` runs against `wrangler dev` with a stand-in Supabase server (`fake-supabase.mjs`): auth, bad tokens, matching, relay, typing, rate limit, forged tokens, report with transcript, session open/close, no rejoin, no instant rematch. The web client has not been run against it in a browser.

## Deploy
1. Run migration `0007_random.sql`.
2. In `cloudflare/workers/random`: set `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_ORIGINS` (your web origin) in `wrangler.toml`; `wrangler secret put SUPABASE_SERVICE_KEY`; `wrangler secret put ROOM_SECRET` (32+ random bytes); `wrangler deploy`.
3. Set `NEXT_PUBLIC_RANDOM_WS_URL=wss://<worker-host>` for the web app.
- Known limits: the queue and recent-match memory live in one Durable Object, which is fine for early traffic. Shard by region or language when matches per minute get high. Moderator tooling for reports comes with the admin app.
