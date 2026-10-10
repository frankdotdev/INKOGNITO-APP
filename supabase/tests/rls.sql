-- Run after migrations on a scratch database. Fails loudly on any violation.
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'is_anonymous', true)::text, false);
  execute 'set role authenticated'; end $$;
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b') on conflict do nothing;
do $$ declare a uuid := '00000000-0000-0000-0000-00000000000a'; b uuid := '00000000-0000-0000-0000-00000000000b'; pid uuid; pid2 uuid; cid uuid; n1 text; n2 text; cnt int; ok boolean; begin
  perform pg_temp.as_user(a); perform public.ensure_identity();
  pid := public.create_post('I never told anyone this?', 'life', 'relieved', 'Would you forgive?', null, true);
  perform pg_temp.as_user(b); perform public.ensure_identity();
  -- 1. direct table access is denied
  begin perform 1 from private.posts; raise exception 'FAIL: private.posts readable'; exception when insufficient_privilege then null; end;
  -- 2. anon role cannot call the API
  reset role; set role anon;
  begin perform public.get_feed(); raise exception 'FAIL: anon can call API'; exception when insufficient_privilege then null; end;
  perform pg_temp.as_user(b);
  -- 3. feed exposes contextual name and no identity id column
  perform 1 from public.get_feed('fresh') where author_name is not null and id = pid;
  if not found then raise exception 'FAIL: post not visible'; end if;
  -- 3b. category filter is exact and case-insensitive
  perform 1 from public.get_feed('fresh', null, 20, 0, null, 'LIFE') where id = pid;
  if not found then raise exception 'FAIL: category filter missed post'; end if;
  perform 1 from public.get_feed('fresh', null, 20, 0, null, 'money') where id = pid;
  if found then raise exception 'FAIL: category filter leaked post'; end if;
  -- 4. poll votes hidden until voted
  select jsonb_typeof(poll->'votes') = 'null' into ok from public.get_feed('fresh', null, 20, 0, pid);
  if not ok then raise exception 'FAIL: votes visible before voting'; end if;
  perform public.vote_poll(pid, 0);
  select jsonb_typeof(poll->'votes') = 'array' into ok from public.get_feed('fresh', null, 20, 0, pid);
  if not ok then raise exception 'FAIL: votes hidden after voting'; end if;
  -- 5. commenter context is stable inside a thread
  perform public.add_comment(pid, 'me too'); perform public.add_comment(pid, 'still here');
  select count(distinct author_name) into cnt from public.list_comments(pid) where mine;
  if cnt <> 1 then raise exception 'FAIL: unstable context'; end if;
  -- 6. author and commenter never share a name in one thread
  select author_name into n1 from public.get_feed('fresh', null, 20, 0, pid);
  select author_name into n2 from public.list_comments(pid) where mine limit 1;
  if n1 = n2 then raise exception 'FAIL: name collision in thread'; end if;
  -- 7. whispers are visible only to author and sender
  perform public.send_whisper(pid, 'you are not alone');
  select count(*) into cnt from public.list_whispers(); if cnt <> 1 then raise exception 'FAIL: sender cannot see whisper'; end if;
  perform pg_temp.as_user(a);
  select count(*) into cnt from public.list_whispers(); if cnt <> 1 then raise exception 'FAIL: author cannot see whisper'; end if;
  begin perform public.send_whisper(pid, 'x'); raise exception 'FAIL: self whisper'; exception when sqlstate '22023' then null; end;
  -- 7b. Me area: scopes, own comments, activity
  select count(*) into cnt from public.get_my_feed('mine') where id = pid; if cnt <> 1 then raise exception 'FAIL: mine missing'; end if;
  perform pg_temp.as_user(b);
  perform public.toggle_reaction('post', pid); perform public.set_echo(pid, true); perform public.set_bookmark(pid, true);
  select count(*) into cnt from public.get_my_feed('mine') where id = pid; if cnt <> 0 then raise exception 'FAIL: mine leaks'; end if;
  select count(*) into cnt from public.get_my_feed('saved') where id = pid; if cnt <> 1 then raise exception 'FAIL: saved'; end if;
  select count(*) into cnt from public.get_my_feed('echoes') where id = pid; if cnt <> 1 then raise exception 'FAIL: echoes'; end if;
  select count(*) into cnt from public.list_my_comments(); if cnt <> 2 then raise exception 'FAIL: my comments'; end if;
  select count(*) into cnt from public.list_activity(); if cnt <> 0 then raise exception 'FAIL: activity shows own actions'; end if;
  begin perform public.get_my_feed('everyone'); raise exception 'FAIL: bad scope accepted'; exception when sqlstate '22023' then null; end;
  perform pg_temp.as_user(a);
  select count(*) into cnt from public.list_activity() where kind = 'comment' and actor_name is not null; if cnt <> 2 then raise exception 'FAIL: comment activity'; end if;
  select count(*) into cnt from public.list_activity() where kind in ('reaction','echo') and actor_name is null; if cnt <> 2 then raise exception 'FAIL: anonymous activity'; end if;
  select count(*) into cnt from public.list_activity() where kind = 'whisper'; if cnt <> 1 then raise exception 'FAIL: whisper activity'; end if;
  -- 8. only the author can delete
  perform pg_temp.as_user(b);
  begin perform public.delete_own_post(pid); raise exception 'FAIL: non-author delete'; exception when sqlstate 'P0002' then null; end;
  -- 9. blocking
  perform pg_temp.as_user(b);
  perform public.block_author('post', pid);
  select count(*) into cnt from public.get_feed('fresh', null, 20, 0, pid); if cnt <> 0 then raise exception 'FAIL: blocked post visible'; end if;
  select label into n2 from public.list_blocked(); if n2 is distinct from n1 then raise exception 'FAIL: block label'; end if;
  perform public.unblock((select id from public.list_blocked() limit 1));
  select count(*) into cnt from public.get_feed('fresh', null, 20, 0, pid); if cnt <> 1 then raise exception 'FAIL: unblock'; end if;
  perform pg_temp.as_user(a);
  begin perform public.block_author('post', pid); raise exception 'FAIL: self block'; exception when sqlstate '22023' then null; end;
  perform public.block_author('comment', (select id from public.list_comments(pid) where not mine limit 1));
  select count(*) into cnt from public.list_comments(pid); if cnt <> 0 then raise exception 'FAIL: blocked comments visible'; end if;
  select count(*) into cnt from public.list_activity() where kind = 'comment'; if cnt <> 0 then raise exception 'FAIL: blocked activity visible'; end if;
  select count(*) into cnt from public.list_whispers(); if cnt <> 0 then raise exception 'FAIL: blocked whisper visible'; end if;
  perform pg_temp.as_user(b);
  select count(*) into cnt from public.list_whispers(); if cnt <> 1 then raise exception 'FAIL: sender lost own whisper'; end if;
  begin perform public.send_whisper(pid, 'hi'); raise exception 'FAIL: blocked whisper sent'; exception when sqlstate 'P0002' then null; end;
  -- 10. delete my content
  perform public.delete_my_content();
  select count(*) into cnt from public.list_my_comments(); if cnt <> 0 then raise exception 'FAIL: comments remain'; end if;
  select count(*) into cnt from public.get_my_feed('saved'); if cnt <> 0 then raise exception 'FAIL: bookmarks remain'; end if;
  perform pg_temp.as_user(a);
  select count(*) into cnt from public.get_my_feed('mine') where id = pid; if cnt <> 1 then raise exception 'FAIL: delete touched other user'; end if;
  -- 11. public share reads (anon can read shareable content only; nothing else)
  perform pg_temp.as_user(a);
  cid := public.add_comment(pid, 'shared thought');
  pid2 := public.create_post('keep this private', null, null, null, null, true, false);
  reset role; set role anon;
  select count(*) into cnt from public.get_public_post(pid) where author_name is not null; if cnt <> 1 then raise exception 'FAIL: public post'; end if;
  select count(*) into cnt from public.get_public_comment(cid); if cnt <> 1 then raise exception 'FAIL: public comment'; end if;
  select count(*) into cnt from public.get_public_post(pid2); if cnt <> 0 then raise exception 'FAIL: unshareable post public'; end if;
  begin perform public.get_feed(); raise exception 'FAIL: anon feed'; exception when insufficient_privilege then null; end;
  perform pg_temp.as_user(a);
  perform public.set_post_sharing(pid, false);
  reset role; set role anon;
  select count(*) into cnt from public.get_public_post(pid); if cnt <> 0 then raise exception 'FAIL: opt-out ignored'; end if;
  select count(*) into cnt from public.get_public_comment(cid); if cnt <> 0 then raise exception 'FAIL: comment of unshared post public'; end if;
  perform pg_temp.as_user(b);
  begin perform public.set_post_sharing(pid, true); raise exception 'FAIL: non-author toggled sharing'; exception when sqlstate 'P0002' then null; end;
  raise notice 'RLS/API tests passed';
end $$;

-- ===== Identity: linking, recovery, devices, purge, delete =====
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000d'), ('00000000-0000-0000-0000-00000000000e'),
  ('00000000-0000-0000-0000-00000000000f'), ('00000000-0000-0000-0000-000000000010') on conflict do nothing;
do $$ declare
  a uuid := '00000000-0000-0000-0000-00000000000a'; d uuid := '00000000-0000-0000-0000-00000000000d'; e uuid := '00000000-0000-0000-0000-00000000000e';
  f uuid := '00000000-0000-0000-0000-00000000000f'; g uuid := '00000000-0000-0000-0000-000000000010';
  pid uuid; pg uuid; pr uuid; r text; cnt int; n1 text; n2 text; code text := 'link-code-secret';
  ph text := encode(sha256(convert_to('link-code-secret','UTF8')),'hex'); rh text := encode(sha256(convert_to('RECOVERY-CODE','UTF8')),'hex'); i int; ok boolean;
