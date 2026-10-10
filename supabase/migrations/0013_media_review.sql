-- Image review queue. Until automated scanning is in place, posts with images can be held for a moderator before anyone sees them.
-- Controlled by platform_config 'media_review_required' (1 = hold, 0 = publish immediately). Default: hold.
drop function public.attach_post_media(uuid, uuid[]);
create function public.attach_post_media(p_post uuid, p_media uuid[]) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(true); n int; existing int; held boolean := false;
begin
  if p_media is null or array_length(p_media, 1) is null then return false; end if;
  if not exists (select 1 from private.posts where id = p_post and identity_id = v and status = 'active') then raise exception 'not_found' using errcode = 'P0002'; end if;
  select count(*) into existing from private.post_media where post_id = p_post and status = 'attached';
  if existing + array_length(p_media, 1) > 4 then raise exception 'too_many_images' using errcode = '22023'; end if;
  update private.post_media set post_id = p_post, status = 'attached', attached_at = now()
   where id = any(p_media) and owner_identity_id = v and status = 'pending' and post_id is null;
  get diagnostics n = row_count;
  if n <> (select count(distinct x) from unnest(p_media) x) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if private.cfg('media_review_required', 1) = 1 then
    update private.posts set moderation_state = 'review' where id = p_post and moderation_state = 'allow'; held := true;
  end if;
  return held;
end $$;
revoke all on function public.attach_post_media(uuid, uuid[]) from public, anon;
grant execute on function public.attach_post_media(uuid, uuid[]) to authenticated;

create function public.admin_review_queue(p_limit int default 30, p_offset int default 0)
returns table (id uuid, body text, author_name text, created_at timestamptz, media jsonb)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare r text := private.require_admin(array['super_admin','moderator','safety_moderator']);
begin
  return query select p.id, left(p.body, 600), c.public_name, p.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('key', m.r2_key, 'width', m.width, 'height', m.height) order by m.attached_at) from private.post_media m where m.post_id = p.id and m.status = 'attached'), '[]'::jsonb)
  from private.posts p join private.identity_contexts c on c.id = p.context_id
  where p.status = 'active' and p.moderation_state = 'review' order by p.created_at limit least(greatest(p_limit,1),100) offset greatest(p_offset,0);
end $$;
create function public.admin_review_count() returns int language plpgsql stable security definer set search_path = '' as $$
declare r text := private.require_admin(array['super_admin','moderator','safety_moderator','support','analytics','finance']);
begin return (select count(*)::int from private.posts where status = 'active' and moderation_state = 'review'); end $$;

create or replace function public.admin_set_post_state(p_post uuid, p_action text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := private.require_admin(array['super_admin','moderator','safety_moderator']); why text := private.need_reason(p_reason); n int;
begin
  if p_action = 'remove' then update private.posts set status = 'moderated', moderation_state = 'block' where id = p_post and status = 'active';
  elsif p_action = 'restore' then update private.posts set status = 'active', moderation_state = 'allow' where id = p_post and status = 'moderated';
  elsif p_action = 'approve' then update private.posts set moderation_state = 'allow' where id = p_post and status = 'active' and moderation_state = 'review';
  elsif p_action = 'reject' then update private.posts set status = 'moderated', moderation_state = 'block' where id = p_post and status = 'active' and moderation_state = 'review';
  elsif p_action = 'lock_comments' then update private.posts set comments_enabled = false where id = p_post and status <> 'deleted';
  elsif p_action = 'unlock_comments' then update private.posts set comments_enabled = true where id = p_post and status <> 'deleted';
  else raise exception 'invalid' using errcode = '22023'; end if;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.audit(r, p_action || '_post', 'post', p_post::text, why);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('admin_review_queue','admin_review_count') loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop; end $$;
