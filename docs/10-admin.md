# Admin Control Room (`apps/admin`)
A separate Next.js app (run on its own domain, e.g. `admin.yourdomain`). It talks only to `admin_*` database functions with the public anon key. No service-role key is used or needed.

## Security model (enforced in the database, `0009_admin.sql`)
- Admins are normal Supabase Auth users (email + password), **never anonymous identities**. A signed-in anonymous user is always refused.
- Every function requires: signed in, not anonymous, listed and enabled in `private.admins`, **MFA completed (`aal2`)**, and an allowed role. An admin without a TOTP code gets nothing.
- Every mutation and every identity lookup is written to `private.audit_log` in the same transaction, with the admin, role, target and a required reason (5+ characters). The app cannot edit or delete audit rows.
- The app signs admins out after 30 minutes idle, blocks framing, indexing and referrers, and never shows names, emails, phone numbers or network addresses of users, because none are collected.

| Role | Dashboard | Reports, posts, random reports | Ban / suspend / restrict | Restore identity | Identity record | Audit log |
|---|---|---|---|---|---|---|
| super_admin | yes | yes | yes | yes | yes | yes |
| safety_moderator | yes | yes | yes | yes | yes | no |
| moderator | yes | yes | yes | no | yes | no |
| support | yes | no | no | no | yes (via ID) | no |
| analytics, finance | yes | no | no | no | no | no |

## Setting up the first admin
1. In Supabase Auth, turn **off** email sign-ups and keep anonymous sign-ins on. Invite the admin by email (Dashboard > Authentication > Users).
2. As the database owner, run: `insert into private.admins (auth_user_id, role) values ('<auth user id>', 'super_admin');`
3. The admin opens the app, signs in, scans the QR code with an authenticator app, and enters the code. To disable an admin later, set `disabled_at`.
4. Copy `.env.admin.example` to `apps/admin/.env.local`. `NEXT_PUBLIC_DB_LIMIT_MB` is your plan's database limit (500 on Supabase Free). The dashboard warns at 60% and goes critical at 85%.

## What's in it
Dashboard (DAU/WAU/MAU, activity, open reports, database size with warnings, identity lookup), Reports queue (urgent first, with the reported content), Random chat reports with transcripts, Posts search and actions (remove, restore, lock/unlock comments), Identity record (restrict, suspend, ban, restore), Audit log.

## Notes and limits
- Removing a post hides it everywhere at once, but its images are deleted from storage by the media Worker's cron. Restoring a post later brings back the text, not images already deleted.
- Banning sets `status = banned`: the identity can still read but can't post, comment, react, Whisper, upload or join random chat.
- Reading a reported Whisper's text is available to moderators only through a report, and every identity lookup is audited.
- **Not built yet:** AI, billing and Realtime/WebRTC usage metrics (those systems don't exist yet), appeals, shadow restrictions, per-admin session listing, IP/device allow-listing for admins, and automated alerts. Routes are at the app root (`/reports`) rather than under `/admin`, since it has its own domain.
- **Tested:** `supabase/tests/rls.sql` covers anonymous refusal, MFA enforcement, each role's limits, a disabled admin, remove/restore/lock effects on feeds and public share pages, reasons required, banning and restoring, report resolution, and audit attribution. The admin UI itself has not been run in a browser.