begin
  perform pg_temp.as_user(a); pid := public.create_post('identity test post', 'life', null, null, null, true, true);
  -- linking: new device d shows a code, a approves, d completes
  perform pg_temp.as_user(d); perform public.ensure_identity();
  select p.id into pr from public.create_pairing(ph) p;
  perform pg_temp.as_user(a);
  if public.approve_pairing(pr, 'wrong') <> 'invalid' then raise exception 'FAIL: wrong code approved'; end if;
  if public.approve_pairing(pr, code) <> 'ok' then raise exception 'FAIL: approve'; end if;
  perform pg_temp.as_user(d);
  if public.pairing_status(pr) <> 'approved' then raise exception 'FAIL: status'; end if;
  if public.complete_pairing(pr, 'wrong') <> 'invalid' then raise exception 'FAIL: wrong code completed'; end if;
  if public.complete_pairing(pr, code) <> 'ok' then raise exception 'FAIL: complete'; end if;
  if public.complete_pairing(pr, code) <> 'invalid' then raise exception 'FAIL: pairing reusable'; end if;
  select count(*) into cnt from public.get_my_feed('mine') where id = pid; if cnt <> 1 then raise exception 'FAIL: linked device lacks identity content'; end if;
  select author_name into n1 from public.get_feed('fresh', null, 20, 0, pid);
  perform pg_temp.as_user(a); select author_name into n2 from public.get_feed('fresh', null, 20, 0, pid);
  if n1 <> n2 then raise exception 'FAIL: linked devices show different names'; end if;
  -- someone other than the requester cannot read pairing status
  if public.pairing_status(pr) <> 'invalid' then raise exception 'FAIL: pairing status leaked'; end if;
  -- expiry
  perform pg_temp.as_user(e); perform public.ensure_identity(); select p.id into pg from public.create_pairing(ph) p;
  reset role; update private.pairings set expires_at = now() - interval '1 minute' where id = pg;
  perform pg_temp.as_user(a); if public.approve_pairing(pg, code) <> 'expired' then raise exception 'FAIL: expired pairing approved'; end if;
  -- a device that already has content cannot be linked over
  perform pg_temp.as_user(e); perform public.create_post('my own content', null, null, null, null, true, true);
  select p.id into pg from public.create_pairing(ph) p;
  perform pg_temp.as_user(a); perform public.approve_pairing(pg, code);
  perform pg_temp.as_user(e); if public.complete_pairing(pg, code) <> 'device_has_content' then raise exception 'FAIL: content overwritten'; end if;
  -- recovery
  perform pg_temp.as_user(a); perform public.set_recovery(rh);
  select has_recovery into ok from public.identity_summary(); if not ok then raise exception 'FAIL: recovery flag'; end if;
  select device_count into cnt from public.identity_summary(); if cnt <> 2 then raise exception 'FAIL: device count %', cnt; end if;
  perform pg_temp.as_user(f); perform public.ensure_identity();
  if public.recover_identity(encode(sha256(convert_to('nope','UTF8')),'hex')) <> 'invalid' then raise exception 'FAIL: wrong recovery accepted'; end if;
  if public.recover_identity(rh) <> 'ok' then raise exception 'FAIL: recovery'; end if;
  select count(*) into cnt from public.get_my_feed('mine') where id = pid; if cnt <> 1 then raise exception 'FAIL: recovered identity content'; end if;
  perform pg_temp.as_user(g); perform public.ensure_identity();
  for i in 1..5 loop perform public.recover_identity(encode(sha256(convert_to('guess'||i,'UTF8')),'hex')); end loop;
  if public.recover_identity(rh) <> 'rate_limited' then raise exception 'FAIL: recovery not rate limited'; end if;
  -- devices: list, revoke another device, cannot revoke self
  perform pg_temp.as_user(a); perform public.register_device('Chrome on Android');
  perform pg_temp.as_user(d); perform public.register_device('Firefox on Windows');
  perform pg_temp.as_user(a);
  select count(*) into cnt from public.list_devices(); if cnt <> 2 then raise exception 'FAIL: device list %', cnt; end if;
  begin perform public.revoke_device((select id from public.list_devices() where is_current)); raise exception 'FAIL: revoked self'; exception when sqlstate '22023' then null; end;
  perform public.revoke_device((select id from public.list_devices() where not is_current));
  perform pg_temp.as_user(d);
  begin perform public.get_my_feed('mine'); raise exception 'FAIL: revoked device still has access'; exception when sqlstate '28000' then null; end;
  -- purge this device (f is on a's identity): f loses access; a keeps the content; f can start fresh
  perform pg_temp.as_user(f); perform public.purge_this_device();
  begin perform public.get_my_feed('mine'); raise exception 'FAIL: purged device still has access'; exception when sqlstate '28000' then null; end;
  perform public.ensure_identity();
  select count(*) into cnt from public.get_my_feed('mine'); if cnt <> 0 then raise exception 'FAIL: purged device got old identity back'; end if;
  perform pg_temp.as_user(a); select count(*) into cnt from public.get_my_feed('mine') where id = pid; if cnt <> 1 then raise exception 'FAIL: purge touched other device'; end if;
  -- delete identity removes content and access
  perform pg_temp.as_user(g); pg := public.create_post('goodbye', null, null, null, null, true, true);
  reset role; set role anon; select count(*) into cnt from public.get_public_post(pg); if cnt <> 1 then raise exception 'FAIL: setup'; end if;
  perform pg_temp.as_user(g); perform public.delete_identity();
  begin perform public.get_feed(); raise exception 'FAIL: deleted identity still has access'; exception when sqlstate '28000' then null; end;
  reset role; set role anon; select count(*) into cnt from public.get_public_post(pg); if cnt <> 0 then raise exception 'FAIL: deleted content still public'; end if;
  raise notice 'Identity tests passed';
end $$;

-- ===== Random chat (service_role only) =====
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000011'), ('00000000-0000-0000-0000-000000000012'), ('00000000-0000-0000-0000-000000000013') on conflict do nothing;
do $$ declare
  u1 uuid := '00000000-0000-0000-0000-000000000011'; u2 uuid := '00000000-0000-0000-0000-000000000012'; u3 uuid := '00000000-0000-0000-0000-000000000013';
  i1 uuid; i2 uuid; i3 uuid; sid uuid := gen_random_uuid(); ok boolean; cnt int; el boolean;
begin
  perform pg_temp.as_user(u1); perform public.ensure_identity();
  perform pg_temp.as_user(u2); perform public.ensure_identity();
  perform pg_temp.as_user(u3); perform public.ensure_identity();
  -- clients cannot call the random functions
  begin perform public.random_blocked(gen_random_uuid(), gen_random_uuid()); raise exception 'FAIL: authenticated can call random fn'; exception when insufficient_privilege then null; end;
  reset role; set role anon;
  begin perform public.random_identity_for(u1); raise exception 'FAIL: anon can call random fn'; exception when insufficient_privilege then null; end;
  reset role; set role service_role;
  select identity_id, eligible into i1, el from public.random_identity_for(u1); if i1 is null or not el then raise exception 'FAIL: identity lookup'; end if;
  select identity_id into i2 from public.random_identity_for(u2); select identity_id into i3 from public.random_identity_for(u3);
  if public.random_blocked(i1, i2) then raise exception 'FAIL: blocked before report'; end if;
  perform public.random_open_session(sid, 'text', i1, i2);
  begin perform public.random_open_session(gen_random_uuid(), 'text', i1, i1); raise exception 'FAIL: self match'; exception when sqlstate '22023' then null; end;
  begin perform public.random_file_report(sid, i3, 'spam', '[]'::jsonb); raise exception 'FAIL: non-participant report'; exception when sqlstate 'P0002' then null; end;
  perform public.random_file_report(sid, i1, 'threat', '[{"s":"b","t":"hello","at":1}]'::jsonb);
  reset role; select count(*) into cnt from private.random_reports where reporter_identity_id = i1 and reported_identity_id = i2 and priority = 2 and jsonb_array_length(transcript) = 1;
  if cnt <> 1 then raise exception 'FAIL: report row'; end if;
  set role service_role;
  if not public.random_blocked(i2, i1) then raise exception 'FAIL: report did not block (either direction)'; end if;
  -- block-only path
  sid := gen_random_uuid(); perform public.random_open_session(sid, 'text', i3, i2); perform public.random_block_peer(sid, i3);
  if not public.random_blocked(i3, i2) then raise exception 'FAIL: block peer'; end if;
  perform public.random_close_session(sid, 'left');
  -- a banned identity is not eligible
  reset role; update private.identities set risk_level = 'banned' where id = i3; set role service_role;
  select eligible into el from public.random_identity_for(u3); if el then raise exception 'FAIL: banned eligible'; end if;
  reset role;
  raise notice 'Random tests passed';
end $$;

-- ===== Media =====
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000014'), ('00000000-0000-0000-0000-000000000015') on conflict do nothing;
do $$ declare
  u1 uuid := '00000000-0000-0000-0000-000000000014'; u2 uuid := '00000000-0000-0000-0000-000000000015'; i1 uuid; i2 uuid;
  m1 uuid; m2 uuid; pid uuid; p1 uuid; cnt int; k1 text := '2026/09/' || gen_random_uuid() || '.png'; ms uuid[] := '{}'; i int; keys text[];
begin
  reset role; insert into private.platform_config values ('media_review_required', '0'::jsonb) on conflict (key) do update set value = excluded.value;
  perform pg_temp.as_user(u1); perform public.ensure_identity(); perform pg_temp.as_user(u2); perform public.ensure_identity();
  reset role; select identity_id into i1 from private.identity_sessions where auth_user_id = u1; select identity_id into i2 from private.identity_sessions where auth_user_id = u2;
  -- clients cannot register uploads
  perform pg_temp.as_user(u1);
  begin perform public.media_register(i1, k1, 'image/png', 1000, 10, 10); raise exception 'FAIL: client registered media'; exception when insufficient_privilege then null; end;
  reset role; set role service_role;
  begin perform public.media_register(i1, k1, 'image/gif', 1000, 10, 10); raise exception 'FAIL: gif accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.media_register(i1, 'etc/passwd', 'image/png', 1000, 10, 10); raise exception 'FAIL: bad key accepted'; exception when sqlstate '22023' then null; end;
  m1 := public.media_register(i1, k1, 'image/png', 1000, 100, 80); m2 := public.media_register(i2, '2026/09/' || gen_random_uuid() || '.jpg', 'image/jpeg', 2000, 50, 50);
  perform pg_temp.as_user(u1); pid := public.create_post('post with an image', null, null, null, null, true, true);
  p1 := pid; perform public.attach_post_media(pid, array[m1]);
  select count(*) into cnt from public.get_media_for_posts(array[pid]); if cnt <> 1 then raise exception 'FAIL: media not listed'; end if;
  -- someone else cannot attach to my post, nor attach my upload to theirs
  perform pg_temp.as_user(u2);
  begin perform public.attach_post_media(pid, array[m2]); raise exception 'FAIL: attached to another post'; exception when sqlstate 'P0002' then null; end;
  select count(*) into cnt from public.get_media_for_posts(array[pid]); if cnt <> 1 then raise exception 'FAIL: other users cannot see media'; end if;
  pid := public.create_post('mine', null, null, null, null, true, true);
  begin perform public.attach_post_media(pid, array[m1]); raise exception 'FAIL: attached someone elses upload'; exception when sqlstate 'P0002' then null; end;
  -- max four images
  reset role; set role service_role;
  for i in 1..5 loop ms := ms || public.media_register(i2, '2026/09/' || gen_random_uuid() || '.webp', 'image/webp', 500, 10, 10); end loop;
  perform pg_temp.as_user(u2);
  begin perform public.attach_post_media(pid, ms); raise exception 'FAIL: five images'; exception when sqlstate '22023' then null; end;
  -- upload rate limit
  reset role; set role service_role;
  begin for i in 1..30 loop perform public.media_register(i2, '2026/09/' || gen_random_uuid() || '.webp', 'image/webp', 500, 10, 10); end loop; raise exception 'FAIL: no rate limit'; exception when sqlstate '54000' then null; end;
  -- cleanup: deleted post media and stale pending uploads are handed to the Worker
  perform pg_temp.as_user(u1); perform public.delete_own_post(p1);
  reset role; update private.post_media set created_at = now() - interval '2 days' where id = ms[1]; set role service_role;
  select array_agg(r2_key) into keys from public.media_take_deletions(500);
  if not (k1 = any(keys)) then raise exception 'FAIL: deleted post media not queued'; end if;
  perform public.media_confirm_deleted((select array_agg(id) from public.media_take_deletions(500) where r2_key = k1));
  select count(*) into cnt from public.media_take_deletions(500) where r2_key = k1; if cnt <> 0 then raise exception 'FAIL: still queued after confirm'; end if;
  reset role; raise notice 'Media tests passed';
end $$;

-- ===== Admin =====
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000020','super@x.test'), ('00000000-0000-0000-0000-000000000021','mod@x.test'), ('00000000-0000-0000-0000-000000000022','support@x.test'),
  ('00000000-0000-0000-0000-000000000023','gone@x.test'), ('00000000-0000-0000-0000-000000000024', null), ('00000000-0000-0000-0000-000000000025', null) on conflict do nothing;
insert into private.admins (auth_user_id, role, disabled_at) values ('00000000-0000-0000-0000-000000000020','super_admin',null), ('00000000-0000-0000-0000-000000000021','moderator',null),
  ('00000000-0000-0000-0000-000000000022','support',null), ('00000000-0000-0000-0000-000000000023','moderator', now());
create or replace function pg_temp.as_admin(u uuid, lvl text) returns void language plpgsql as $$ begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated', 'is_anonymous', false, 'aal', lvl)::text, false); execute 'set role authenticated'; end $$;
do $$ declare
  su uuid := '00000000-0000-0000-0000-000000000020'; md uuid := '00000000-0000-0000-0000-000000000021'; sp uuid := '00000000-0000-0000-0000-000000000022'; gn uuid := '00000000-0000-0000-0000-000000000023';
  ua uuid := '00000000-0000-0000-0000-000000000024'; ub uuid := '00000000-0000-0000-0000-000000000025';
  pid uuid; cid uuid; rid uuid; ident uuid; cnt int; m jsonb; rec jsonb; cat text;
begin
  perform pg_temp.as_user(ua); perform public.ensure_identity(); pid := public.create_post('a threatening post', 'life', null, null, null, true, true);
  perform pg_temp.as_user(ub); perform public.ensure_identity(); cid := public.add_comment(pid, 'spammy comment');
  perform public.report_content('post', pid, 'threat'); perform public.report_content('comment', cid, 'spam');
  -- anonymous identities are never admins
  perform pg_temp.as_user(ua);
  begin perform public.admin_metrics(); raise exception 'FAIL: anonymous user read metrics'; exception when sqlstate '42501' then null; end;
  select count(*) into cnt from public.admin_whoami(); if cnt <> 0 then raise exception 'FAIL: whoami leaked'; end if;
  -- an admin without MFA is refused; with MFA is allowed
  perform pg_temp.as_admin(su, 'aal1');
  select count(*) into cnt from public.admin_whoami() where role = 'super_admin' and aal = 'aal1'; if cnt <> 1 then raise exception 'FAIL: whoami aal1'; end if;
  begin perform public.admin_metrics(); raise exception 'FAIL: no MFA accepted'; exception when sqlstate '42501' then null; end;
  perform pg_temp.as_admin(su, 'aal2');
  m := public.admin_metrics(); if (m->>'posts_today')::int < 1 or (m->>'database_bytes')::bigint < 1 or (m->>'reports_open')::int < 2 then raise exception 'FAIL: metrics %', m; end if;
  select category into cat from public.admin_list_reports('open'); if cat <> 'threat' then raise exception 'FAIL: highest priority first'; end if;
  select count(*) into cnt from public.admin_list_reports('open') where target_body is not null and author_name is not null; if cnt <> 2 then raise exception 'FAIL: report context'; end if;
  -- roles and disabled admins
  perform pg_temp.as_admin(sp, 'aal2'); perform public.admin_metrics();
  begin perform public.admin_list_reports('open'); raise exception 'FAIL: support saw reports'; exception when sqlstate '42501' then null; end;
  begin perform public.admin_set_post_state(pid, 'remove', 'not allowed'); raise exception 'FAIL: support removed post'; exception when sqlstate '42501' then null; end;
  perform pg_temp.as_admin(gn, 'aal2');
  begin perform public.admin_metrics(); raise exception 'FAIL: disabled admin allowed'; exception when sqlstate '42501' then null; end;
  -- moderation: remove hides everywhere, restore brings it back, reasons are required, everything is audited
  perform pg_temp.as_admin(md, 'aal2');
  begin perform public.admin_set_post_state(pid, 'remove', 'no'); raise exception 'FAIL: reason not required'; exception when sqlstate '22023' then null; end;
  perform public.admin_set_post_state(pid, 'remove', 'credible threat of violence');
  perform pg_temp.as_user(ub); select count(*) into cnt from public.get_feed('fresh', null, 20, 0, pid); if cnt <> 0 then raise exception 'FAIL: removed post visible'; end if;
  reset role; set role anon; select count(*) into cnt from public.get_public_post(pid); if cnt <> 0 then raise exception 'FAIL: removed post public'; end if;
  perform pg_temp.as_admin(md, 'aal2'); perform public.admin_set_post_state(pid, 'restore', 'reviewed, appeal accepted');
  perform pg_temp.as_user(ub); select count(*) into cnt from public.get_feed('fresh', null, 20, 0, pid); if cnt <> 1 then raise exception 'FAIL: restored post hidden'; end if;
  perform pg_temp.as_admin(md, 'aal2'); perform public.admin_set_post_state(pid, 'lock_comments', 'brigading in comments');
  perform pg_temp.as_user(ub); begin perform public.add_comment(pid, 'x'); raise exception 'FAIL: locked comments accepted'; exception when sqlstate 'P0002' then null; end;
  perform pg_temp.as_admin(md, 'aal2'); perform public.admin_set_post_state(pid, 'unlock_comments', 'calm now');
  perform public.admin_set_comment_state(cid, 'remove', 'spam comment');
  perform pg_temp.as_user(ua); select count(*) into cnt from public.list_comments(pid); if cnt <> 0 then raise exception 'FAIL: removed comment visible'; end if;
  perform pg_temp.as_admin(md, 'aal2'); begin perform public.admin_audit(); raise exception 'FAIL: moderator read audit'; exception when sqlstate '42501' then null; end;
  -- identity actions
  ident := public.admin_target_identity('post', pid);
  perform public.admin_set_identity_state(ident, 'ban', 'repeated threats');
  perform pg_temp.as_user(ua); begin perform public.create_post('again', null, null, null, null, true, true); raise exception 'FAIL: banned identity posted'; exception when sqlstate '42501' then null; end;
  perform pg_temp.as_admin(md, 'aal2'); begin perform public.admin_set_identity_state(ident, 'restore', 'appeal upheld'); raise exception 'FAIL: moderator restored identity'; exception when sqlstate '42501' then null; end;
  perform pg_temp.as_admin(su, 'aal2'); perform public.admin_set_identity_state(ident, 'restore', 'appeal upheld');
  perform pg_temp.as_user(ua); perform public.create_post('back again', null, null, null, null, true, true);
  perform pg_temp.as_admin(su, 'aal2'); rec := public.admin_identity_record(ident);
  if rec->>'status' <> 'active' or (rec->>'reports_against')::int < 1 or jsonb_array_length(rec->'recent_actions') <> 2 then raise exception 'FAIL: identity record %', rec; end if;
  if rec::text ~* 'ip|email|phone' then raise exception 'FAIL: record contains personal data'; end if;
  -- resolving reports
  select id into rid from public.admin_list_reports('open') limit 1; perform public.admin_resolve_report('content', rid, 'actioned', 'post removed then restored');
  select count(*) into cnt from public.admin_list_reports('open'); if cnt <> 1 then raise exception 'FAIL: resolve'; end if;
  begin perform public.admin_resolve_report('content', rid, 'dismissed'); raise exception 'FAIL: double resolve'; exception when sqlstate 'P0002' then null; end;
  select id into rid from public.admin_list_random_reports('open') limit 1; if rid is null then raise exception 'FAIL: random report list'; end if;
  perform public.admin_resolve_report('random', rid, 'dismissed');
  -- audit trail
  select count(*) into cnt from public.admin_audit(200) where action in ('remove_post','restore_post','lock_comments_post','ban_identity','restore_identity','resolve_report','view_identity');
  if cnt < 8 then raise exception 'FAIL: audit rows %', cnt; end if;
  select count(*) into cnt from public.admin_audit(200) where admin_email = 'mod@x.test'; if cnt < 4 then raise exception 'FAIL: audit attribution'; end if;
  reset role; raise notice 'Admin tests passed';
end $$;

-- ===== AI Companion =====
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000030'), ('00000000-0000-0000-0000-000000000031') on conflict do nothing;
do $$ declare
  u1 uuid := '00000000-0000-0000-0000-000000000030'; u2 uuid := '00000000-0000-0000-0000-000000000031'; i1 uuid; i2 uuid; r record; sid uuid; cnt int; usedn int;
begin
  perform pg_temp.as_user(u1); perform public.ensure_identity(); perform pg_temp.as_user(u2); perform public.ensure_identity();
  reset role; select identity_id into i1 from private.identity_sessions where auth_user_id = u1; select identity_id into i2 from private.identity_sessions where auth_user_id = u2;
  perform pg_temp.as_user(u1);
  begin perform public.ai_config(); raise exception 'FAIL: client called AI function'; exception when insufficient_privilege then null; end;
  reset role; set role service_role;
  -- daily quota (limit 2): third message is refused, a refund gives one back
  reset role; insert into private.platform_config values ('ai_free_daily_limit', '2'::jsonb), ('ai_burst_per_minute', '100'::jsonb); set role service_role;
  select * into r from public.ai_begin_turn(i1, null, 'talk'); if not r.allowed or r.remaining <> 1 then raise exception 'FAIL: first turn'; end if; sid := r.session_id;
  perform public.ai_record_exchange(i1, sid, 'enc-user-1', 'enc-assistant-1', 10, 20, 'groq', 'enc-title');
  select * into r from public.ai_begin_turn(i1, sid, 'vent'); if not r.allowed or r.remaining <> 0 then raise exception 'FAIL: second turn'; end if;
  select * into r from public.ai_begin_turn(i1, sid, 'vent'); if r.allowed or r.reason <> 'quota_exceeded' then raise exception 'FAIL: quota not enforced'; end if;
  perform public.ai_refund_turn(i1); select * into r from public.ai_begin_turn(i1, sid, 'talk'); if not r.allowed then raise exception 'FAIL: refund'; end if;
  select t.used into usedn from public.ai_usage_today(i1) t; if usedn <> 2 then raise exception 'FAIL: usage count %', usedn; end if;
  -- ownership: another identity cannot read, extend or delete someone else's conversation
  select * into r from public.ai_begin_turn(i2, sid, 'talk'); if r.allowed or r.reason <> 'not_found' then raise exception 'FAIL: used another session'; end if;
  select count(*) into cnt from public.ai_get_messages(i2, sid); if cnt <> 0 then raise exception 'FAIL: read another session'; end if;
  select count(*) into cnt from public.ai_get_messages(i1, sid); if cnt <> 2 then raise exception 'FAIL: own messages %', cnt; end if;
  select count(*) into cnt from public.ai_list_sessions(i2); if cnt <> 0 then raise exception 'FAIL: listed another session'; end if;
  perform public.ai_delete_session(i2, sid); select count(*) into cnt from public.ai_get_messages(i1, sid); if cnt <> 2 then raise exception 'FAIL: deleted another session'; end if;
  begin perform public.ai_record_exchange(i2, sid, 'x', 'y', 0, 0, 'groq'); raise exception 'FAIL: wrote to another session'; exception when sqlstate 'P0002' then null; end;
  -- burst limit
  reset role; update private.platform_config set value = '2'::jsonb where key = 'ai_burst_per_minute'; update private.platform_config set value = '100'::jsonb where key = 'ai_free_daily_limit'; set role service_role;
  select * into r from public.ai_begin_turn(i2, null, 'calm'); perform public.ai_record_exchange(i2, r.session_id, 'a', 'b', 1, 1, 'groq');
  select * into r from public.ai_begin_turn(i2, r.session_id, 'calm'); perform public.ai_record_exchange(i2, r.session_id, 'a', 'b', 1, 1, 'groq');
  select * into r from public.ai_begin_turn(i2, r.session_id, 'calm'); if r.allowed or r.reason <> 'slow_down' then raise exception 'FAIL: burst limit'; end if;
  begin perform public.ai_begin_turn(i2, null, 'hacker'); raise exception 'FAIL: bad mode'; exception when sqlstate '22023' then null; end;
  perform public.ai_log_safety(i2, null, 'self_harm');
  -- retention: old messages are purged by the cleanup job
  reset role; update private.ai_messages set created_at = now() - interval '100 days' where session_id = sid; perform private.cleanup_expired();
  select count(*) into cnt from private.ai_messages where session_id = sid; if cnt <> 0 then raise exception 'FAIL: retention'; end if;
  -- deleting an identity deletes its conversations
  perform pg_temp.as_user(u2); perform public.delete_identity(); reset role;
  select count(*) into cnt from private.ai_sessions where identity_id = i2; if cnt <> 0 then raise exception 'FAIL: identity delete kept AI data'; end if;
  raise notice 'AI tests passed';
end $$;

-- ===== Billing, aliases, Plus =====
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000040'), ('00000000-0000-0000-0000-000000000041') on conflict do nothing;
do $$ declare
  u1 uuid := '00000000-0000-0000-0000-000000000040'; u2 uuid := '00000000-0000-0000-0000-000000000041'; su uuid := '00000000-0000-0000-0000-000000000020'; md uuid := '00000000-0000-0000-0000-000000000021';
  i1 uuid; i2 uuid; ref text; r text; ent jsonb; cnt int; nm text; pid uuid; ok boolean; why text; t record; freelim int;
begin
  perform pg_temp.as_user(u1); perform public.ensure_identity(); perform pg_temp.as_user(u2); perform public.ensure_identity();
  reset role; select identity_id into i1 from private.identity_sessions where auth_user_id = u1; select identity_id into i2 from private.identity_sessions where auth_user_id = u2;
  -- alias rules
  perform pg_temp.as_user(u1);
  select available, reason into ok, why from public.check_alias('ab'); if ok or why <> 'invalid' then raise exception 'FAIL: short alias'; end if;
  select available, reason into ok, why from public.check_alias('Admin'); if ok or why <> 'reserved' then raise exception 'FAIL: reserved alias'; end if;
  select available, reason into ok, why from public.check_alias('bad__name'); if ok then raise exception 'FAIL: double underscore'; end if;
  select available, reason into ok, why from public.check_alias('Midnight_Owl'); if not ok then raise exception 'FAIL: valid alias refused %', why; end if;
  begin perform public.billing_start_checkout(i1, 'x', 'USD', 300); raise exception 'FAIL: client called billing'; exception when insufficient_privilege then null; end;
  -- checkout and payment
  reset role; set role service_role;
  ref := public.billing_start_checkout(i1, 'Midnight_Owl', 'USD', 300);
  begin perform public.billing_start_checkout(i2, 'midnight_owl', 'USD', 300); raise exception 'FAIL: alias double-reserved'; exception when sqlstate '22023' then null; end;
  if public.billing_complete_order(ref, 'ps_1', 100, 'USD', 'CUS_1', null) <> 'mismatch' then raise exception 'FAIL: wrong amount accepted'; end if;
  reset role; select count(*) into cnt from private.aliases where identity_id = i1; if cnt <> 0 then raise exception 'FAIL: alias granted on mismatch'; end if; set role service_role;
  perform public.billing_set_subscription('CUS_1', 'SUB_1');   -- arrives before the order completes
  if public.billing_complete_order(ref, 'ps_1', 300, 'USD', 'CUS_1', null) <> 'ok' then raise exception 'FAIL: complete'; end if;
  if public.billing_complete_order(ref, 'ps_1', 300, 'USD', 'CUS_1', null) <> 'already' then raise exception 'FAIL: not idempotent'; end if;
  reset role; select count(*) into cnt from private.subscriptions where identity_id = i1 and subscription_code = 'SUB_1'; if cnt <> 1 then raise exception 'FAIL: early subscription code lost'; end if;
  perform pg_temp.as_user(u1); ent := public.my_entitlements();
  if not (ent->>'plus')::boolean or ent->>'alias' <> 'midnight_owl' or not (ent->>'auto_renews')::boolean or (ent->>'ai_daily_limit')::int <> 100 then raise exception 'FAIL: entitlements %', ent; end if;
  begin perform public.check_alias('midnight_owl'); select available into ok from public.check_alias('midnight_owl'); if ok then raise exception 'FAIL: taken alias available'; end if; end;
  -- one alias per identity
  reset role; set role service_role;
  begin perform public.billing_start_checkout(i1, 'another_one', 'USD', 300); raise exception 'FAIL: second alias'; exception when sqlstate '22023' then null; end;
  -- speaking as the alias
  perform pg_temp.as_user(u1); pid := public.create_post('A post under my alias', 'life', null, null, null, true, true);
  perform pg_temp.as_user(u2); select author_name into nm from public.get_feed('fresh', null, 20, 0, pid); if nm <> '@midnight_owl' then raise exception 'FAIL: alias not shown (%)', nm; end if;
  -- Plus lapses: the alias stays, extra features go
  reset role; update private.subscriptions set plus_until = now() - interval '1 day' where identity_id = i1; freelim := private.cfg('ai_free_daily_limit', 20);
  perform pg_temp.as_user(u1); ent := public.my_entitlements();
  if (ent->>'plus')::boolean or ent->>'alias' <> 'midnight_owl' or (ent->>'ai_daily_limit')::int <> freelim then raise exception 'FAIL: lapse %', ent; end if;
  perform public.create_post('Still mine after lapsing', null, null, null, null, true, true);
  perform pg_temp.as_user(u2); select count(*) into cnt from public.get_feed('fresh') where author_name = '@midnight_owl'; if cnt <> 2 then raise exception 'FAIL: alias lost after lapse'; end if;
  -- renewals extend, duplicates are ignored, strangers are unknown
  reset role; set role service_role;
  if public.billing_record_renewal('CUS_1', 'SUB_1', 'charge.success:r1') <> 'ok' then raise exception 'FAIL: renewal'; end if;
  if public.billing_record_renewal('CUS_1', 'SUB_1', 'charge.success:r1') <> 'duplicate' then raise exception 'FAIL: renewal repeated'; end if;
  if public.billing_record_renewal('NOPE', null, 'charge.success:r2') <> 'unknown' then raise exception 'FAIL: unknown customer'; end if;
  perform public.billing_subscription_ended('SUB_1', 'cancelled');
  perform pg_temp.as_user(u1); ent := public.my_entitlements(); if not (ent->>'plus')::boolean or (ent->>'auto_renews')::boolean then raise exception 'FAIL: cancel keeps the paid period only %', ent; end if;
  -- Plus raises the AI allowance
  reset role; insert into private.platform_config values ('ai_plus_daily_limit', '7'::jsonb) on conflict (key) do update set value = excluded.value; update private.platform_config set value = '3'::jsonb where key = 'ai_free_daily_limit'; update private.platform_config set value = '100'::jsonb where key = 'ai_burst_per_minute'; set role service_role;
  select remaining into cnt from public.ai_begin_turn(i1, null, 'talk'); if cnt <> 6 then raise exception 'FAIL: plus ai limit %', cnt; end if;
  select remaining into cnt from public.ai_begin_turn(i2, null, 'talk'); if cnt <> 2 then raise exception 'FAIL: free ai limit %', cnt; end if;
  -- switching it off only affects new threads
  perform pg_temp.as_user(u1); perform public.set_alias_default(false); pid := public.create_post('Anonymous again', null, null, null, null, true, true);
  perform pg_temp.as_user(u2); select author_name into nm from public.get_feed('fresh', null, 20, 0, pid); if nm like '@%' then raise exception 'FAIL: alias used after switching off'; end if;
  select count(*) into cnt from public.get_feed('fresh') where author_name = '@midnight_owl'; if cnt <> 2 then raise exception 'FAIL: old threads changed'; end if;
  -- public alias page
  reset role; set role anon; select post_count into cnt from public.get_public_alias('Midnight_Owl'); if cnt <> 2 then raise exception 'FAIL: public alias posts %', cnt; end if;
  -- revocation
  perform pg_temp.as_admin(md, 'aal2'); begin perform public.admin_revoke_alias(i1, 'impersonating staff'); raise exception 'FAIL: moderator revoked alias'; exception when sqlstate '42501' then null; end;
  perform pg_temp.as_admin(su, 'aal2'); perform public.admin_revoke_alias(i1, 'impersonating staff');
  reset role; set role anon; select count(*) into cnt from public.get_public_alias('midnight_owl'); if cnt <> 0 then raise exception 'FAIL: revoked alias public'; end if;
  perform pg_temp.as_user(u2); select available into ok from public.check_alias('midnight_owl'); if ok then raise exception 'FAIL: revoked alias reusable'; end if;
  perform pg_temp.as_user(u1); ent := public.my_entitlements(); if ent->>'alias' is not null or not (ent->>'alias_revoked')::boolean then raise exception 'FAIL: revoke state %', ent; end if;
  reset role; raise notice 'Billing tests passed';
end $$;

-- ===== Admin finance =====
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000050', 'fin@x.test'), ('00000000-0000-0000-0000-000000000051', null) on conflict do nothing;
insert into private.admins (auth_user_id, role) values ('00000000-0000-0000-0000-000000000050', 'finance');
do $$ declare
  fin uuid := '00000000-0000-0000-0000-000000000050'; mod uuid := '00000000-0000-0000-0000-000000000021'; u uuid := '00000000-0000-0000-0000-000000000051'; i uuid; ref text; m jsonb; cnt int;
begin
  perform pg_temp.as_user(u); perform public.ensure_identity(); reset role; select identity_id into i from private.identity_sessions where auth_user_id = u;
  set role service_role; ref := public.billing_start_checkout(i, null, 'USD', 300);
  if public.billing_complete_order(ref, 'ps_x', 1, 'USD', 'CUS_X', null) <> 'mismatch' then raise exception 'FAIL: setup'; end if;
  perform pg_temp.as_admin(mod, 'aal2');
  begin perform public.admin_list_orders(); raise exception 'FAIL: moderator saw orders'; exception when sqlstate '42501' then null; end;
  perform pg_temp.as_admin(fin, 'aal2');
  select count(*) into cnt from public.admin_list_orders('needs_review') where reference = ref and amount = 300; if cnt <> 1 then raise exception 'FAIL: order not listed'; end if;
  begin perform public.admin_resolve_order(ref, 'ok'); raise exception 'FAIL: reason not required'; exception when sqlstate '22023' then null; end;
  perform public.admin_resolve_order(ref, 'Refunded in Paystack dashboard');
  begin perform public.admin_resolve_order(ref, 'Refunded in Paystack dashboard'); raise exception 'FAIL: resolved twice'; exception when sqlstate 'P0002' then null; end;
  m := public.admin_metrics(); if m->'plus_active' is null or m->'ai_tokens_today' is null or (m->>'orders_needing_review')::int <> 0 or m->'aliases_claimed' is null then raise exception 'FAIL: metrics %', m; end if;
  perform pg_temp.as_admin('00000000-0000-0000-0000-000000000020', 'aal2');
  select count(*) into cnt from public.admin_audit(200) where action = 'resolve_order' and target_id = ref; if cnt <> 1 then raise exception 'FAIL: audit'; end if;
  reset role; raise notice 'Admin finance tests passed';
end $$;

-- ===== Image review queue =====
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000060'), ('00000000-0000-0000-0000-000000000061') on conflict do nothing;
do $$ declare
  u1 uuid := '00000000-0000-0000-0000-000000000060'; u2 uuid := '00000000-0000-0000-0000-000000000061'; md uuid := '00000000-0000-0000-0000-000000000021'; sp uuid := '00000000-0000-0000-0000-000000000022';
  i1 uuid; pid uuid; pid2 uuid; m1 uuid; m2 uuid; held boolean; cnt int; q record; k1 text := '2026/10/' || gen_random_uuid() || '.webp'; k2 text := '2026/10/' || gen_random_uuid() || '.webp';
begin
  perform pg_temp.as_user(u1); perform public.ensure_identity(); perform pg_temp.as_user(u2); perform public.ensure_identity();
  reset role; select identity_id into i1 from private.identity_sessions where auth_user_id = u1;
  insert into private.platform_config values ('media_review_required', '1'::jsonb) on conflict (key) do update set value = excluded.value;
  set role service_role; m1 := public.media_register(i1, k1, 'image/webp', 900, 40, 40); m2 := public.media_register(i1, k2, 'image/webp', 900, 40, 40);
  perform pg_temp.as_user(u1); pid := public.create_post('post with a photo', null, null, null, null, true, true); held := public.attach_post_media(pid, array[m1]);
  if not held then raise exception 'FAIL: image post not held'; end if;
  pid2 := public.create_post('text only post', null, null, null, null, true, true); if public.attach_post_media(pid2, null) then raise exception 'FAIL: text post held'; end if;
  perform pg_temp.as_user(u2);
  select count(*) into cnt from public.get_feed('fresh', null, 20, 0, pid); if cnt <> 0 then raise exception 'FAIL: held post visible in feed'; end if;
  select count(*) into cnt from public.get_media_for_posts(array[pid]); if cnt <> 0 then raise exception 'FAIL: held image visible'; end if;
  reset role; set role anon; select count(*) into cnt from public.get_public_post(pid); if cnt <> 0 then raise exception 'FAIL: held post public'; end if;
  perform pg_temp.as_admin(sp, 'aal2'); begin perform public.admin_review_queue(); raise exception 'FAIL: support saw queue'; exception when sqlstate '42501' then null; end;
  perform pg_temp.as_admin(md, 'aal2');
  select * into q from public.admin_review_queue() where id = pid; if q.id is null or jsonb_array_length(q.media) <> 1 or q.media->0->>'key' <> k1 then raise exception 'FAIL: queue content'; end if;
  if public.admin_review_count() < 1 then raise exception 'FAIL: review count'; end if;
  perform public.admin_set_post_state(pid, 'approve', 'reviewed, fine');
  perform pg_temp.as_user(u2); select count(*) into cnt from public.get_feed('fresh', null, 20, 0, pid); if cnt <> 1 then raise exception 'FAIL: approved post hidden'; end if;
  select count(*) into cnt from public.get_media_for_posts(array[pid]); if cnt <> 1 then raise exception 'FAIL: approved image hidden'; end if;
  -- reject path
  perform pg_temp.as_user(u1); pid2 := public.create_post('second photo post', null, null, null, null, true, true); perform public.attach_post_media(pid2, array[m2]);
  perform pg_temp.as_admin(md, 'aal2'); perform public.admin_set_post_state(pid2, 'reject', 'not allowed content');
  begin perform public.admin_set_post_state(pid2, 'approve', 'second attempt'); raise exception 'FAIL: approved a rejected post'; exception when sqlstate 'P0002' then null; end;
  perform pg_temp.as_user(u2); select count(*) into cnt from public.get_feed('fresh', null, 20, 0, pid2); if cnt <> 0 then raise exception 'FAIL: rejected post visible'; end if;
  -- review can be switched off
  reset role; update private.platform_config set value = '0'::jsonb where key = 'media_review_required';
  set role service_role; m1 := public.media_register(i1, '2026/10/' || gen_random_uuid() || '.webp', 'image/webp', 900, 40, 40);
  perform pg_temp.as_user(u1); pid := public.create_post('no review needed', null, null, null, null, true, true); if public.attach_post_media(pid, array[m1]) then raise exception 'FAIL: held while off'; end if;
  reset role; update private.platform_config set value = '1'::jsonb where key = 'media_review_required';
  raise notice 'Image review tests passed';
end $$;

-- ===== Direct messages =====
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000070'), ('00000000-0000-0000-0000-000000000071'), ('00000000-0000-0000-0000-000000000072') on conflict do nothing;
do $$ declare
  ua uuid := '00000000-0000-0000-0000-000000000070'; ub uuid := '00000000-0000-0000-0000-000000000071'; uc uuid := '00000000-0000-0000-0000-000000000072'; md uuid := '00000000-0000-0000-0000-000000000021';
  ia uuid; ib uuid; ic uuid; pid uuid; pidc uuid; conv uuid; conv2 uuid; cnt int; nm text; r record; m record; cid uuid;
begin
  perform pg_temp.as_user(ua); perform public.ensure_identity(); perform pg_temp.as_user(ub); perform public.ensure_identity(); perform pg_temp.as_user(uc); perform public.ensure_identity();
  reset role; select identity_id into ia from private.identity_sessions where auth_user_id = ua; select identity_id into ib from private.identity_sessions where auth_user_id = ub; select identity_id into ic from private.identity_sessions where auth_user_id = uc;
  perform pg_temp.as_user(ub); pid := public.create_post('post to message about', null, null, null, null, true, true); cid := public.add_comment(pid, 'a comment'); perform pg_temp.as_user(ua); perform public.add_comment(pid, 'ua comment');
  reset role; set role service_role;
  begin perform public.dm_start(ia, 'post', pid); raise exception 'FAIL: free identity started a DM'; exception when sqlstate '42501' then null; end;
  reset role; insert into private.subscriptions (identity_id, plus_until) values (ia, now() + interval '30 days'); set role service_role;
  conv := public.dm_start(ia, 'post', pid);
  if public.dm_start(ia, 'post', pid) <> conv then raise exception 'FAIL: duplicate conversation created'; end if;
  begin perform public.dm_start(ib, 'post', pid); raise exception 'FAIL: DM to self'; exception when sqlstate '42501' or sqlstate 'P0002' then null; end;
  if public.dm_peer_name(ia, conv) is null or public.dm_peer_name(ia, conv) = public.dm_peer_name(ib, conv) then raise exception 'FAIL: peer names'; end if;
  perform public.dm_send(ia, conv, 'enc-1'); perform public.dm_send(ib, conv, 'enc-2');   -- the recipient replies without Plus
  select count(*) into cnt from public.dm_messages(ia, conv); if cnt <> 2 then raise exception 'FAIL: messages %', cnt; end if;
  select count(*) into cnt from public.dm_messages(ic, conv); if cnt <> 0 then raise exception 'FAIL: outsider read messages'; end if;
  begin perform public.dm_send(ic, conv, 'x'); raise exception 'FAIL: outsider sent'; exception when sqlstate 'P0002' then null; end;
  select * into r from public.dm_list(ib) where conversation_id = conv; if r.last_enc <> 'enc-2' or not r.last_from_me or r.unread <> 0 then raise exception 'FAIL: list for b % %', r.last_enc, r.unread; end if;  -- replying counts as reading
  select * into r from public.dm_list(ia) where conversation_id = conv; if r.unread <> 1 or r.peer_name = '' then raise exception 'FAIL: list for a'; end if;
  perform public.dm_mark_read(ia, conv); select unread into cnt from public.dm_list(ia) where conversation_id = conv; if cnt <> 0 then raise exception 'FAIL: mark read'; end if;
  -- a clients cannot call any of it
  reset role; perform pg_temp.as_user(ua); begin perform public.dm_list(ia); raise exception 'FAIL: client called dm'; exception when sqlstate '42501' then null; end; reset role; set role service_role;
  -- reporting stores the context, blocks the peer, and shows up for moderators with its source
  perform public.dm_file_report(ia, conv, 'harassment', '[{"s":"reported","t":"hello"}]'::jsonb);
  if not public.random_blocked(ia, ib) then raise exception 'FAIL: report did not block'; end if;
  select count(*) into cnt from public.dm_list(ia); if cnt <> 0 then raise exception 'FAIL: blocked conversation still listed'; end if;
  begin perform public.dm_send(ib, conv, 'after block'); raise exception 'FAIL: blocked sender can still send'; exception when sqlstate 'P0002' then null; end;
  reset role; perform pg_temp.as_admin(md, 'aal2');
  select * into m from public.admin_list_random_reports('open') where source = 'dm'; if m.id is null or m.category <> 'harassment' then raise exception 'FAIL: admin sees dm report'; end if;
  -- leaving and deleting
  reset role; delete from private.blocks; set role service_role;
  reset role; perform pg_temp.as_user(uc); pidc := public.create_post('post by c', null, null, null, null, true, true); reset role; set role service_role;
  if public.dm_start(ia, 'comment', cid) <> conv then raise exception 'FAIL: comment DM should reuse the conversation'; end if;
  conv2 := public.dm_start(ia, 'post', pidc); perform public.dm_leave(ia, conv2); begin perform public.dm_send(ia, conv2, 'x'); raise exception 'FAIL: sent after leaving'; exception when sqlstate 'P0002' then null; end;
  perform public.dm_leave(ic, conv2); reset role; select count(*) into cnt from private.conversations where id = conv2; if cnt <> 0 then raise exception 'FAIL: conversation kept after both left'; end if;
  -- retention and identity deletion
  update private.dm_messages set created_at = now() - interval '100 days' where conversation_id = conv; perform private.cleanup_expired();
  select count(*) into cnt from private.dm_messages where conversation_id = conv; if cnt <> 0 then raise exception 'FAIL: dm retention'; end if;
  set role service_role; perform public.dm_send(ia, conv, 'enc-3'); reset role;
  perform pg_temp.as_user(ua); perform public.delete_identity(); reset role;
  select count(*) into cnt from private.dm_messages where sender_identity_id = ia; if cnt <> 0 then raise exception 'FAIL: identity delete kept messages'; end if;
  raise notice 'Direct message tests passed';
end $$;

-- ===== Adult gate and name search =====
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000080'), ('00000000-0000-0000-0000-000000000081') on conflict do nothing;
do $$ declare
  u1 uuid := '00000000-0000-0000-0000-000000000080'; u2 uuid := '00000000-0000-0000-0000-000000000081'; i1 uuid; i2 uuid; r record; ref text; cnt int; av jsonb;
begin
  perform pg_temp.as_user(u1); perform public.ensure_identity(); perform pg_temp.as_user(u2); perform public.ensure_identity();
  reset role; select identity_id into i1 from private.identity_sessions where auth_user_id = u1; select identity_id into i2 from private.identity_sessions where auth_user_id = u2;
  perform pg_temp.as_user(u1); begin perform public.random_mode_check(u1, 'text'); raise exception 'FAIL: client called mode check'; exception when insufficient_privilege then null; end;
  av := public.random_availability(); if (av->>'video')::boolean or (av->>'audio')::boolean or (av->>'adult')::boolean then raise exception 'FAIL: availability %', av; end if;
  reset role; set role service_role;
  select * into r from public.random_mode_check(u1, 'text'); if not r.allowed then raise exception 'FAIL: text should be allowed'; end if;
  select * into r from public.random_mode_check(u1, 'video'); if r.allowed or r.reason <> 'disabled' then raise exception 'FAIL: video should be off by default %', r.reason; end if;
  select * into r from public.random_mode_check(u1, 'hologram'); if r.allowed or r.reason <> 'invalid' then raise exception 'FAIL: invalid mode'; end if;
  reset role; insert into private.platform_config values ('random_video_enabled', '1'::jsonb) on conflict (key) do update set value = excluded.value; set role service_role;
  select * into r from public.random_mode_check(u1, 'video'); if r.allowed or r.reason <> 'adult_required' then raise exception 'FAIL: adult gate %', r.reason; end if;
  select * into r from public.random_mode_check(u1, 'audio'); if r.reason <> 'disabled' then raise exception 'FAIL: audio switch separate from video'; end if;
  reset role; perform pg_temp.as_user(u1); perform public.confirm_adult(); av := public.random_availability(); if not (av->>'adult')::boolean or not (av->>'video')::boolean then raise exception 'FAIL: availability after %', av; end if;
  reset role; set role service_role;
  select * into r from public.random_mode_check(u1, 'video'); if not r.allowed then raise exception 'FAIL: adult should pass'; end if;
  select * into r from public.random_mode_check(u2, 'video'); if r.allowed then raise exception 'FAIL: other identity passed the gate'; end if;
  reset role; update private.identities set status = 'restricted' where id = i1; set role service_role;
  select * into r from public.random_mode_check(u1, 'text'); if r.allowed or r.reason <> 'not_allowed' then raise exception 'FAIL: restricted identity allowed'; end if;
  reset role; update private.identities set status = 'active' where id = i1; update private.platform_config set value = '0'::jsonb where key = 'random_video_enabled';
  -- name search
  set role service_role; ref := public.billing_start_checkout(i2, 'search_owl', 'USD', 300); perform public.billing_complete_order(ref, 'ps_s', 300, 'USD', 'CUS_S', null);
  perform pg_temp.as_user(u1);
  select count(*) into cnt from public.search_aliases('sear'); if cnt <> 1 then raise exception 'FAIL: prefix search %', cnt; end if;
  select count(*) into cnt from public.search_aliases('SEARCH_O'); if cnt <> 1 then raise exception 'FAIL: case/underscore search'; end if;
  select count(*) into cnt from public.search_aliases('s'); if cnt <> 0 then raise exception 'FAIL: one-letter search'; end if;
  select count(*) into cnt from public.search_aliases('%'); if cnt <> 0 then raise exception 'FAIL: wildcard search'; end if;
  select count(*) into cnt from public.search_aliases('sx_'); if cnt <> 0 then raise exception 'FAIL: underscore treated as wildcard'; end if;
  reset role; update private.aliases set revoked_at = now() where identity_id = i2; perform pg_temp.as_user(u1);
  select count(*) into cnt from public.search_aliases('search'); if cnt <> 0 then raise exception 'FAIL: revoked alias searchable'; end if;
  reset role; raise notice 'Adult gate and search tests passed';
end $$;

-- ===== Resonance and streaks =====
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-000000000090'), ('00000000-0000-0000-0000-000000000091'), ('00000000-0000-0000-0000-000000000092') on conflict do nothing;
do $$ declare
  ua uuid := '00000000-0000-0000-0000-000000000090'; ub uuid := '00000000-0000-0000-0000-000000000091'; uc uuid := '00000000-0000-0000-0000-000000000092';
  ia uuid; ib uuid; ic uuid; pid uuid; pid2 uuid; st jsonb; n int; cid uuid;
begin
  perform pg_temp.as_user(ua); perform public.ensure_identity(); perform pg_temp.as_user(ub); perform public.ensure_identity(); perform pg_temp.as_user(uc); perform public.ensure_identity();
  reset role; select identity_id into ia from private.identity_sessions where auth_user_id = ua; select identity_id into ib from private.identity_sessions where auth_user_id = ub; select identity_id into ic from private.identity_sessions where auth_user_id = uc;
  perform pg_temp.as_user(ua); pid := public.create_post('a post that gets reactions', null, null, null, null, true, true);
  st := public.my_standing(); if (st->>'streak')::int <> 1 or (st->>'resonance')::int <> 0 then raise exception 'FAIL: first post streak %', st; end if;
  perform public.toggle_reaction('post', pid);   -- reacting to your own post earns nothing
  st := public.my_standing(); if (st->>'resonance')::int <> 0 then raise exception 'FAIL: self reaction awarded'; end if;
  perform pg_temp.as_user(ub); perform public.toggle_reaction('post', pid);
  perform pg_temp.as_user(ua); st := public.my_standing(); if (st->>'resonance')::int <> 1 then raise exception 'FAIL: reaction award %', st; end if;
  perform pg_temp.as_user(ub); perform public.toggle_reaction('post', pid); perform public.toggle_reaction('post', pid);   -- off then on again
  perform pg_temp.as_user(ua); st := public.my_standing(); if (st->>'resonance')::int <> 1 then raise exception 'FAIL: toggling farmed points %', st; end if;
  perform pg_temp.as_user(ub); cid := public.add_comment(pid, 'nice'); perform public.set_echo(pid, true);
  perform pg_temp.as_user(ua); st := public.my_standing(); if (st->>'resonance')::int <> 3 then raise exception 'FAIL: comment award, and the echo that would pass the daily cap is ignored %', st; end if;
  -- daily cap per giver: B has already given 5 to A today, so more is ignored
  perform pg_temp.as_user(ub); perform public.add_comment(pid, 'another');
  perform pg_temp.as_user(ua); st := public.my_standing(); if (st->>'resonance')::int <> 5 then raise exception 'FAIL: reaching the cap %', st; end if;
  perform pg_temp.as_user(ub); perform public.add_comment(pid, 'and another');
  perform pg_temp.as_user(ua); st := public.my_standing(); if (st->>'resonance')::int <> 5 then raise exception 'FAIL: per-giver cap %', st; end if;
  -- nothing from a banned identity
  reset role; update private.identities set status = 'banned', risk_level = 'banned' where id = ic; perform pg_temp.as_user(ua); pid2 := public.create_post('second post', null, null, null, null, true, true);
  perform pg_temp.as_user(uc); begin perform public.toggle_reaction('post', pid2); exception when sqlstate '42501' then null; end;
  reset role; select count(*) into n from private.karma_events where actor_identity_id = ic; if n <> 0 then raise exception 'FAIL: banned identity earned someone points'; end if;
  -- levels raise the internal trust level
  reset role; insert into private.karma (identity_id, points) values (ib, 0) on conflict do nothing; perform private.award_karma(ib, ia, 'reaction', 'x:1', 5); update private.karma set points = 19 where identity_id = ib;
  perform private.award_karma(ib, ic, 'reaction', 'x:2', 1); select count(*) into n from private.identities where id = ib and trust_level >= 1; if n <> 0 then raise exception 'FAIL: ic is banned so no award'; end if;
  update private.identities set status = 'active', risk_level = 'low' where id = ic; perform private.award_karma(ib, ic, 'reaction', 'x:3', 1);
  select count(*) into n from private.identities where id = ib and trust_level >= 1; if n <> 1 then raise exception 'FAIL: level up'; end if;
  -- streaks: consecutive days grow, a gap resets, a lapsed streak shows 0
  update private.streaks set last_activity_date = current_date - 1, current_streak = 3, longest_streak = 3 where identity_id = ia;
  perform pg_temp.as_user(ua); perform public.create_post('streak day 4', null, null, null, null, true, true); st := public.my_standing();
  if (st->>'streak')::int <> 4 or (st->>'longest_streak')::int <> 4 then raise exception 'FAIL: streak grows %', st; end if;
  perform public.create_post('same day', null, null, null, null, true, true); st := public.my_standing(); if (st->>'streak')::int <> 4 then raise exception 'FAIL: same-day streak change'; end if;
  reset role; update private.streaks set last_activity_date = current_date - 3 where identity_id = ia; perform pg_temp.as_user(ua); st := public.my_standing(); if (st->>'streak')::int <> 0 or (st->>'longest_streak')::int <> 4 then raise exception 'FAIL: lapsed streak %', st; end if;
  perform public.create_post('starting again', null, null, null, null, true, true); st := public.my_standing(); if (st->>'streak')::int <> 1 then raise exception 'FAIL: streak restart'; end if;
  perform public.set_show_streak(false); st := public.my_standing(); if (st->>'show_streak')::boolean then raise exception 'FAIL: hide streak'; end if;
  -- opening the app earns nothing; one person cannot see another's numbers
  perform pg_temp.as_user(uc); st := public.my_standing(); if (st->>'streak')::int <> 0 or (st->>'resonance')::int <> 0 then raise exception 'FAIL: wrong person data %', st; end if;
  reset role; perform pg_temp.as_user(ub); begin perform private.award_karma(ia, ib, 'reaction', 'y', 1); raise exception 'FAIL: client called private function'; exception when insufficient_privilege then null; end;
  reset role; raise notice 'Resonance and streak tests passed';
end $$;

-- ===== Automated image scanning =====
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000a0'), ('00000000-0000-0000-0000-0000000000a1') on conflict do nothing;
do $$ declare
  u1 uuid := '00000000-0000-0000-0000-0000000000a0'; md uuid := '00000000-0000-0000-0000-000000000021'; sp uuid := '00000000-0000-0000-0000-000000000022'; i1 uuid; pid uuid; m uuid; cnt int; held boolean;
  mk text := '2026/10/' || gen_random_uuid() || '.webp';
begin
  perform pg_temp.as_user(u1); perform public.ensure_identity(); reset role; select identity_id into i1 from private.identity_sessions where auth_user_id = u1;
  insert into private.platform_config values ('media_review_required', '0'::jsonb), ('media_scan_required', '0'::jsonb) on conflict (key) do update set value = excluded.value;
  set role service_role;
  begin perform public.media_register(i1, mk, 'image/webp', 900, 40, 40, 'nonsense'); raise exception 'FAIL: bad scan status accepted'; exception when sqlstate '22023' then null; end;
  -- scanned clean and review off: publishes at once
  m := public.media_register(i1, mk, 'image/webp', 900, 40, 40, 'allow', '{"sexual":0.01}'::jsonb);
  perform pg_temp.as_user(u1); pid := public.create_post('clean image', null, null, null, null, true, true); if public.attach_post_media(pid, array[m]) then raise exception 'FAIL: clean scanned image held'; end if;
  -- scanner asks for a person
  reset role; set role service_role; m := public.media_register(i1, '2026/10/' || gen_random_uuid() || '.webp', 'image/webp', 900, 40, 40, 'review', '{"violence":0.8}'::jsonb);
  perform pg_temp.as_user(u1); pid := public.create_post('flagged image', null, null, null, null, true, true); if not public.attach_post_media(pid, array[m]) then raise exception 'FAIL: flagged image not held'; end if;
  -- scan did not run: published unless scanning is required
  reset role; set role service_role; m := public.media_register(i1, '2026/10/' || gen_random_uuid() || '.webp', 'image/webp', 900, 40, 40);
  perform pg_temp.as_user(u1); pid := public.create_post('unscanned image', null, null, null, null, true, true); if public.attach_post_media(pid, array[m]) then raise exception 'FAIL: unscanned held while scanning optional'; end if;
  reset role; update private.platform_config set value = '1'::jsonb where key = 'media_scan_required'; set role service_role; m := public.media_register(i1, '2026/10/' || gen_random_uuid() || '.webp', 'image/webp', 900, 40, 40);
  perform pg_temp.as_user(u1); pid := public.create_post('unscanned image 2', null, null, null, null, true, true); if not public.attach_post_media(pid, array[m]) then raise exception 'FAIL: unscanned not held when scanning required'; end if;
  -- blocked uploads leave a record for moderators; only moderators can read it
  reset role; set role service_role; perform public.media_log_block(i1, true, '{"sexual/minors":true}'::jsonb);
  perform pg_temp.as_user(u1); begin perform public.admin_scan_events(); raise exception 'FAIL: anonymous read scan events'; exception when sqlstate '42501' then null; end;
  perform pg_temp.as_admin(sp, 'aal2'); begin perform public.admin_scan_events(); raise exception 'FAIL: support read scan events'; exception when sqlstate '42501' then null; end;
  perform pg_temp.as_admin(md, 'aal2'); select count(*) into cnt from public.admin_scan_events() where result = 'block' and urgent and identity_id = i1; if cnt <> 1 then raise exception 'FAIL: block event not listed'; end if;
  select count(*) into cnt from public.admin_scan_events() where result = 'review' and identity_id = i1; if cnt <> 1 then raise exception 'FAIL: review event not listed'; end if;
  reset role; update private.platform_config set value = '0'::jsonb where key = 'media_scan_required'; update private.platform_config set value = '1'::jsonb where key = 'media_review_required';
  raise notice 'Image scanning tests passed';
end $$;

-- ===== Refunds =====
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000b0') on conflict do nothing;
do $$ declare
  u1 uuid := '00000000-0000-0000-0000-0000000000b0'; fin uuid := '00000000-0000-0000-0000-000000000050'; sp uuid := '00000000-0000-0000-0000-000000000022'; su uuid := '00000000-0000-0000-0000-000000000020';
  i1 uuid; ref text; ref2 text; r record; e jsonb; cnt int; st text;
begin
  perform pg_temp.as_user(u1); perform public.ensure_identity(); reset role; select identity_id into i1 from private.identity_sessions where auth_user_id = u1;
  set role service_role; ref := public.billing_start_checkout(i1, 'refund_me', 'USD', 300); perform public.billing_complete_order(ref, 'ps_r', 300, 'USD', 'CUS_R', 'SUB_R');
  perform pg_temp.as_user(u1); e := public.my_entitlements(); if not (e->>'plus')::boolean or e->>'alias' <> 'refund_me' then raise exception 'FAIL: setup %', e; end if;
  reset role; set role service_role;
  begin perform public.billing_begin_refund(ref, sp, 'customer asked nicely'); raise exception 'FAIL: support started a refund'; exception when sqlstate '42501' then null; end;
  begin perform public.billing_begin_refund(ref, u1, 'customer asked nicely'); raise exception 'FAIL: non-admin started a refund'; exception when sqlstate '42501' then null; end;
  begin perform public.billing_begin_refund(ref, fin, 'no'); raise exception 'FAIL: reason not required'; exception when sqlstate '22023' then null; end;
  select * into r from public.billing_begin_refund(ref, fin, 'customer asked nicely'); if r.amount <> 300 or r.currency <> 'USD' then raise exception 'FAIL: begin refund'; end if;
  begin perform public.billing_begin_refund(ref, fin, 'customer asked again'); raise exception 'FAIL: double refund'; exception when sqlstate 'P0002' then null; end;
  -- a failed refund goes back to paid and takes nothing away
  st := public.billing_finish_refund(ref, false, 'bank declined'); if st <> 'failed' then raise exception 'FAIL: failed refund %', st; end if;
  perform pg_temp.as_user(u1); e := public.my_entitlements(); if not (e->>'plus')::boolean or e->>'alias' <> 'refund_me' then raise exception 'FAIL: failed refund removed things'; end if;
  reset role; set role service_role; perform public.billing_begin_refund(ref, fin, 'second attempt works');
  st := public.billing_finish_refund(ref, true, 'rf_1'); if st <> 'refunded' then raise exception 'FAIL: finish %', st; end if;
  if public.billing_finish_refund(ref, true, 'rf_1') <> 'ignored' then raise exception 'FAIL: finish not idempotent'; end if;
  perform pg_temp.as_user(u1); e := public.my_entitlements();
  if (e->>'plus')::boolean or e->>'alias' is not null or not (e->>'alias_revoked')::boolean or (e->>'auto_renews')::boolean then raise exception 'FAIL: refund did not take back the purchase %', e; end if;
  reset role; select count(*) into cnt from private.orders where reference = ref and status = 'refunded' and refund_ref = 'rf_1'; if cnt <> 1 then raise exception 'FAIL: order state'; end if;
  perform pg_temp.as_admin(su, 'aal2'); select count(*) into cnt from public.admin_audit(300) where target_id = ref and action in ('start_refund','refund_completed','refund_failed'); if cnt <> 4 then raise exception 'FAIL: audit rows %', cnt; end if;
  -- outside the refund window
  set role service_role; ref2 := public.billing_start_checkout(i1, null, 'USD', 300); perform public.billing_complete_order(ref2, 'ps_r2', 300, 'USD', 'CUS_R2', null);
  reset role; update private.orders set paid_at = now() - interval '45 days' where reference = ref2; set role service_role;
  begin perform public.billing_begin_refund(ref2, fin, 'too late really'); raise exception 'FAIL: refunded outside the window'; exception when sqlstate 'P0002' then null; end;
  reset role; raise notice 'Refund tests passed';
end $$;

-- ===== Push notifications =====
reset role;
insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000c0'), ('00000000-0000-0000-0000-0000000000c1') on conflict do nothing;
do $$ declare
  ua uuid := '00000000-0000-0000-0000-0000000000c0'; ub uuid := '00000000-0000-0000-0000-0000000000c1'; ia uuid; ib uuid; pid uuid; wid uuid; cnt int; r record; ep text := 'https://push.example.test/send/' || gen_random_uuid(); pr jsonb; ids bigint[];
  k1 text := repeat('B', 87); k2 text := repeat('a', 22);
begin
  perform pg_temp.as_user(ua); perform public.ensure_identity(); perform pg_temp.as_user(ub); perform public.ensure_identity();
  reset role; select identity_id into ia from private.identity_sessions where auth_user_id = ua; select identity_id into ib from private.identity_sessions where auth_user_id = ub;
  perform pg_temp.as_user(ua); pid := public.create_post('post that gets replies', null, null, null, null, true, true);
  perform pg_temp.as_user(ub); perform public.add_comment(pid, 'queued nowhere: A has no subscribed device yet');
  reset role; select count(*) into cnt from private.notifications; if cnt <> 0 then raise exception 'FAIL: queued for a person with no device'; end if;
  perform pg_temp.as_user(ua);
  begin perform public.push_subscribe('http://insecure.test/x', k1, k2); raise exception 'FAIL: insecure endpoint accepted'; exception when sqlstate '22023' then null; end;
  perform public.push_subscribe(ep, k1, k2); pr := public.get_notification_prefs(); if (pr->>'activity')::boolean or not (pr->>'replies')::boolean then raise exception 'FAIL: default prefs %', pr; end if;
  perform pg_temp.as_user(ub); perform public.add_comment(pid, 'now A has a device');
  reset role; select count(*) into cnt from private.notifications where identity_id = ia and kind = 'reply' and ref_id = pid::text; if cnt <> 1 then raise exception 'FAIL: reply not queued'; end if;
  perform pg_temp.as_user(ub); perform public.add_comment(pid, 'second comment right after');
  reset role; select count(*) into cnt from private.notifications where identity_id = ia and kind = 'reply'; if cnt <> 1 then raise exception 'FAIL: not coalesced %', cnt; end if;
  perform pg_temp.as_user(ua); perform public.add_comment(pid, 'my own comment'); reset role; select count(*) into cnt from private.notifications where identity_id = ia; if cnt <> 1 then raise exception 'FAIL: notified about own action'; end if;
  perform pg_temp.as_user(ub); wid := public.send_whisper(pid, 'psst'); perform public.set_echo(pid, true);
  reset role; select count(*) into cnt from private.notifications where identity_id = ia and kind = 'whisper'; if cnt <> 1 then raise exception 'FAIL: whisper not queued'; end if;
  select count(*) into cnt from private.notifications where identity_id = ia and kind = 'echo'; if cnt <> 0 then raise exception 'FAIL: echo queued although activity is off'; end if;
  perform pg_temp.as_user(ua); perform public.set_notification_prefs(true, false, true, true); perform pg_temp.as_user(ub); perform public.set_echo(pid, false); perform public.set_echo(pid, true);
  reset role; select count(*) into cnt from private.notifications where identity_id = ia and kind = 'echo'; if cnt <> 1 then raise exception 'FAIL: echo not queued with activity on'; end if;
  delete from private.notifications where kind = 'whisper'; perform pg_temp.as_user(ua); pid := public.create_post('second', null, null, null, null, true, true);
  perform pg_temp.as_user(ub); perform public.send_whisper(pid, 'x'); perform pg_temp.as_user(ub); reset role; select count(*) into cnt from private.notifications where kind = 'whisper'; if cnt <> 0 then raise exception 'FAIL: whispers off but queued'; end if;
  -- clients cannot touch the sending side
  perform pg_temp.as_user(ua); begin perform public.push_take_batch(); raise exception 'FAIL: client took a batch'; exception when insufficient_privilege then null; end;
  -- the Worker claims a batch once, marks it sent, and drops dead subscriptions
  reset role; set role service_role; select count(*) into cnt from public.push_take_batch(50); if cnt <> 2 then raise exception 'FAIL: batch size %', cnt; end if;
  select count(*) into cnt from public.push_take_batch(50) where true; if cnt <> 2 then raise exception 'FAIL: retry within attempts'; end if;
  reset role; select array_agg(id) into ids from private.notifications; set role service_role; perform public.push_mark_sent(ids); reset role;
  set role service_role; select count(*) into cnt from public.push_take_batch(50); if cnt <> 0 then raise exception 'FAIL: sent items offered again'; end if;
  perform public.push_drop_subscription(ep); reset role; select count(*) into cnt from private.push_subscriptions; if cnt <> 0 then raise exception 'FAIL: dead subscription kept'; end if;
  -- blocked senders get no notifications through, and purging an identity removes its devices
  perform pg_temp.as_user(ua); perform public.push_subscribe(ep, k1, k2); perform public.set_notification_prefs(true, true, true, false);
  perform pg_temp.as_user(ub); perform public.add_comment(pid, 'c1');
  perform pg_temp.as_user(ua); perform public.block_author('comment', (select id from public.list_comments(pid) where not mine limit 1));
  reset role; delete from private.notifications where kind = 'reply' and ref_id = pid::text;
  perform pg_temp.as_user(ub); perform public.add_comment(pid, 'c2'); reset role;
  select count(*) into cnt from private.notifications where kind = 'reply' and ref_id = pid::text; if cnt <> 0 then raise exception 'FAIL: blocked sender notified'; end if;
  update private.identities set status = 'purged' where id = ia; select count(*) into cnt from private.push_subscriptions where identity_id = ia; if cnt <> 0 then raise exception 'FAIL: purge kept subscriptions'; end if;
  raise notice 'Push notification tests passed';
end $$;
