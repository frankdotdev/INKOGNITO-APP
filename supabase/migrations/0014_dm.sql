-- Direct messages: private one-to-one conversations between anonymous identities, started from a post, comment or Whisper.
-- Starting a conversation needs Plus; replying does not. Message text is encrypted by the DM Worker before it is stored
-- (encryption at rest, not end-to-end: the Worker can read it so it can show reports to moderators). Only the Worker touches these tables.
create table private.conversations (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), last_message_at timestamptz not null default now()
);
create table private.conversation_participants (
  conversation_id uuid not null references private.conversations(id) on delete cascade,
  identity_id uuid not null references private.identities(id) on delete cascade,
  context_id uuid not null references private.identity_contexts(id),
  joined_at timestamptz not null default now(), left_at timestamptz, last_read_at timestamptz not null default now(),
  primary key (conversation_id, identity_id)
);
create index on private.conversation_participants (identity_id) where left_at is null;
create table private.dm_messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references private.conversations(id) on delete cascade,
  sender_identity_id uuid not null references private.identities(id) on delete cascade, content_enc text not null, created_at timestamptz not null default clock_timestamp()
);
create index on private.dm_messages (conversation_id, created_at desc);
alter table private.random_reports add column source text not null default 'random' check (source in ('random','dm'));
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'private' loop
    execute format('alter table private.%I enable row level security', t.tablename);
    execute format('alter table private.%I force row level security', t.tablename);
  end loop; end $$;

