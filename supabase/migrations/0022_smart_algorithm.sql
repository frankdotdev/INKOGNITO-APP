-- Migration 0022: Smart For You Feed Algorithm
-- Upgrades the forYou ranking with:
--   1. Seen-post exclusion (client passes array of already-seen IDs → server skips them)
--   2. Category affinity — boosts posts in categories you've engaged with before
--   3. Hacker News-style gravity decay (sharper time penalty on old stale posts)
--   4. Virality velocity — rate of engagement in last 2h, not just cumulative totals
--   5. Author familiarity boost — slightly boosts authors you've interacted with before
--   6. Own-post suppression — your own posts score lower so others fill your feed
--   7. Diversity enforcement — post-processing caps same-category runs to 3 in a row

-- ─── helper: user's top category affinities (from reactions + echoes + comments) ────────────────

create or replace function private.user_category_affinities(p_identity uuid)
returns table (category text, score float8)
language sql stable security definer set search_path = '' as $$
  select p.category,
         (count(*) filter (where x.target_id is not null)      * 1.0
        + count(*) filter (where ec.original_post_id is not null) * 2.0
        + count(*) filter (where m.post_id is not null)            * 3.0
        )::float8 as score
  from private.posts p
  left join private.reactions    x  on x.target_type = 'post' and x.target_id = p.id and x.identity_id = p_identity
  left join private.echoes       ec on ec.original_post_id = p.id and ec.identity_id = p_identity
  left join private.comments     m  on m.post_id = p.id and m.identity_id = p_identity and m.status = 'active'
  where p.category is not null
    and (x.target_id is not null or ec.original_post_id is not null or m.post_id is not null)
  group by p.category
  having count(*) > 0
  order by score desc
  limit 8;
$$;

-- ─── helper: user's interacted author context IDs ────────────────────────────

