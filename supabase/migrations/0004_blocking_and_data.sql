-- Blocking (by content, never by identity id), blocked-list management, and "delete my content".
alter table private.blocks add column id uuid not null default gen_random_uuid(), add column label text;
create unique index on private.blocks (id);

create function public.block_author(p_type text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false); t uuid; l text;
begin
  if p_type = 'post' then
    select p.identity_id, c.public_name into t, l from private.posts p join private.identity_contexts c on c.id = p.context_id where p.id = p_id and p.status = 'active';
  elsif p_type = 'comment' then
    select m.identity_id, c.public_name into t, l from private.comments m join private.identity_contexts c on c.id = m.context_id where m.id = p_id and m.status = 'active';
  elsif p_type = 'whisper' then
    select w.sender_identity_id, c.public_name into t, l from private.whispers w join private.identity_contexts c on c.id = w.sender_context_id where w.id = p_id and w.recipient_identity_id = v;
  else raise exception 'invalid_type' using errcode = '22023'; end if;
  if t is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if t = v then raise exception 'own_content' using errcode = '22023'; end if;
  insert into private.blocks (blocker_identity_id, blocked_identity_id, label) values (v, t, l) on conflict do nothing;
end $$;

create function public.list_blocked() returns table (id uuid, label text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v uuid := private.require_identity(false);
begin
  return query select b.id, coalesce(b.label, 'Anonymous'), b.created_at from private.blocks b where b.blocker_identity_id = v order by b.created_at desc;
end $$;

create function public.unblock(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin delete from private.blocks where id = p_id and blocker_identity_id = v; end $$;

create function public.delete_my_content() returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  update private.posts set status = 'deleted', deleted_at = now() where identity_id = v and status = 'active';
  update private.comments set status = 'deleted' where identity_id = v and status = 'active';
  delete from private.whispers where sender_identity_id = v;
  delete from private.reactions where identity_id = v;
  delete from private.echoes where identity_id = v;
  delete from private.bookmarks where identity_id = v;
  delete from private.poll_votes where identity_id = v;
end $$;

-- Blocked senders no longer appear in your Whispers or Activity.
create or replace function public.list_whispers(p_limit int default 50, p_offset int default 0)
returns table (id uuid, post_id uuid, from_name text, from_mark int, body text, mine boolean, expires_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v uuid := private.require_identity(false);
begin
  return query
  select w.id, w.post_id, c.public_name, c.mark, w.body, w.sender_identity_id = v, w.expires_at, w.created_at
  from private.whispers w join private.identity_contexts c on c.id = w.sender_context_id
  where ((w.recipient_identity_id = v and not exists (select 1 from private.blocks bl where bl.blocker_identity_id = v and bl.blocked_identity_id = w.sender_identity_id))
         or w.sender_identity_id = v) and w.expires_at > now()
  order by w.created_at desc limit least(greatest(p_limit,1),100) offset greatest(p_offset,0);
end $$;

create or replace function public.list_activity(p_limit int default 30, p_offset int default 0)
returns table (kind text, post_id uuid, post_excerpt text, actor_name text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v uuid := private.require_identity(false);
begin
  return query
  select * from (
    select 'comment'::text k, p.id, left(p.body, 100), c.public_name, m.created_at
      from private.comments m join private.posts p on p.id = m.post_id join private.identity_contexts c on c.id = m.context_id
      where p.identity_id = v and m.identity_id <> v and m.status = 'active' and p.status = 'active' and (m.expires_at is null or m.expires_at > now())
        and not exists (select 1 from private.blocks bl where bl.blocker_identity_id = v and bl.blocked_identity_id = m.identity_id)
    union all
    select 'reaction', p.id, left(p.body, 100), null::text, r.created_at
      from private.reactions r join private.posts p on p.id = r.target_id
      where r.target_type = 'post' and p.identity_id = v and r.identity_id <> v and p.status = 'active'
        and not exists (select 1 from private.blocks bl where bl.blocker_identity_id = v and bl.blocked_identity_id = r.identity_id)
    union all
    select 'echo', p.id, left(p.body, 100), null::text, e.created_at
      from private.echoes e join private.posts p on p.id = e.original_post_id
      where p.identity_id = v and e.identity_id <> v and p.status = 'active'
        and not exists (select 1 from private.blocks bl where bl.blocker_identity_id = v and bl.blocked_identity_id = e.identity_id)
    union all
    select 'whisper', p.id, left(p.body, 100), null::text, w.created_at
      from private.whispers w join private.posts p on p.id = w.post_id
      where w.recipient_identity_id = v and w.expires_at > now()
        and not exists (select 1 from private.blocks bl where bl.blocker_identity_id = v and bl.blocked_identity_id = w.sender_identity_id)
  ) a(k, pid, ex, actor, at)
  order by at desc limit least(greatest(p_limit,1),50) offset greatest(p_offset,0);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('block_author','list_blocked','unblock','delete_my_content') loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop; end $$;
