-- Inkognito core schema. Real identities live in `private` (never exposed by the API).
-- Clients only reach data through the security-definer functions in `public`,
-- which return contextual public names and never identity ids.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.identities (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','restricted','suspended','banned','purged')),
  trust_level int not null default 0,
  risk_level text not null default 'low' check (risk_level in ('low','medium','high','banned')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  purged_at timestamptz
);
create table private.devices (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references private.identities(id) on delete cascade,
  public_key text not null, platform text, created_at timestamptz not null default now(), revoked_at timestamptz
);
create table private.identity_contexts (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references private.identities(id) on delete cascade,
  context_type text not null check (context_type in ('post','random','dm')),
  context_ref uuid not null,
  public_name text not null, mark int not null,
  created_at timestamptz not null default now(),
  unique (identity_id, context_type, context_ref),
  unique (context_type, context_ref, public_name)
);
create table private.posts (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references private.identities(id) on delete cascade,
  context_id uuid not null references private.identity_contexts(id),
  category text,
  mood text check (mood in ('relieved','hopeful','lost','angry','peaceful','confused','heartbroken','excited','numb','grateful','anxious','proud','lonely','guilty','heavy')),
  body text not null check (char_length(body) between 1 and 5000),
  status text not null default 'active' check (status in ('active','deleted','moderated')),
  moderation_state text not null default 'allow' check (moderation_state in ('allow','review','block')),
  comments_enabled boolean not null default true,
  expires_at timestamptz, created_at timestamptz not null default now(), deleted_at timestamptz
);
create index on private.posts (created_at desc) where status = 'active';
create index on private.posts (identity_id, created_at desc);
create table private.polls (
  post_id uuid primary key references private.posts(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 280),
  option_a text not null default 'Yes', option_b text not null default 'No'
);
create table private.poll_votes (
  post_id uuid not null references private.polls(post_id) on delete cascade,
  identity_id uuid not null references private.identities(id) on delete cascade,
  option smallint not null check (option in (0,1)), created_at timestamptz not null default now(),
  primary key (post_id, identity_id)
);
create table private.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references private.posts(id) on delete cascade,
  parent_id uuid references private.comments(id) on delete cascade,
  identity_id uuid not null references private.identities(id) on delete cascade,
  context_id uuid not null references private.identity_contexts(id),
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'active' check (status in ('active','deleted','moderated')),
  expires_at timestamptz, created_at timestamptz not null default now()
);
create index on private.comments (post_id, created_at);
create table private.reactions (
  target_type text not null check (target_type in ('post','comment')),
  target_id uuid not null,
  identity_id uuid not null references private.identities(id) on delete cascade,
  kind text not null default 'heart', created_at timestamptz not null default now(),
  primary key (target_type, target_id, identity_id, kind)
);
create table private.echoes (
  id uuid primary key default gen_random_uuid(),
  original_post_id uuid not null references private.posts(id) on delete cascade,
  identity_id uuid not null references private.identities(id) on delete cascade,
  context_id uuid not null references private.identity_contexts(id),
  commentary text check (char_length(commentary) <= 500),
  created_at timestamptz not null default now(),
  unique (original_post_id, identity_id)
);
create table private.bookmarks (
  identity_id uuid not null references private.identities(id) on delete cascade,
  post_id uuid not null references private.posts(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (identity_id, post_id)
);
create table private.whispers (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references private.posts(id) on delete cascade,
  sender_identity_id uuid not null references private.identities(id) on delete cascade,
  recipient_identity_id uuid not null references private.identities(id) on delete cascade,
  sender_context_id uuid not null references private.identity_contexts(id),
  body text not null check (char_length(body) between 1 and 2000),
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now()
);
create index on private.whispers (recipient_identity_id, created_at desc);
create index on private.whispers (sender_identity_id, created_at desc);
create table private.blocks (
  blocker_identity_id uuid not null references private.identities(id) on delete cascade,
  blocked_identity_id uuid not null references private.identities(id) on delete cascade,
  created_at timestamptz not null default now(), primary key (blocker_identity_id, blocked_identity_id)
);
create table private.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_identity_id uuid not null references private.identities(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','whisper')),
  target_id uuid not null,
  category text not null check (category in ('harassment','threat','sexual','childSafety','spam','scam','hate','selfHarm','illegal','other')),
  description text check (char_length(description) <= 1000),
  priority int not null default 0, status text not null default 'open',
  created_at timestamptz not null default now(), resolved_at timestamptz,
  unique (reporter_identity_id, target_type, target_id)
);
-- Defense in depth: RLS on, no policies => no direct client access even if the schema were exposed.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'private' loop
    execute format('alter table private.%I enable row level security', t.tablename);
    execute format('alter table private.%I force row level security', t.tablename);
  end loop; end $$;

-- ---------- internal helpers ----------
create function private.require_identity(p_write boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; s text;
begin
  select id, status into v, s from private.identities where auth_user_id = auth.uid();
  if v is null then raise exception 'no_identity' using errcode = '28000'; end if;
  if p_write and s <> 'active' then raise exception 'restricted' using errcode = '42501'; end if;
  return v;
end $$;

create function private.ensure_context(p_identity uuid, p_type text, p_ref uuid) returns private.identity_contexts
language plpgsql security definer set search_path = '' as $$
declare
  r private.identity_contexts; salt int := 0; h bytea; n text;
  adj text[] := array['Quiet','Midnight','Paper','Lost','Fallen','Silver','Hidden','Burning','Distant','Hollow','Gentle','Faded','Restless','Velvet','Cold','Amber'];
  noun text[] := array['Static','Sparrow','Ghost','Signal','Moon','Rain','Window','Letter','Lantern','Comet','Thunder','Harbor','Echo','Ember','River','Shadow'];
begin
  select * into r from private.identity_contexts where identity_id = p_identity and context_type = p_type and context_ref = p_ref;
  if found then return r; end if;
  loop
    h := decode(md5(p_identity::text || p_ref::text || salt::text), 'hex');
    n := adj[1 + get_byte(h,0) % 16] || ' ' || noun[1 + get_byte(h,1) % 16] || case when salt >= 20 then ' ' || salt else '' end;
    begin
      insert into private.identity_contexts (identity_id, context_type, context_ref, public_name, mark)
      values (p_identity, p_type, p_ref, n, get_byte(h,2)) returning * into r;
      return r;
    exception when unique_violation then
      select * into r from private.identity_contexts where identity_id = p_identity and context_type = p_type and context_ref = p_ref;
      if found then return r; end if;
      salt := salt + 1;
    end;
  end loop;
end $$;

-- ---------- public API (security definer; no identity ids ever returned) ----------
create function public.ensure_identity() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  insert into private.identities (auth_user_id) values (auth.uid())
  on conflict (auth_user_id) do update set last_seen_at = now();
end $$;

create function public.create_post(p_body text, p_category text default null, p_mood text default null,
  p_poll_question text default null, p_fading_hours int default null, p_comments_enabled boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(true); pid uuid := gen_random_uuid(); c private.identity_contexts; b text := btrim(coalesce(p_body,''));
begin
  if char_length(b) = 0 or char_length(b) > 5000 then raise exception 'invalid_body' using errcode = '22023'; end if;
  if (select count(*) from private.posts where identity_id = v and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited' using errcode = '54000'; end if;
  c := private.ensure_context(v, 'post', pid);
  insert into private.posts (id, identity_id, context_id, category, mood, body, comments_enabled, expires_at)
  values (pid, v, c.id, nullif(btrim(p_category),''), p_mood, b, p_comments_enabled,
          case when p_fading_hours is not null then now() + make_interval(hours => least(greatest(p_fading_hours,1),720)) end);
  if p_poll_question is not null and btrim(p_poll_question) <> '' then
    insert into private.polls (post_id, question) values (pid, btrim(p_poll_question)); end if;
  return pid;
end $$;

create function public.get_feed(p_kind text default 'fresh', p_query text default null, p_limit int default 20, p_offset int default 0, p_id uuid default null)
returns table (id uuid, author_name text, author_mark int, author_context_id uuid, body text, category text, mood text,
  comments_enabled boolean, created_at timestamptz, expires_at timestamptz, reactions int, comments int, echoes int,
  mine boolean, saved boolean, reacted boolean, echoed boolean, poll jsonb)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v uuid := private.require_identity(false);
begin
  return query
  select p.id, c.public_name, c.mark, c.id, p.body, p.category, p.mood, p.comments_enabled, p.created_at, p.expires_at,
    s.r, s.c, s.e, p.identity_id = v,
    exists (select 1 from private.bookmarks b where b.identity_id = v and b.post_id = p.id),
    exists (select 1 from private.reactions x where x.target_type = 'post' and x.target_id = p.id and x.identity_id = v),
    exists (select 1 from private.echoes ec where ec.original_post_id = p.id and ec.identity_id = v),
    case when pl.post_id is null then null else jsonb_build_object(
      'question', pl.question, 'options', jsonb_build_array(pl.option_a, pl.option_b),
      'myVote', pv.mine,
      'votes', case when pv.mine is not null or p.identity_id = v then jsonb_build_array(pv.a, pv.b) end) end
  from private.posts p
  join private.identity_contexts c on c.id = p.context_id
  left join private.polls pl on pl.post_id = p.id
  left join lateral (select count(*) filter (where option = 0)::int a, count(*) filter (where option = 1)::int b,
      (select o.option from private.poll_votes o where o.post_id = p.id and o.identity_id = v)::int mine
      from private.poll_votes q where q.post_id = p.id) pv on pl.post_id is not null
  cross join lateral (select
      (select count(*)::int from private.reactions x where x.target_type = 'post' and x.target_id = p.id) r,
      (select count(*)::int from private.comments m where m.post_id = p.id and m.status = 'active' and (m.expires_at is null or m.expires_at > now())) c,
      (select count(*)::int from private.echoes ec where ec.original_post_id = p.id) e) s
  where p.status = 'active' and p.moderation_state = 'allow' and (p.expires_at is null or p.expires_at > now())
    and (p_id is null or p.id = p_id)
    and not exists (select 1 from private.blocks bl where bl.blocker_identity_id = v and bl.blocked_identity_id = p.identity_id)
    and (p_query is null or p.body ilike '%' || replace(replace(p_query,'%','\%'),'_','\_') || '%' or lower(p.category) = lower(p_query))
    and (p_kind <> 'questions' or p.body like '%?%')
    and (p_kind <> 'polls' or pl.post_id is not null)
  order by case p_kind
      when 'trending' then (s.r + 2*s.c + 3*s.e + 1)::float8 / power(extract(epoch from now() - p.created_at) / 3600 + 2, 1.5)
      when 'echoed' then s.e::float8
      when 'deep' then s.c::float8
      when 'random' then random()
      else 0 end desc,
    p.created_at desc
  limit least(greatest(p_limit,1),50) offset greatest(p_offset,0);
end $$;

create function public.delete_own_post(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  update private.posts set status = 'deleted', deleted_at = now() where id = p_id and identity_id = v and status = 'active';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

create function public.add_comment(p_post uuid, p_body text, p_parent uuid default null, p_fading boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(true); c private.identity_contexts; cid uuid; b text := btrim(coalesce(p_body,''));
begin
  if char_length(b) = 0 or char_length(b) > 2000 then raise exception 'invalid_body' using errcode = '22023'; end if;
  if not exists (select 1 from private.posts where id = p_post and status = 'active' and comments_enabled and (expires_at is null or expires_at > now())) then
    raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_parent is not null and not exists (select 1 from private.comments where id = p_parent and post_id = p_post and status = 'active') then
    raise exception 'not_found' using errcode = 'P0002'; end if;
  if (select count(*) from private.comments where identity_id = v and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'rate_limited' using errcode = '54000'; end if;
  c := private.ensure_context(v, 'post', p_post);
  insert into private.comments (post_id, parent_id, identity_id, context_id, body, expires_at)
  values (p_post, p_parent, v, c.id, b, case when p_fading then now() + interval '24 hours' end) returning id into cid;
  return cid;
end $$;

create function public.list_comments(p_post uuid, p_limit int default 50, p_offset int default 0)
returns table (id uuid, parent_id uuid, author_name text, author_mark int, author_context_id uuid, body text, expires_at timestamptz, created_at timestamptz, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v uuid := private.require_identity(false);
begin
  return query
  select m.id, m.parent_id, c.public_name, c.mark, c.id, m.body, m.expires_at, m.created_at, m.identity_id = v
  from private.comments m join private.identity_contexts c on c.id = m.context_id
  where m.post_id = p_post and m.status = 'active' and (m.expires_at is null or m.expires_at > now())
    and exists (select 1 from private.posts p where p.id = p_post and p.status = 'active' and p.moderation_state = 'allow')
    and not exists (select 1 from private.blocks bl where bl.blocker_identity_id = v and bl.blocked_identity_id = m.identity_id)
  order by m.created_at limit least(greatest(p_limit,1),100) offset greatest(p_offset,0);
end $$;

create function public.toggle_reaction(p_type text, p_id uuid, p_kind text default 'heart') returns boolean
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(true);
begin
  if p_type = 'post' and not exists (select 1 from private.posts where id = p_id and status = 'active') then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_type = 'comment' and not exists (select 1 from private.comments where id = p_id and status = 'active') then raise exception 'not_found' using errcode = 'P0002'; end if;
  delete from private.reactions where target_type = p_type and target_id = p_id and identity_id = v and kind = p_kind;
  if found then return false; end if;
  insert into private.reactions (target_type, target_id, identity_id, kind) values (p_type, p_id, v, p_kind);
  return true;
end $$;

create function public.set_echo(p_post uuid, p_on boolean, p_commentary text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(true); c private.identity_contexts;
begin
  if not p_on then delete from private.echoes where original_post_id = p_post and identity_id = v; return; end if;
  if not exists (select 1 from private.posts where id = p_post and status = 'active') then raise exception 'not_found' using errcode = 'P0002'; end if;
  c := private.ensure_context(v, 'post', p_post);
  insert into private.echoes (original_post_id, identity_id, context_id, commentary) values (p_post, v, c.id, nullif(btrim(p_commentary),'')) on conflict do nothing;
end $$;

create function public.set_bookmark(p_post uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  if p_on then
    if not exists (select 1 from private.posts where id = p_post and status = 'active') then raise exception 'not_found' using errcode = 'P0002'; end if;
    insert into private.bookmarks (identity_id, post_id) values (v, p_post) on conflict do nothing;
  else delete from private.bookmarks where identity_id = v and post_id = p_post; end if;
end $$;

create function public.vote_poll(p_post uuid, p_option int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(true);
begin
  if p_option not in (0,1) then raise exception 'invalid_option' using errcode = '22023'; end if;
  if not exists (select 1 from private.posts p join private.polls l on l.post_id = p.id where p.id = p_post and p.status = 'active') then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into private.poll_votes (post_id, identity_id, option) values (p_post, v, p_option) on conflict do nothing;
  return (select jsonb_build_object('myVote', (select option from private.poll_votes where post_id = p_post and identity_id = v),
    'votes', jsonb_build_array(count(*) filter (where option = 0), count(*) filter (where option = 1))) from private.poll_votes where post_id = p_post);
end $$;

create function public.send_whisper(p_post uuid, p_body text, p_fading boolean default true) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(true); r uuid; c private.identity_contexts; wid uuid; b text := btrim(coalesce(p_body,''));
begin
  if char_length(b) = 0 or char_length(b) > 2000 then raise exception 'invalid_body' using errcode = '22023'; end if;
  select identity_id into r from private.posts where id = p_post and status = 'active';
  if r is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if r = v then raise exception 'own_post' using errcode = '22023'; end if;
  if exists (select 1 from private.blocks where blocker_identity_id = r and blocked_identity_id = v) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if (select count(*) from private.whispers where sender_identity_id = v and created_at > now() - interval '1 hour') >= 20 then raise exception 'rate_limited' using errcode = '54000'; end if;
  c := private.ensure_context(v, 'post', p_post);
  insert into private.whispers (post_id, sender_identity_id, recipient_identity_id, sender_context_id, body, expires_at)
  values (p_post, v, r, c.id, b, now() + interval '24 hours') returning id into wid;
  return wid;
end $$;

create function public.list_whispers(p_limit int default 50, p_offset int default 0)
returns table (id uuid, post_id uuid, from_name text, from_mark int, body text, mine boolean, expires_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v uuid := private.require_identity(false);
begin
  return query
  select w.id, w.post_id, c.public_name, c.mark, w.body, w.sender_identity_id = v, w.expires_at, w.created_at
  from private.whispers w join private.identity_contexts c on c.id = w.sender_context_id
  where (w.recipient_identity_id = v or w.sender_identity_id = v) and w.expires_at > now()
  order by w.created_at desc limit least(greatest(p_limit,1),100) offset greatest(p_offset,0);
end $$;

create function public.report_content(p_type text, p_id uuid, p_category text, p_description text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  insert into private.reports (reporter_identity_id, target_type, target_id, category, description, priority)
  values (v, p_type, p_id, p_category, nullif(btrim(p_description),''), case when p_category in ('childSafety','threat','selfHarm') then 2 else 0 end)
  on conflict do nothing;
end $$;

-- Only signed-in (including anonymous) users may call the API; the anon role may not.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('ensure_identity','create_post','get_feed','delete_own_post','add_comment','list_comments','toggle_reaction','set_echo','set_bookmark','vote_poll','send_whisper','list_whispers','report_content') loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop; end $$;

-- Expiry cleanup for fading content (runs only where pg_cron is enabled).
create function private.cleanup_expired() returns void language sql security definer set search_path = '' as $$
  delete from private.whispers where expires_at < now();
  delete from private.comments where expires_at < now();
  delete from private.posts where expires_at < now() - interval '1 day';
$$;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('inkognito-expire', '*/15 * * * *', 'select private.cleanup_expired()');
  end if; end $$;
