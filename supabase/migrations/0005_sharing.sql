-- Shareable posts and comments. Authors can opt out per post. Public read functions return only
-- what a share card needs (contextual name, text, mood, category); never identity ids or counts of private data.
alter table private.posts add column allow_sharing boolean not null default true;

drop function public.get_feed(text, text, int, int, uuid, text);
drop function public.get_my_feed(text, int, int);
drop function private.feed_rows(uuid, text, text, int, int, uuid, text, text);

create function private.feed_rows(v uuid, p_kind text, p_query text, p_limit int, p_offset int, p_id uuid, p_category text, p_scope text)
returns table (id uuid, author_name text, author_mark int, author_context_id uuid, body text, category text, mood text,
  comments_enabled boolean, created_at timestamptz, expires_at timestamptz, reactions int, comments int, echoes int,
  mine boolean, saved boolean, reacted boolean, echoed boolean, poll jsonb, allow_sharing boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
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
      'votes', case when pv.mine is not null or p.identity_id = v then jsonb_build_array(pv.a, pv.b) end) end,
    p.allow_sharing
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
    and (p_category is null or lower(p.category) = lower(p_category))
    and (p_scope is null
         or (p_scope = 'mine' and p.identity_id = v)
         or (p_scope = 'saved' and exists (select 1 from private.bookmarks b where b.identity_id = v and b.post_id = p.id))
         or (p_scope = 'echoes' and exists (select 1 from private.echoes ec where ec.original_post_id = p.id and ec.identity_id = v)))
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

create function public.get_feed(p_kind text default 'fresh', p_query text default null, p_limit int default 20, p_offset int default 0, p_id uuid default null, p_category text default null)
returns table (id uuid, author_name text, author_mark int, author_context_id uuid, body text, category text, mood text,
  comments_enabled boolean, created_at timestamptz, expires_at timestamptz, reactions int, comments int, echoes int,
  mine boolean, saved boolean, reacted boolean, echoed boolean, poll jsonb, allow_sharing boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query select * from private.feed_rows(private.require_identity(false), p_kind, p_query, p_limit, p_offset, p_id, p_category, null);
end $$;

create function public.get_my_feed(p_scope text, p_limit int default 20, p_offset int default 0)
returns table (id uuid, author_name text, author_mark int, author_context_id uuid, body text, category text, mood text,
  comments_enabled boolean, created_at timestamptz, expires_at timestamptz, reactions int, comments int, echoes int,
  mine boolean, saved boolean, reacted boolean, echoed boolean, poll jsonb, allow_sharing boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_scope not in ('mine','saved','echoes') then raise exception 'invalid_scope' using errcode = '22023'; end if;
  return query select * from private.feed_rows(private.require_identity(false), 'fresh', null, p_limit, p_offset, null, null, p_scope);
end $$;

drop function public.create_post(text, text, text, text, int, boolean);
create function public.create_post(p_body text, p_category text default null, p_mood text default null,
  p_poll_question text default null, p_fading_hours int default null, p_comments_enabled boolean default true, p_allow_sharing boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(true); pid uuid := gen_random_uuid(); c private.identity_contexts; b text := btrim(coalesce(p_body,''));
begin
  if char_length(b) = 0 or char_length(b) > 5000 then raise exception 'invalid_body' using errcode = '22023'; end if;
  if (select count(*) from private.posts where identity_id = v and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'rate_limited' using errcode = '54000'; end if;
  c := private.ensure_context(v, 'post', pid);
  insert into private.posts (id, identity_id, context_id, category, mood, body, comments_enabled, allow_sharing, expires_at)
  values (pid, v, c.id, nullif(btrim(p_category),''), p_mood, b, p_comments_enabled, p_allow_sharing,
          case when p_fading_hours is not null then now() + make_interval(hours => least(greatest(p_fading_hours,1),720)) end);
  if p_poll_question is not null and btrim(p_poll_question) <> '' then
    insert into private.polls (post_id, question) values (pid, btrim(p_poll_question)); end if;
  return pid;
end $$;

create function public.set_post_sharing(p_id uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  update private.posts set allow_sharing = p_on where id = p_id and identity_id = v and status = 'active';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

-- Public (anon-callable) share reads. Gone/expired/moderated/unshareable content returns no rows.
create function public.get_public_post(p_id uuid)
returns table (id uuid, author_name text, body text, category text, mood text, created_at timestamptz, poll_question text)
language sql stable security definer set search_path = '' as $$
  select p.id, c.public_name, p.body, p.category, p.mood, p.created_at, pl.question
  from private.posts p join private.identity_contexts c on c.id = p.context_id left join private.polls pl on pl.post_id = p.id
  where p.id = p_id and p.status = 'active' and p.moderation_state = 'allow' and p.allow_sharing and (p.expires_at is null or p.expires_at > now());
$$;
create function public.get_public_comment(p_id uuid)
returns table (id uuid, post_id uuid, author_name text, body text, created_at timestamptz, post_excerpt text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.post_id, c.public_name, m.body, m.created_at, left(p.body, 160)
  from private.comments m join private.posts p on p.id = m.post_id join private.identity_contexts c on c.id = m.context_id
  where m.id = p_id and m.status = 'active' and (m.expires_at is null or m.expires_at > now())
    and p.status = 'active' and p.moderation_state = 'allow' and p.allow_sharing and (p.expires_at is null or p.expires_at > now());
$$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('get_feed','get_my_feed','create_post','set_post_sharing') loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('get_public_post','get_public_comment') loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop; end $$;
