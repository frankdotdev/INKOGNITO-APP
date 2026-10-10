# Database
- Migration: `supabase/migrations/0001_core.sql`. Tests: `supabase/tests/rls.sql` (run after migrating a scratch DB; needs Supabase's `auth` schema).
- Real data lives in the `private` schema, unreachable by clients (no grants, RLS forced, no policies).
- Clients call `public` security-definer functions only. They return contextual names, never identity ids.
- The `anon` role cannot call the API. Users sign in anonymously (role `authenticated`), so enable Anonymous Sign-Ins in Supabase Auth.
- Built-in abuse limits: posts 20/hour, comments 30/10 min, whispers 20/hour. Fading content is purged by `private.cleanup_expired()` via pg_cron.
- 0002 adds the exact category filter to `get_feed`.
- 0003 moves feed logic into `private.feed_rows` and adds `get_my_feed` (mine/saved/echoes), `list_my_comments` and `list_activity`. Reactions and Echoes in activity stay anonymous.
- 0004 adds `block_author` (by post, comment or Whisper, never by identity id), `list_blocked`, `unblock`, `delete_my_content`; blocked senders are hidden from Whispers and Activity.
- 0005 adds per-post `allow_sharing`, `set_post_sharing`, and the anon-callable `get_public_post` / `get_public_comment`. `create_post` gained `p_allow_sharing`; feeds return `allow_sharing`.
- 0006 adds multi-device sessions, pairings, recovery, devices, purge and identity deletion. `identities.auth_user_id` is now informational only.
- 0007 adds random sessions, participants and reports, plus service-role-only functions the Worker calls (`random_identity_for`, `random_blocked`, `random_open_session`, `random_close_session`, `random_file_report`, `random_block_peer`).
- 0008 adds `post_media`, service-role upload registration, owner-only `attach_post_media`, `get_media_for_posts`, and the cleanup queue the media Worker drains.
- 0009 adds `admins`, `audit_log` and the `admin_*` functions (MFA, role and audit enforced in the database).
- 0010 adds `platform_config`, AI sessions/messages (encrypted by the Worker), daily usage, safety events (kind only), service-only AI functions, and retention in `cleanup_expired`.
- 0011 adds aliases (kept for life), reserved names, orders, subscriptions, payment events, entitlements, service-only billing functions, `my_entitlements`, `get_public_alias`, `admin_revoke_alias`; new threads use the alias via `ensure_context`; Plus raises the AI limit.
- Still to migrate: devices/pairing flow (step 6), DMs, random, AI, billing, moderation actions, risk signals, karma, streaks.

## Migration index
0001 core (identities, posts, comments, reactions, Echoes, polls, Whispers, reports, blocks) · 0002 category filter · 0003 My Inkognito views · 0004 blocking and delete-my-content · 0005 sharing and public reads · 0006 multi-device identity, linking, recovery · 0007 random chat · 0008 media · 0009 admin (MFA, roles, audit) · 0010 AI companion · 0011 Plus, names, billing · 0012 finance tools and metrics · 0013 image review queue · 0014 private chats · 0015 adult gate, audio/video switches, name search · 0016 resonance and streaks · 0017 image scanning · 0018 refunds · 0019 push notifications
