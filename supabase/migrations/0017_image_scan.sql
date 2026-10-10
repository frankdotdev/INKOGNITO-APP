-- Automated image checks. The media Worker scans each upload with a moderation provider and tells the database the result.
-- 'allow' images can publish (if review is off), 'review' images always wait for a moderator, blocked images are never stored.
alter table private.post_media add column scan_status text not null default 'unscanned' check (scan_status in ('unscanned','allow','review')), add column scan_categories jsonb;
create table private.image_scan_events (
  id uuid primary key default gen_random_uuid(), identity_id uuid not null references private.identities(id) on delete cascade,
  result text not null check (result in ('block','review')), urgent boolean not null default false, categories jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index on private.image_scan_events (created_at desc);
alter table private.image_scan_events enable row level security; alter table private.image_scan_events force row level security;

drop function public.media_register(uuid, text, text, int, int, int);
create function public.media_register(p_identity uuid, p_key text, p_mime text, p_size int, p_w int, p_h int, p_scan text default 'unscanned', p_categories jsonb default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
  if p_key !~ '^\d{4}/\d{2}/[0-9a-f-]{36}\.(jpg|png|webp)$' or p_mime not in ('image/jpeg','image/png','image/webp')
     or p_size not between 1 and 2000000 or p_w not between 1 and 4096 or p_h not between 1 and 4096 or p_scan not in ('unscanned','allow','review') then
    raise exception 'invalid_media' using errcode = '22023'; end if;
  if (select count(*) from private.post_media where owner_identity_id = p_identity and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into private.post_media (owner_identity_id, r2_key, mime_type, size_bytes, width, height, scan_status, scan_categories) values (p_identity, p_key, p_mime, p_size, p_w, p_h, p_scan, p_categories) returning id into mid;
  if p_scan = 'review' then insert into private.image_scan_events (identity_id, result, categories) values (p_identity, 'review', coalesce(p_categories, '{}')); end if;
  return mid;
end $$;

create function public.media_log_block(p_identity uuid, p_urgent boolean, p_categories jsonb) returns void language sql security definer set search_path = '' as $$
  insert into private.image_scan_events (identity_id, result, urgent, categories) values (p_identity, 'block', coalesce(p_urgent, false), coalesce(p_categories, '{}')) $$;

-- An image post is held for a moderator if review is required, the scanner wants a person to look, or (when scanning is required) the scan did not happen.
create or replace function public.attach_post_media(p_post uuid, p_media uuid[]) returns boolean
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
  if private.cfg('media_review_required', 1) = 1
     or exists (select 1 from private.post_media where post_id = p_post and scan_status = 'review')
     or (private.cfg('media_scan_required', 0) = 1 and exists (select 1 from private.post_media where post_id = p_post and scan_status = 'unscanned')) then
    update private.posts set moderation_state = 'review' where id = p_post and moderation_state = 'allow'; held := true;
  end if;
  return held;
end $$;

create function public.admin_scan_events(p_limit int default 50) returns table (id uuid, identity_id uuid, result text, urgent boolean, categories jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare r text := private.require_admin(array['super_admin','moderator','safety_moderator']);
begin
  return query select e.id, e.identity_id, e.result, e.urgent, e.categories, e.created_at from private.image_scan_events e order by e.urgent desc, e.created_at desc limit least(greatest(p_limit,1),100);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('media_register','media_log_block','attach_post_media','admin_scan_events') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname in ('media_register','media_log_block') then execute format('grant execute on function %s to service_role', f.sig); else execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop; end $$;
