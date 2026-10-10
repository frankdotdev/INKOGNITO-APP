-- Adds an exact category filter to get_feed (category pages) without matching body text.
drop function public.get_feed(text, text, int, int, uuid);
create function public.get_feed(p_kind text default 'fresh', p_query text default null, p_limit int default 20, p_offset int default 0, p_id uuid default null, p_category text default null)
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
    and (p_category is null or lower(p.category) = lower(p_category))
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
revoke all on function public.get_feed(text, text, int, int, uuid, text) from public, anon;
grant execute on function public.get_feed(text, text, int, int, uuid, text) to authenticated;
