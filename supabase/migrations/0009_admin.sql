-- Admin Control Room backend. Admins are ordinary Supabase Auth users (email + MFA), completely separate from
-- anonymous identities. Every function checks: signed in, not anonymous, listed in private.admins, MFA (aal2), and role.
-- Every mutation and every identity lookup is written to the audit log in the same transaction.
create table private.admins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin','moderator','safety_moderator','support','analytics','finance')),
  created_at timestamptz not null default now(), disabled_at timestamptz
);
create table private.audit_log (
  id bigint generated always as identity primary key,
  admin_user_id uuid not null, admin_role text not null, action text not null,
  target_type text, target_id text, reason text, metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on private.audit_log (created_at desc);
create index on private.audit_log (target_type, target_id);
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'private' loop
    execute format('alter table private.%I enable row level security', t.tablename);
    execute format('alter table private.%I force row level security', t.tablename);
  end loop; end $$;

create function private.require_admin(p_allowed text[]) returns text
language plpgsql stable security definer set search_path = '' as $$
declare r text;
begin
  if auth.uid() is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then raise exception 'forbidden' using errcode = '42501'; end if;
  select role into r from private.admins where auth_user_id = auth.uid() and disabled_at is null;
  if r is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then raise exception 'mfa_required' using errcode = '42501'; end if;
  if not (r = any (p_allowed)) then raise exception 'forbidden' using errcode = '42501'; end if;
  return r;
end $$;

create function private.audit(p_role text, p_action text, p_type text, p_id text, p_reason text, p_meta jsonb default '{}') returns void
language sql security definer set search_path = '' as $$
  insert into private.audit_log (admin_user_id, admin_role, action, target_type, target_id, reason, metadata) values (auth.uid(), p_role, p_action, p_type, p_id, p_reason, coalesce(p_meta, '{}')) $$;

create function private.need_reason(p_reason text) returns text language plpgsql immutable set search_path = '' as $$
begin
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  return btrim(p_reason);
end $$;

-- Who am I? Returns nothing for non-admins. Works before MFA so the app can ask for the code.
create function public.admin_whoami() returns table (role text, aal text)
language sql stable security definer set search_path = '' as $$
  select a.role, coalesce(auth.jwt() ->> 'aal', 'aal1') from private.admins a
  where a.auth_user_id = auth.uid() and a.disabled_at is null and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) $$;

create function public.admin_metrics() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r text := private.require_admin(array['super_admin','moderator','safety_moderator','support','analytics','finance']); d timestamptz := date_trunc('day', now());
begin
  return jsonb_build_object(
    'generated_at', now(),
    'dau', (select count(*) from private.identities where status <> 'purged' and last_seen_at > now() - interval '1 day'),
    'wau', (select count(*) from private.identities where status <> 'purged' and last_seen_at > now() - interval '7 days'),
    'mau', (select count(*) from private.identities where status <> 'purged' and last_seen_at > now() - interval '30 days'),
    'new_identities_today', (select count(*) from private.identities where created_at >= d),
    'posts_today', (select count(*) from private.posts where created_at >= d),
    'comments_today', (select count(*) from private.comments where created_at >= d),
    'echoes_today', (select count(*) from private.echoes where created_at >= d),
    'whispers_today', (select count(*) from private.whispers where created_at >= d),
    'random_sessions_today', (select count(*) from private.random_sessions where created_at >= d),
    'reports_open', (select count(*) from private.reports where status = 'open'),
    'random_reports_open', (select count(*) from private.random_reports where status = 'open'),
    'restricted_identities', (select count(*) from private.identities where status in ('restricted','suspended','banned')),
    'media_objects', (select count(*) from private.post_media),
    'database_bytes', pg_database_size(current_database()));
end $$;

