# Environment variables, secrets and settings
Never commit secrets. Worker secrets are set with `wrangler secret put NAME`.

## Web app (`apps/web/.env.local`)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (required) · `NEXT_PUBLIC_SITE_URL` (share links and previews) · each optional feature appears only if its URL is set: `NEXT_PUBLIC_RANDOM_WS_URL`, `NEXT_PUBLIC_MEDIA_URL`, `NEXT_PUBLIC_AI_URL`, `NEXT_PUBLIC_BILLING_URL`, `NEXT_PUBLIC_DM_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` · `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (CAPTCHA) · server only: `ANDROID_PACKAGE_NAME`, `ANDROID_SHA256_FINGERPRINTS`.
## Admin app (`apps/admin/.env.local`)
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `NEXT_PUBLIC_DB_LIMIT_MB` · `NEXT_PUBLIC_MEDIA_URL` (images in the review queue) · `NEXT_PUBLIC_BILLING_URL` (refunds) · `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
## Workers (vars in `wrangler.toml`, secrets by command)
| Worker | Vars | Secrets |
|---|---|---|
| random | SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGINS | SUPABASE_SERVICE_KEY, ROOM_SECRET; for calls: CF_TURN_KEY_ID, CF_TURN_API_TOKEN |
| media | SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGINS, SCAN_PROVIDER (`openai` or empty), SCAN_REVIEW_THRESHOLD; R2 bucket binding | SUPABASE_SERVICE_KEY, OPENAI_API_KEY (if scanning) |
| ai | SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGINS, AI_GROQ_MODEL, AI_GEMINI_MODEL | SUPABASE_SERVICE_KEY, GROQ_API_KEY, GEMINI_API_KEY, AI_DATA_KEY |
| billing | SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGINS (include the admin origin for refunds), SITE_URL, PAYMENT_EMAIL_DOMAIN, PRICE_USD_CENTS, PRICE_NGN_KOBO, PLAN_CODE_USD, PLAN_CODE_NGN | SUPABASE_SERVICE_KEY, PAYSTACK_SECRET_KEY |
| dm | SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGINS | SUPABASE_SERVICE_KEY, DM_DATA_KEY |
| push | SUPABASE_URL, VAPID_PUBLIC_KEY, VAPID_SUBJECT | SUPABASE_SERVICE_KEY, VAPID_PRIVATE_KEY (from `generate-vapid.mjs`) |
Back up `AI_DATA_KEY` and `DM_DATA_KEY`: losing one makes that stored history unreadable.
## Database settings (`private.platform_config`, no redeploy needed)
`ai_enabled`, `ai_free_daily_limit` (20), `ai_plus_daily_limit` (100), `ai_max_message_chars`, `ai_context_messages`, `ai_burst_per_minute`, `ai_retention_days` (90) · `dm_retention_days` (90) · `plus_months_per_payment` (1) · `refund_window_days` (30) · `media_review_required` (1 = hold image posts) · `media_scan_required` (0; 1 = hold posts whose images were not scanned) · `random_audio_enabled`, `random_video_enabled` (0). Set with: `insert into private.platform_config (key, value) values ('name', '5') on conflict (key) do update set value = excluded.value;`
## Supabase project
Enable anonymous sign-ins; disable email sign-ups (the admin app uses invited users); optionally enable CAPTCHA (Turnstile); enable `pg_cron`; run `supabase/migrations/*.sql` in order.