create function private.dm_member(p_identity uuid, p_conv uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.conversation_participants where conversation_id = p_conv and identity_id = p_identity and left_at is null) $$;
create function private.dm_peer(p_identity uuid, p_conv uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select identity_id from private.conversation_participants where conversation_id = p_conv and identity_id <> p_identity $$;

create function public.dm_start(p_identity uuid, p_type text, p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target uuid; conv uuid; c1 private.identity_contexts; c2 private.identity_contexts;
begin
  if not private.plus_active(p_identity) then raise exception 'plus_required' using errcode = '42501'; end if;
  if p_type = 'post' then select identity_id into target from private.posts where id = p_id and status = 'active' and moderation_state = 'allow';
  elsif p_type = 'comment' then select m.identity_id into target from private.comments m join private.posts p on p.id = m.post_id where m.id = p_id and m.status = 'active' and p.status = 'active';
  elsif p_type = 'whisper' then select sender_identity_id into target from private.whispers where id = p_id and recipient_identity_id = p_identity and expires_at > now();
  else raise exception 'invalid' using errcode = '22023'; end if;
  if target is null or target = p_identity or public.random_blocked(p_identity, target) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if not exists (select 1 from private.identities where id = target and status in ('active','restricted')) then raise exception 'not_found' using errcode = 'P0002'; end if;
  select a.conversation_id into conv from private.conversation_participants a join private.conversation_participants b on b.conversation_id = a.conversation_id
   where a.identity_id = p_identity and b.identity_id = target and a.left_at is null and b.left_at is null limit 1;
  if conv is not null then return conv; end if;
  if (select count(*) from private.conversation_participants where identity_id = p_identity and joined_at > now() - interval '1 day') >= 10 then raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into private.conversations default values returning id into conv;
  c1 := private.ensure_context(p_identity, 'dm', conv); c2 := private.ensure_context(target, 'dm', conv);
  insert into private.conversation_participants (conversation_id, identity_id, context_id) values (conv, p_identity, c1.id), (conv, target, c2.id);
  return conv;
end $$;

create function public.dm_send(p_identity uuid, p_conv uuid, p_enc text) returns table (id uuid, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare peer uuid; mid uuid; at timestamptz;
begin
  if not private.dm_member(p_identity, p_conv) then raise exception 'not_found' using errcode = 'P0002'; end if;
  peer := private.dm_peer(p_identity, p_conv);
  if peer is null or public.random_blocked(p_identity, peer) or not exists (select 1 from private.conversation_participants where conversation_id = p_conv and identity_id = peer and left_at is null) then raise exception 'closed' using errcode = 'P0002'; end if;
  if (select count(*) from private.dm_messages where sender_identity_id = p_identity and created_at > now() - interval '1 minute') >= 20 then raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into private.dm_messages (conversation_id, sender_identity_id, content_enc) values (p_conv, p_identity, p_enc) returning private.dm_messages.id, private.dm_messages.created_at into mid, at;
  update private.conversations set last_message_at = at where private.conversations.id = p_conv;
  update private.conversation_participants set last_read_at = at where conversation_id = p_conv and identity_id = p_identity;
  return query select mid, at;
end $$;

create function public.dm_list(p_identity uuid) returns table (conversation_id uuid, peer_name text, peer_mark int, last_enc text, last_at timestamptz, last_from_me boolean, unread int)
language sql stable security definer set search_path = '' as $$
  select me.conversation_id, pc.public_name, pc.mark, lm.content_enc, c.last_message_at, lm.sender_identity_id = p_identity,
    (select count(*)::int from private.dm_messages m where m.conversation_id = me.conversation_id and m.sender_identity_id <> p_identity and m.created_at > me.last_read_at)
  from private.conversation_participants me
  join private.conversations c on c.id = me.conversation_id
  join private.conversation_participants peer on peer.conversation_id = me.conversation_id and peer.identity_id <> me.identity_id
  join private.identity_contexts pc on pc.id = peer.context_id
  left join lateral (select content_enc, sender_identity_id from private.dm_messages m where m.conversation_id = me.conversation_id order by m.created_at desc limit 1) lm on true
  where me.identity_id = p_identity and me.left_at is null and not public.random_blocked(p_identity, peer.identity_id)
  order by c.last_message_at desc limit 50 $$;

create function public.dm_messages(p_identity uuid, p_conv uuid, p_before timestamptz default null, p_limit int default 50) returns table (id uuid, mine boolean, content_enc text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.sender_identity_id = p_identity, m.content_enc, m.created_at from private.dm_messages m
  where m.conversation_id = p_conv and private.dm_member(p_identity, p_conv) and (p_before is null or m.created_at < p_before)
  order by m.created_at desc limit least(greatest(p_limit,1),100) $$;

create function public.dm_mark_read(p_identity uuid, p_conv uuid) returns void language sql security definer set search_path = '' as $$
  update private.conversation_participants set last_read_at = clock_timestamp() where conversation_id = p_conv and identity_id = p_identity $$;
create function public.dm_peer_name(p_identity uuid, p_conv uuid) returns text language sql stable security definer set search_path = '' as $$
  select pc.public_name from private.conversation_participants peer join private.identity_contexts pc on pc.id = peer.context_id
  where peer.conversation_id = p_conv and peer.identity_id <> p_identity and private.dm_member(p_identity, p_conv) $$;

create function public.dm_leave(p_identity uuid, p_conv uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  update private.conversation_participants set left_at = now() where conversation_id = p_conv and identity_id = p_identity and left_at is null;
  if not exists (select 1 from private.conversation_participants where conversation_id = p_conv and left_at is null) then delete from private.conversations where id = p_conv; end if;
end $$;

create function public.dm_block_peer(p_identity uuid, p_conv uuid) returns void language plpgsql security definer set search_path = '' as $$
declare peer uuid; l text;
begin
  if not private.dm_member(p_identity, p_conv) then raise exception 'not_found' using errcode = 'P0002'; end if;
  peer := private.dm_peer(p_identity, p_conv); select pc.public_name into l from private.conversation_participants cp join private.identity_contexts pc on pc.id = cp.context_id where cp.conversation_id = p_conv and cp.identity_id = peer;
  insert into private.blocks (blocker_identity_id, blocked_identity_id, label) values (p_identity, peer, l) on conflict do nothing;
end $$;

create function public.dm_file_report(p_identity uuid, p_conv uuid, p_category text, p_transcript jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare peer uuid;
begin
  if not private.dm_member(p_identity, p_conv) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if (select count(*) from private.random_reports where reporter_identity_id = p_identity and created_at > now() - interval '1 hour') >= 10 then raise exception 'rate_limited' using errcode = '54000'; end if;
  peer := private.dm_peer(p_identity, p_conv);
  insert into private.random_reports (session_id, reporter_identity_id, reported_identity_id, category, transcript, priority, source)
  values (p_conv, p_identity, peer, p_category, coalesce(p_transcript, '[]'::jsonb), case when p_category in ('childSafety','threat','selfHarm') then 2 when p_category = 'sexual' then 1 else 0 end, 'dm');
  perform public.dm_block_peer(p_identity, p_conv);
end $$;

-- Admin queue shows where each report came from.
drop function public.admin_list_random_reports(text, int, int);
create function public.admin_list_random_reports(p_status text default 'open', p_limit int default 50, p_offset int default 0)
returns table (id uuid, session_id uuid, reported_identity uuid, category text, priority int, status text, transcript jsonb, created_at timestamptz, source text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare r text := private.require_admin(array['super_admin','moderator','safety_moderator']);
begin
  return query select x.id, x.session_id, x.reported_identity_id, x.category, x.priority, x.status, x.transcript, x.created_at, x.source
  from private.random_reports x where x.status = p_status order by x.priority desc, x.created_at limit least(greatest(p_limit,1),100) offset greatest(p_offset,0);
end $$;
revoke all on function public.admin_list_random_reports(text, int, int) from public, anon; grant execute on function public.admin_list_random_reports(text, int, int) to authenticated;

create or replace function private.cleanup_expired() returns void language sql security definer set search_path = '' as $$
  delete from private.whispers where expires_at < now();
  delete from private.comments where expires_at < now();
  delete from private.posts where expires_at < now() - interval '1 day';
  delete from private.random_sessions where created_at < now() - interval '7 days';
  delete from private.pairings where expires_at < now() - interval '1 day';
  delete from private.recovery_attempts where created_at < now() - interval '1 day';
  delete from private.ai_messages where created_at < now() - make_interval(days => private.cfg('ai_retention_days', 90));
  delete from private.ai_sessions s where s.created_at < now() - interval '1 day' and not exists (select 1 from private.ai_messages m where m.session_id = s.id);
  delete from private.ai_usage where day < current_date - 60;
  delete from private.dm_messages where created_at < now() - make_interval(days => private.cfg('dm_retention_days', 90));
$$;

create or replace function public.delete_identity() returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  perform public.delete_my_content();
  delete from private.ai_sessions where identity_id = v;
  delete from private.ai_usage where identity_id = v;
  delete from private.dm_messages where sender_identity_id = v;
  delete from private.conversation_participants where identity_id = v;
  delete from private.conversations c where not exists (select 1 from private.conversation_participants p where p.conversation_id = c.id);
  delete from private.identity_sessions where identity_id = v;
  delete from private.devices where identity_id = v;
  delete from private.recovery where identity_id = v;
  delete from private.blocks where blocker_identity_id = v;
  update private.identities set status = 'purged', purged_at = now() where id = v;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'dm\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop; end $$;
