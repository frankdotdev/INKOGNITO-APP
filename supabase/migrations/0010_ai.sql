-- AI Companion storage and quotas. Only the AI Worker (service_role) touches these tables. Message text is
-- encrypted by the Worker before it is stored, with a key that never reaches the database.
create table private.platform_config (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
create table private.ai_sessions (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references private.identities(id) on delete cascade,
  mode text not null default 'talk' check (mode in ('talk','vent','think','journal','perspective','calm')),
  title_enc text, created_at timestamptz not null default now(), last_activity_at timestamptz not null default now()
);
create index on private.ai_sessions (identity_id, last_activity_at desc);
create table private.ai_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references private.ai_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant')), content_enc text not null,
  tokens_in int not null default 0, tokens_out int not null default 0, provider text,
  created_at timestamptz not null default clock_timestamp()
);
create index on private.ai_messages (session_id, created_at);
create index on private.ai_messages (created_at);
create table private.ai_usage (
  identity_id uuid not null references private.identities(id) on delete cascade, day date not null,
  messages int not null default 0, input_tokens bigint not null default 0, output_tokens bigint not null default 0,
  primary key (identity_id, day)
);
create table private.ai_safety_events (
  id uuid primary key default gen_random_uuid(), identity_id uuid not null references private.identities(id) on delete cascade,
  session_id uuid, kind text not null check (kind in ('self_harm','violence','abuse')), created_at timestamptz not null default now()
);
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'private' loop
    execute format('alter table private.%I enable row level security', t.tablename);
    execute format('alter table private.%I force row level security', t.tablename);
  end loop; end $$;

create function private.cfg(p_key text, p_default int) returns int language sql stable security definer set search_path = '' as $$
  select coalesce((select (value #>> '{}')::int from private.platform_config where key = p_key), p_default) $$;

create function public.ai_config() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'enabled', coalesce((select (value #>> '{}')::boolean from private.platform_config where key = 'ai_enabled'), true),
    'daily_limit', private.cfg('ai_free_daily_limit', 20), 'max_chars', private.cfg('ai_max_message_chars', 2000),
    'context_messages', private.cfg('ai_context_messages', 16), 'burst_per_minute', private.cfg('ai_burst_per_minute', 6)) $$;

-- Atomically checks limits and counts one message for today. Call before the AI provider; refund if the provider fails.
create function public.ai_begin_turn(p_identity uuid, p_session uuid, p_mode text)
returns table (allowed boolean, reason text, session_id uuid, remaining int, daily_limit int)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare lim int := private.cfg('ai_free_daily_limit', 20); burst int := private.cfg('ai_burst_per_minute', 6); used int; sid uuid := p_session;
begin
  if p_mode not in ('talk','vent','think','journal','perspective','calm') then raise exception 'invalid_mode' using errcode = '22023'; end if;
  if sid is not null and not exists (select 1 from private.ai_sessions where id = sid and identity_id = p_identity) then
    return query select false, 'not_found'::text, sid, 0, lim; return; end if;
  if (select count(*) from private.ai_messages m join private.ai_sessions s on s.id = m.session_id where s.identity_id = p_identity and m.role = 'user' and m.created_at > now() - interval '1 minute') >= burst then
    return query select false, 'slow_down'::text, sid, greatest(lim - coalesce((select messages from private.ai_usage where identity_id = p_identity and day = current_date), 0), 0), lim; return; end if;
  if lim <= 0 then return query select false, 'quota_exceeded'::text, sid, 0, lim; return; end if;
  insert into private.ai_usage (identity_id, day, messages) values (p_identity, current_date, 1)
  on conflict (identity_id, day) do update set messages = private.ai_usage.messages + 1 where private.ai_usage.messages < lim returning messages into used;
  if used is null then return query select false, 'quota_exceeded'::text, sid, 0, lim; return; end if;
  if sid is null then insert into private.ai_sessions (identity_id, mode) values (p_identity, p_mode) returning id into sid;
  else update private.ai_sessions set mode = p_mode where id = sid; end if;
  return query select true, 'ok'::text, sid, lim - used, lim;
end $$;

create function public.ai_refund_turn(p_identity uuid) returns void language sql security definer set search_path = '' as $$
  update private.ai_usage set messages = greatest(messages - 1, 0) where identity_id = p_identity and day = current_date $$;

create function public.ai_record_exchange(p_identity uuid, p_session uuid, p_user_enc text, p_assistant_enc text, p_in int, p_out int, p_provider text, p_title_enc text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from private.ai_sessions where id = p_session and identity_id = p_identity) then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into private.ai_messages (session_id, role, content_enc, created_at) values (p_session, 'user', p_user_enc, clock_timestamp());
  insert into private.ai_messages (session_id, role, content_enc, tokens_in, tokens_out, provider, created_at) values (p_session, 'assistant', p_assistant_enc, p_in, p_out, p_provider, clock_timestamp() + interval '1 millisecond');
  update private.ai_sessions set last_activity_at = now(), title_enc = coalesce(title_enc, p_title_enc) where id = p_session;
  update private.ai_usage set input_tokens = input_tokens + greatest(p_in, 0), output_tokens = output_tokens + greatest(p_out, 0) where identity_id = p_identity and day = current_date;
end $$;

create function public.ai_list_sessions(p_identity uuid, p_limit int default 50) returns table (id uuid, mode text, title_enc text, created_at timestamptz, last_activity_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id, s.mode, s.title_enc, s.created_at, s.last_activity_at from private.ai_sessions s
  where s.identity_id = p_identity and exists (select 1 from private.ai_messages m where m.session_id = s.id) order by s.last_activity_at desc limit least(greatest(p_limit,1),100) $$;

create function public.ai_get_messages(p_identity uuid, p_session uuid, p_limit int default 200) returns table (id uuid, role text, content_enc text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.role, m.content_enc, m.created_at from private.ai_messages m join private.ai_sessions s on s.id = m.session_id
  where s.id = p_session and s.identity_id = p_identity order by m.created_at desc limit least(greatest(p_limit,1),500) $$;

create function public.ai_delete_session(p_identity uuid, p_session uuid) returns void language sql security definer set search_path = '' as $$
  delete from private.ai_sessions where id = p_session and identity_id = p_identity $$;
create function public.ai_delete_all(p_identity uuid) returns void language sql security definer set search_path = '' as $$
  delete from private.ai_sessions where identity_id = p_identity $$;
create function public.ai_usage_today(p_identity uuid) returns table (used int, daily_limit int) language sql stable security definer set search_path = '' as $$
  select coalesce((select messages from private.ai_usage where identity_id = p_identity and day = current_date), 0), private.cfg('ai_free_daily_limit', 20) $$;
create function public.ai_log_safety(p_identity uuid, p_session uuid, p_kind text) returns void language sql security definer set search_path = '' as $$
  insert into private.ai_safety_events (identity_id, session_id, kind) values (p_identity, p_session, p_kind) $$;

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
$$;

create or replace function public.delete_identity() returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  perform public.delete_my_content();
  delete from private.ai_sessions where identity_id = v;
  delete from private.ai_usage where identity_id = v;
  delete from private.identity_sessions where identity_id = v;
  delete from private.devices where identity_id = v;
  delete from private.recovery where identity_id = v;
  delete from private.blocks where blocker_identity_id = v;
  update private.identities set status = 'purged', purged_at = now() where id = v;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'ai\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop; end $$;