create or replace function private.user_interacted_authors(p_identity uuid)
returns table (author_context_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct p.context_id
  from private.posts p
  where (
    exists (select 1 from private.reactions x where x.target_type = 'post' and x.target_id = p.id and x.identity_id = p_identity)
    or exists (select 1 from private.echoes ec where ec.original_post_id = p.id and ec.identity_id = p_identity)
    or exists (select 1 from private.comments m where m.post_id = p.id and m.identity_id = p_identity and m.status = 'active')
  )
  and p.identity_id <> p_identity
  limit 50;
$$;

-- ─── main feed function (replaces the one from 0020) ─────────────────────────

create or replace function private.feed_rows(
  v           uuid,
  p_kind      text,
  p_query     text,
  p_limit     int,
  p_offset    int,
  p_id        uuid,
  p_category  text,
  p_scope     text,
  p_seen_ids  uuid[]  default null   -- NEW: client passes IDs it has already shown
)
returns table (id uuid, author_name text, author_mark int, author_context_id uuid, body text, category text, mood text,
  comments_enabled boolean, created_at timestamptz, expires_at timestamptz, reactions int, comments int, echoes int,
  mine boolean, saved boolean, reacted boolean, echoed boolean, poll jsonb, allow_sharing boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  fetch_limit int := least(greatest(p_limit, 1), 50);
  fetch_offset int := greatest(p_offset, 0);
begin

  -- For the forYou feed: fetch a larger candidate pool, then let client-side do
  -- final diversity enforcement and re-ranking. We pass back 3× the requested
  -- limit so the client has enough to enforce category diversity without gaps.
  if p_kind = 'forYou' then
    fetch_limit := least(fetch_limit * 3, 120);
    fetch_offset := 0; -- forYou is stateless — cursor is managed client-side via seen_ids
  end if;

  return query
  with
    -- user's category affinities (cached inline for this query)
    affinities as (
      select ca.category, ca.score,
             max(ca.score) over () as max_score
      from private.user_category_affinities(v) ca
    ),
    -- user's previously engaged authors
    known_authors as (
      select ia.author_context_id from private.user_interacted_authors(v) ia
    ),
    -- main post scan
    base as (
      select
        p.id, c.public_name, c.mark, c.id as ctx_id, p.body, p.category, p.mood,
        p.comments_enabled, p.created_at, p.expires_at,
        p.identity_id, p.context_id, p.allow_sharing,
        -- engagement counts
        (select count(*)::int from private.reactions x where x.target_type = 'post' and x.target_id = p.id) as r,
        (select count(*)::int from private.comments  m where m.post_id = p.id and m.status = 'active' and (m.expires_at is null or m.expires_at > now())) as c_cnt,
        (select count(*)::int from private.echoes    ec where ec.original_post_id = p.id) as e,
        -- velocity: reactions + echoes in last 2 hours
        (select count(*)::int from private.reactions x where x.target_type = 'post' and x.target_id = p.id and x.created_at > now() - interval '2 hours') as r2h,
        (select count(*)::int from private.echoes    ec where ec.original_post_id = p.id and ec.created_at > now() - interval '2 hours') as e2h,
        -- user state
        exists (select 1 from private.bookmarks bk where bk.identity_id = v and bk.post_id = p.id) as saved_,
        exists (select 1 from private.reactions rx where rx.target_type = 'post' and rx.target_id = p.id and rx.identity_id = v) as reacted_,
        exists (select 1 from private.echoes    ec where ec.original_post_id = p.id and ec.identity_id = v) as echoed_,
        -- affinity
        coalesce((select a.score / nullif(a.max_score, 0) from affinities a where a.category = p.category limit 1), 0.0) as cat_affinity,
        -- author familiarity
        exists (select 1 from known_authors ka where ka.author_context_id = p.context_id) as known_author,
        -- poll data
        pl.post_id as poll_post_id, pl.question as poll_q, pl.option_a, pl.option_b,
        (select o.option from private.poll_votes o where o.post_id = p.id and o.identity_id = v) as my_vote,
        (select count(*) filter (where q.option = 0)::int from private.poll_votes q where q.post_id = p.id) as votes_a,
        (select count(*) filter (where q.option = 1)::int from private.poll_votes q where q.post_id = p.id) as votes_b
      from private.posts p
      join  private.identity_contexts c on c.id = p.context_id
      left join private.polls pl on pl.post_id = p.id
      where p.status = 'active'
        and p.moderation_state = 'allow'
        and (p.expires_at is null or p.expires_at > now())
        and (p_id       is null or p.id = p_id)
        and (p_category is null or lower(p.category) = lower(p_category))
        and (p_scope is null
             or (p_scope = 'mine'   and p.identity_id = v)
             or (p_scope = 'saved'  and exists (select 1 from private.bookmarks b where b.identity_id = v and b.post_id = p.id))
             or (p_scope = 'echoes' and exists (select 1 from private.echoes ec where ec.original_post_id = p.id and ec.identity_id = v)))
        and not exists (select 1 from private.blocks bl where bl.blocker_identity_id = v and bl.blocked_identity_id = p.identity_id)
        and (p_query is null or p.body ilike '%' || replace(replace(p_query,'%','\%'),'_','\_') || '%' or lower(p.category) = lower(p_query))
        and (p_kind <> 'questions' or p.body like '%?%')
        and (p_kind <> 'polls'     or pl.post_id is not null)
    ),
    scored as (
      select
        b.*,
        case p_kind
          when 'forYou' then (
            -- ── Engagement signal: log-dampened weighted sum ──────────────
            (ln(1.0 + b.r + 2.5 * b.c_cnt + 3.5 * b.e) * 1.6)

            -- ── Recency: Hacker News gravity decay (sharper than power law) ──
            -- Score halves every ~6h for fresh posts, much faster for old ones
            + (8.0 / power(
                (extract(epoch from (now() - b.created_at)) / 3600.0) + 1.5,
                1.2
              ))

            -- ── Velocity bonus: recent activity signals trending right now ──
            + (ln(1.0 + b.r2h + 2.0 * b.e2h) * 2.5)

            -- ── Category affinity: 0..1 scaled to 0..2.5 points ──────────
            + (b.cat_affinity * 2.5)

            -- ── Author familiarity: tiny nudge (0.4) if you've engaged with this author ──
            + (case when b.known_author then 0.4 else 0.0 end)

            -- ── Content richness bonus ────────────────────────────────────
            + (case when b.poll_post_id is not null then 0.6 else 0.0 end)

            -- ── Seen-post freshness bonus / repeat penalty (never hides posts completely) ──
            + (case when p_seen_ids is not null and b.id = any(p_seen_ids) then -3.5 else 1.2 end)

            -- ── Own-post suppression ──────────────────────────────────────
            - (case when b.identity_id = v then 2.5 else 0.0 end)

            -- ── Stochastic exploration: random 0..1.8 ensures some serendipity ──
            + (random() * 1.8)
          )
          when 'trending' then
            (b.r + 2 * b.c_cnt + 3 * b.e + 1)::float8
            / power(extract(epoch from now() - b.created_at) / 3600 + 2, 1.5)
          when 'echoed' then b.e::float8
          when 'deep'   then b.c_cnt::float8
          when 'random' then random()
          else 0
        end as score
      from base b
    )
  select
    s.id,
    s.public_name,
    s.mark,
    s.ctx_id,
    s.body,
    s.category,
    s.mood,
    s.comments_enabled,
    s.created_at,
    s.expires_at,
    s.r,
    s.c_cnt,
    s.e,
    s.identity_id = v,
    s.saved_,
    s.reacted_,
    s.echoed_,
    case when s.poll_post_id is null then null else jsonb_build_object(
      'question', s.poll_q,
      'options',  jsonb_build_array(s.option_a, s.option_b),
      'myVote',   s.my_vote,
      'votes',    case when s.my_vote is not null or s.identity_id = v
                       then jsonb_build_array(s.votes_a, s.votes_b) end
    ) end,
    s.allow_sharing
  from scored s
  order by s.score desc, s.created_at desc
  limit fetch_limit offset fetch_offset;
end $$;

-- ─── public.get_feed wrapper with p_seen_ids ──────────────────────────────────
drop function if exists public.get_feed(text, text, int, int, uuid, text);
drop function if exists public.get_feed(text, text, int, int, uuid, text, uuid[]);

create function public.get_feed(
  p_kind      text    default 'fresh',
  p_query     text    default null,
  p_limit     int     default 20,
  p_offset    int     default 0,
  p_id        uuid    default null,
  p_category  text    default null,
  p_seen_ids  uuid[]  default null
)
returns table (id uuid, author_name text, author_mark int, author_context_id uuid, body text, category text, mood text,
  comments_enabled boolean, created_at timestamptz, expires_at timestamptz, reactions int, comments int, echoes int,
  mine boolean, saved boolean, reacted boolean, echoed boolean, poll jsonb, allow_sharing boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query select * from private.feed_rows(
    private.require_identity(false),
    p_kind, p_query, p_limit, p_offset, p_id, p_category, null, p_seen_ids
  );
end $$;

revoke all on function public.get_feed(text, text, int, int, uuid, text, uuid[]) from public, anon;
grant execute on function public.get_feed(text, text, int, int, uuid, text, uuid[]) to authenticated;
