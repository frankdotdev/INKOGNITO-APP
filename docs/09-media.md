# Media (images)
```
Browser: re-encode (strips location/camera data, max 1600px, <=1.8 MB) --> Media Worker --> R2 bucket
                                                                   \--> Postgres (who owns it, key, size, status)
Feed: get_media_for_posts(post ids) --> image URL = MEDIA_URL/m/<key>
```
- **Privacy:** images are re-encoded in the browser, which removes EXIF location and camera data. The Worker also rejects any upload that still contains metadata markers, so scripts can't bypass it.
- **Validation:** JPEG, PNG or WebP only (bytes are checked against the declared type), 2 MB max, dimensions 1-4096, origin allow-list, signed-in users only, 30 uploads per hour per identity.
- **Attaching:** an upload is `pending` until the post is created; the app then calls `attach_post_media` (max 4 per post, owner only). If attaching fails, the post is deleted so nothing is half-posted.
- **Lifecycle:** a cron (every 15 minutes) deletes R2 objects for deleted, moderated or expired posts and for uploads never attached within 24 hours. Images are cached for up to an hour, so a removed image can linger briefly.
- **Keys** are random UUIDs, never derived from content or identity.
- **Tested:** `cloudflare/workers/media/e2e.mjs` runs against `wrangler dev` with local R2 and a stand-in Supabase server (17 checks: auth, type and byte sniffing, metadata rejection, size, origin, rate limit, serving headers, registration, cron deletion). The web upload path has not been run in a browser.

## Before a public launch
**There is no automated image scanning yet.** Anyone can upload images that are live immediately. Before opening to the public: enable Cloudflare's CSAM Scanning Tool on the media domain, add an image moderation step that sets `moderation_state = 'review'` for flagged uploads, and have moderators ready (the admin app). Reporting already works on any post that carries an image.

## Deploy
1. Run `0008_media.sql`. 2. `wrangler r2 bucket create inkognito-media`. 3. In `cloudflare/workers/media`: fill `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `ALLOWED_ORIGINS`; `wrangler secret put SUPABASE_SERVICE_KEY`; `wrangler deploy`. 4. Set `NEXT_PUBLIC_MEDIA_URL` for the web app. Put the Worker behind a custom domain such as `media.yourdomain` and enable caching there.
