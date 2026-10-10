-- Random chat persistence. The Cloudflare Worker (service_role) is the only caller: it records who was matched,
-- checks blocks, and files reports. Clients never call these functions.
create table private.random_sessions (
  id uuid primary key, mode text not null check (mode in ('text','audio','video')),
  created_at timestamptz not null default now(), ended_at timestamptz, end_reason text
);
create table private.random_participants (
  session_id uuid not null references private.random_sessions(id) on delete cascade,
  identity_id uuid not null references private.identities(id) on delete cascade,
  role text not null check (role in ('a','b')), joined_at timestamptz not null default now(),
  primary key (session_id, identity_id)
);
create table private.random_reports (
  id uuid primary key default gen_random_uuid(), session_id uuid,
  reporter_identity_id uuid not null references private.identities(id) on delete cascade,
  reported_identity_id uuid not null references private.identities(id) on delete cascade,
  category text not null check (category in ('harassment','threat','sexual','childSafety','spam','scam','hate','selfHarm','illegal','other')),
  transcript jsonb not null default '[]'::jsonb, priority int not null default 0, status text not null default 'open',
  created_at timestamptz not null default now(), resolved_at timestamptz
);
create index on private.random_reports (status, priority desc, created_at);
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'private' loop
    execute format('alter table private.%I enable row level security', t.tablename);
    execute format('alter table private.%I force row level security', t.tablename);
  end loop; end $$;

create function public.random_identity_for(p_auth_user uuid) returns table (identity_id uuid, eligible boolean)
language sql stable security definer set search_path = '' as $$
  select i.id, (i.status = 'active' and i.risk_level <> 'banned')
  from private.identity_sessions x join private.identities i on i.id = x.identity_id
  where x.auth_user_id = p_auth_user and i.status <> 'purged' $$;

create function public.random_blocked(p_a uuid, p_b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.blocks where (blocker_identity_id = p_a and blocked_identity_id = p_b) or (blocker_identity_id = p_b and blocked_identity_id = p_a)) $$;

create function public.random_open_session(p_id uuid, p_mode text, p_a uuid, p_b uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_a = p_b then raise exception 'same_identity' using errcode = '22023'; end if;
  insert into private.random_sessions (id, mode) values (p_id, p_mode);
  insert into private.random_participants (session_id, identity_id, role) values (p_id, p_a, 'a'), (p_id, p_b, 'b');
end $$;

create function public.random_close_session(p_id uuid, p_reason text) returns void
language sql security definer set search_path = '' as $$
  update private.random_sessions set ended_at = now(), end_reason = left(p_reason, 40) where id = p_id and ended_at is null $$;

create function public.random_file_report(p_session uuid, p_reporter uuid, p_category text, p_transcript jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare other uuid;
begin
  select identity_id into other from private.random_participants where session_id = p_session and identity_id <> p_reporter;
  if other is null or not exists (select 1 from private.random_participants where session_id = p_session and identity_id = p_reporter) then
    raise exception 'not_found' using errcode = 'P0002'; end if;
  if (select count(*) from private.random_reports where reporter_identity_id = p_reporter and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into private.random_reports (session_id, reporter_identity_id, reported_identity_id, category, transcript, priority)
  values (p_session, p_reporter, other, p_category, coalesce(p_transcript, '[]'::jsonb), case when p_category in ('childSafety','threat','selfHarm') then 2 when p_category = 'sexual' then 1 else 0 end);
  insert into private.blocks (blocker_identity_id, blocked_identity_id, label) values (p_reporter, other, 'Random stranger') on conflict do nothing;
end $$;

create function public.random_block_peer(p_session uuid, p_blocker uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare other uuid;
begin
  select identity_id into other from private.random_participants where session_id = p_session and identity_id <> p_blocker;
  if other is null or not exists (select 1 from private.random_participants where session_id = p_session and identity_id = p_blocker) then
    raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into private.blocks (blocker_identity_id, blocked_identity_id, label) values (p_blocker, other, 'Random stranger') on conflict do nothing;
end $$;

create or replace function private.cleanup_expired() returns void language sql security definer set search_path = '' as $$
  delete from private.whispers where expires_at < now();
  delete from private.comments where expires_at < now();
  delete from private.posts where expires_at < now() - interval '1 day';
  delete from private.random_sessions where created_at < now() - interval '7 days';
  delete from private.pairings where expires_at < now() - interval '1 day';
  delete from private.recovery_attempts where created_at < now() - interval '1 day';
$$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('random_identity_for','random_blocked','random_open_session','random_close_session','random_file_report','random_block_peer') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop; end $$;
