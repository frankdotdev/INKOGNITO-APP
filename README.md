# Inkognito
Say what you can't say anywhere else. An anonymous social platform: confessions, comments, Echoes, polls, Whispers, random text chat, an AI companion, claimed names and Plus. Web PWA first (installable). Android and iOS later.

```
apps/web         Next.js PWA (the product)            apps/admin   Next.js Control Room (separate domain)
packages/core    shared TypeScript types, themes, service interfaces
supabase/        migrations (0001-0019) and SQL tests (database is the security boundary)
cloudflare/workers/{random,media,ai,billing,dm,push}   Workers: random chat, image upload and scanning, AI companion, payments and refunds, private chats, push
docs/            architecture, security, operations, launch checklist
```

**Start with `docs/STATUS.md`: what is built, what is tested, and what is not built.**

## Run it locally
1. Create a Supabase project. Auth: enable **Anonymous sign-ins**; for the admin app disable email sign-ups. Run `supabase/migrations/*.sql` in order.
2. `cp .env.example apps/web/.env.local` and fill in `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the rest are optional features: random chat, images, AI, Plus show up only when their URL is set).
3. `npm install && npm run dev -w apps/web` (and `npm run dev -w apps/admin` using `.env.admin.example`).
4. Each Worker has its own `wrangler.toml` and deploy notes in `docs/08` to `docs/12`.

## Tests
`npm run test:sql` (needs `DATABASE_URL` to a superuser Postgres), `npm run test:workers (random, media, ai, billing, dm, push)`, `npm run test:sw`, `npm run typecheck`, `npm run build`. CI runs all of them (`.github/workflows/ci.yml`).

## Docs
`docs/STATUS.md` (read first) · 00 overview · 01 build plan · 02 architecture · 03 design · 04 security · 05 database · 06 sharing · 07 identity · 08 random chat · 09 images · 10 admin · 11 AI · 12 billing · 13 **launch checklist** · 14 operations · 15 private chats · 16 image review, scanning, CAPTCHA, legal · 17 audio and video · 18 Android · 19 push · 20 refunds · 21 resonance and streaks · 22 E2EE design · ENVIRONMENT.md