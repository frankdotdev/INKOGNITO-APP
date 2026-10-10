# Operations
- **Deploy order:** database migrations, then Workers (media, ai, billing, random), then web, then admin. Migrations are additive and ordered; never edit a migration that has run in production, add a new one.
- **Rollback:** web and Workers roll back by redeploying the previous version. Database changes roll forward with a new migration.
- **Config without redeploy:** `private.platform_config` holds `ai_enabled`, `ai_free_daily_limit`, `ai_plus_daily_limit`, `ai_max_message_chars`, `ai_context_messages`, `ai_burst_per_minute`, `ai_retention_days`, `plus_months_per_payment`.
- **Switching a feature off in an emergency:** AI: set `ai_enabled` to `false`. Random chat: unset `NEXT_PUBLIC_RANDOM_WS_URL` or remove the Worker route. Uploads: unset `NEXT_PUBLIC_MEDIA_URL`. Payments: unset `NEXT_PUBLIC_BILLING_URL`.
- **Banning:** admin app, identity record, Ban. A banned identity can read but cannot post, comment, react, Whisper, upload, chat or use the companion.
- **Payment problems:** admin app, Orders. Fix or refund in Paystack with the provider reference, then record it.
- **Rotating secrets:** `wrangler secret put` then redeploy. Rotating `AI_DATA_KEY` makes old AI history unreadable (it is deleted after 90 days anyway). Rotating `ROOM_SECRET` ends active random chats.
- **Data requests:** a person can delete content and their whole identity in the app. There is no way to look someone up by name, email or phone, because none are held.
- **Known scaling limits:** one Matchmaker Durable Object (shard by region or language when matches per minute grow); Supabase Free allows 500 MB and 200 realtime connections; feed pagination uses offsets (switch to keyset cursors if feeds get deep).