create function public.admin_list_reports(p_status text default 'open', p_limit int default 50, p_offset int default 0)
returns table (id uuid, target_type text, target_id uuid, category text, description text, priority int, status text, created_at timestamptz, report_count int, target_body text, target_state text, author_name text)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare r text := private.require_admin(array['super_admin','moderator','safety_moderator']);
begin
  return query
  select x.id, x.target_type, x.target_id, x.category, x.description, x.priority, x.status, x.created_at,
    (select count(*)::int from private.reports y where y.target_type = x.target_type and y.target_id = x.target_id), t.body, t.state, t.author
  from private.reports x
  left join lateral (
    select p.body, p.status || '/' || p.moderation_state as state, c.public_name as author from private.posts p join private.identity_contexts c on c.id = p.context_id where x.target_type = 'post' and p.id = x.target_id
    union all select m.body, m.status, c.public_name from private.comments m join private.identity_contexts c on c.id = m.context_id where x.target_type = 'comment' and m.id = x.target_id
    union all select w.body, case when w.expires_at > now() then 'live' else 'expired' end, c.public_name from private.whispers w join private.identity_contexts c on c.id = w.sender_context_id where x.target_type = 'whisper' and w.id = x.target_id
  ) t on true
  where x.status = p_status order by x.priority desc, x.created_at limit least(greatest(p_limit,1),100) offset greatest(p_offset,0);
end $$;

create function public.admin_list_random_reports(p_status text default 'open', p_limit int default 50, p_offset int default 0)
returns table (id uuid, session_id uuid, reported_identity uuid, category text, priority int, status text, transcript jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare r text := private.require_admin(array['super_admin','moderator','safety_moderator']);
begin
  return query select x.id, x.session_id, x.reported_identity_id, x.category, x.priority, x.status, x.transcript, x.created_at
  from private.random_reports x where x.status = p_status order by x.priority desc, x.created_at limit least(greatest(p_limit,1),100) offset greatest(p_offset,0);
end $$;

create function public.admin_resolve_report(p_kind text, p_id uuid, p_resolution text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := private.require_admin(array['super_admin','moderator','safety_moderator']); n int;
begin
  if p_resolution not in ('dismissed','actioned') or p_kind not in ('content','random') then raise exception 'invalid' using errcode = '22023'; end if;
  if p_kind = 'content' then update private.reports set status = p_resolution, resolved_at = now() where id = p_id and status = 'open';
  else update private.random_reports set status = p_resolution, resolved_at = now() where id = p_id and status = 'open'; end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.audit(r, 'resolve_report', p_kind || '_report', p_id::text, p_note, jsonb_build_object('resolution', p_resolution));
end $$;

create function public.admin_list_posts(p_query text default null, p_status text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, body text, status text, moderation_state text, comments_enabled boolean, created_at timestamptz, author_name text, report_count int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare r text := private.require_admin(array['super_admin','moderator','safety_moderator']);
begin
  return query select p.id, left(p.body, 400), p.status, p.moderation_state, p.comments_enabled, p.created_at, c.public_name,
    (select count(*)::int from private.reports x where x.target_type = 'post' and x.target_id = p.id)
  from private.posts p join private.identity_contexts c on c.id = p.context_id
  where (p_status is null or p.status = p_status) and (p_query is null or p.body ilike '%' || replace(replace(p_query,'%','\%'),'_','\_') || '%')
  order by p.created_at desc limit least(greatest(p_limit,1),100) offset greatest(p_offset,0);
end $$;

create function public.admin_set_post_state(p_post uuid, p_action text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := private.require_admin(array['super_admin','moderator','safety_moderator']); why text := private.need_reason(p_reason); n int;
begin
  if p_action = 'remove' then update private.posts set status = 'moderated', moderation_state = 'block' where id = p_post and status = 'active';
  elsif p_action = 'restore' then update private.posts set status = 'active', moderation_state = 'allow' where id = p_post and status = 'moderated';
  elsif p_action = 'lock_comments' then update private.posts set comments_enabled = false where id = p_post and status <> 'deleted';
  elsif p_action = 'unlock_comments' then update private.posts set comments_enabled = true where id = p_post and status <> 'deleted';
  else raise exception 'invalid' using errcode = '22023'; end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.audit(r, p_action || '_post', 'post', p_post::text, why);
end $$;

create function public.admin_set_comment_state(p_comment uuid, p_action text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := private.require_admin(array['super_admin','moderator','safety_moderator']); why text := private.need_reason(p_reason); n int;
begin
  if p_action = 'remove' then update private.comments set status = 'moderated' where id = p_comment and status = 'active';
  elsif p_action = 'restore' then update private.comments set status = 'active' where id = p_comment and status = 'moderated';
  else raise exception 'invalid' using errcode = '22023'; end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.audit(r, p_action || '_comment', 'comment', p_comment::text, why);
end $$;

create function public.admin_target_identity(p_type text, p_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r text := private.require_admin(array['super_admin','moderator','safety_moderator']); v uuid;
begin
  if p_type = 'post' then select identity_id into v from private.posts where id = p_id;
  elsif p_type = 'comment' then select identity_id into v from private.comments where id = p_id;
  elsif p_type = 'whisper' then select sender_identity_id into v from private.whispers where id = p_id;
  elsif p_type = 'random' then select reported_identity_id into v from private.random_reports where id = p_id;
  else raise exception 'invalid' using errcode = '22023'; end if;
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return v;
end $$;

create function public.admin_identity_record(p_identity uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r text := private.require_admin(array['super_admin','moderator','safety_moderator','support']); i private.identities;
begin
  select * into i from private.identities where id = p_identity;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.audit(r, 'view_identity', 'identity', p_identity::text, null);
  return jsonb_build_object('id', i.id, 'status', i.status, 'risk_level', i.risk_level, 'trust_level', i.trust_level, 'created_at', i.created_at, 'last_seen_at', i.last_seen_at,
    'devices', (select count(*) from private.identity_sessions where identity_id = p_identity),
    'posts', (select count(*) from private.posts where identity_id = p_identity), 'comments', (select count(*) from private.comments where identity_id = p_identity),
    'reports_filed', (select count(*) from private.reports where reporter_identity_id = p_identity),
    'reports_against', (select count(*) from private.reports x where (x.target_type = 'post' and x.target_id in (select id from private.posts where identity_id = p_identity))
                          or (x.target_type = 'comment' and x.target_id in (select id from private.comments where identity_id = p_identity))),
    'random_reports_against', (select count(*) from private.random_reports where reported_identity_id = p_identity),
    'recent_actions', coalesce((select jsonb_agg(jsonb_build_object('action', a.action, 'reason', a.reason, 'role', a.admin_role, 'at', a.created_at) order by a.created_at desc)
                                from (select * from private.audit_log where target_type = 'identity' and target_id = p_identity::text and action <> 'view_identity' order by created_at desc limit 20) a), '[]'::jsonb));
end $$;

create function public.admin_set_identity_state(p_identity uuid, p_action text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := private.require_admin(case when p_action = 'restore' then array['super_admin','safety_moderator'] else array['super_admin','moderator','safety_moderator'] end);
  why text := private.need_reason(p_reason); i private.identities; s text; k text;
begin
  select * into i from private.identities where id = p_identity and status <> 'purged';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if p_action = 'restrict' then s := 'restricted'; k := 'medium'; elsif p_action = 'suspend' then s := 'suspended'; k := 'high';
  elsif p_action = 'ban' then s := 'banned'; k := 'banned'; elsif p_action = 'restore' then s := 'active'; k := 'low';
  else raise exception 'invalid' using errcode = '22023'; end if;
  update private.identities set status = s, risk_level = k where id = p_identity;
  perform private.audit(r, p_action || '_identity', 'identity', p_identity::text, why, jsonb_build_object('from_status', i.status, 'from_risk', i.risk_level));
end $$;

create function public.admin_audit(p_limit int default 100, p_offset int default 0)
returns table (id bigint, admin_email text, admin_role text, action text, target_type text, target_id text, reason text, metadata jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare r text := private.require_admin(array['super_admin']);
begin
  return query select a.id, u.email::text, a.admin_role, a.action, a.target_type, a.target_id, a.reason, a.metadata, a.created_at
  from private.audit_log a left join auth.users u on u.id = a.admin_user_id order by a.created_at desc, a.id desc limit least(greatest(p_limit,1),200) offset greatest(p_offset,0);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'admin\_%' loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop; end $$;
