-- Image uploads. Files live in Cloudflare R2; this table only records ownership, metadata and lifecycle.
-- The media Worker (service_role) registers uploads and deletes expired/orphaned objects.
create table private.post_media (
  id uuid primary key default gen_random_uuid(),
  owner_identity_id uuid not null references private.identities(id) on delete cascade,
  post_id uuid references private.posts(id) on delete set null,
  r2_key text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes int not null check (size_bytes between 1 and 2000000),
  width int not null check (width between 1 and 4096), height int not null check (height between 1 and 4096),
  status text not null default 'pending' check (status in ('pending','attached','deleted')),
  created_at timestamptz not null default now(), attached_at timestamptz
);
create index on private.post_media (post_id);
create index on private.post_media (owner_identity_id, created_at desc);
alter table private.post_media enable row level security; alter table private.post_media force row level security;

create function public.media_register(p_identity uuid, p_key text, p_mime text, p_size int, p_w int, p_h int) returns uuid
language plpgsql security definer set search_path = '' as $$
declare mid uuid;
begin
  if p_key !~ '^\d{4}/\d{2}/[0-9a-f-]{36}\.(jpg|png|webp)$' or p_mime not in ('image/jpeg','image/png','image/webp')
     or p_size not between 1 and 2000000 or p_w not between 1 and 4096 or p_h not between 1 and 4096 then
    raise exception 'invalid_media' using errcode = '22023'; end if;
  if (select count(*) from private.post_media where owner_identity_id = p_identity and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate_limited' using errcode = '54000'; end if;
  insert into private.post_media (owner_identity_id, r2_key, mime_type, size_bytes, width, height) values (p_identity, p_key, p_mime, p_size, p_w, p_h) returning id into mid;
  return mid;
end $$;

create function public.media_remove(p_id uuid) returns void language sql security definer set search_path = '' as $$
  delete from private.post_media where id = p_id and status = 'pending' $$;

create function public.attach_post_media(p_post uuid, p_media uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(true); n int; existing int;
begin
  if p_media is null or array_length(p_media, 1) is null then return; end if;
  if not exists (select 1 from private.posts where id = p_post and identity_id = v and status = 'active') then raise exception 'not_found' using errcode = 'P0002'; end if;
  select count(*) into existing from private.post_media where post_id = p_post and status = 'attached';
  if existing + array_length(p_media, 1) > 4 then raise exception 'too_many_images' using errcode = '22023'; end if;
  update private.post_media set post_id = p_post, status = 'attached', attached_at = now()
   where id = any(p_media) and owner_identity_id = v and status = 'pending' and post_id is null;
  get diagnostics n = row_count;
  if n <> (select count(distinct x) from unnest(p_media) x) then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

create function public.get_media_for_posts(p_post_ids uuid[]) returns table (post_id uuid, r2_key text, mime_type text, width int, height int)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  perform private.require_identity(false);
  return query select m.post_id, m.r2_key, m.mime_type, m.width, m.height
  from private.post_media m join private.posts p on p.id = m.post_id
  where m.post_id = any(p_post_ids[1:100]) and m.status = 'attached' and p.status = 'active' and p.moderation_state = 'allow' and (p.expires_at is null or p.expires_at > now())
  order by m.attached_at;
end $$;

-- Objects whose post is gone, moderated or expired, plus uploads never attached within 24 hours.
create function public.media_take_deletions(p_limit int default 100) returns table (id uuid, r2_key text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.r2_key from private.post_media m left join private.posts p on p.id = m.post_id
  where m.status = 'deleted' or (m.post_id is null and m.created_at < now() - interval '24 hours')
     or p.status in ('deleted','moderated') or (p.expires_at is not null and p.expires_at < now() - interval '1 hour')
  order by m.created_at limit least(greatest(p_limit, 1), 500) $$;
create function public.media_confirm_deleted(p_ids uuid[]) returns void language sql security definer set search_path = '' as $$
  delete from private.post_media where id = any(p_ids) $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('media_register','media_remove','attach_post_media','get_media_for_posts','media_take_deletions','media_confirm_deleted') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname in ('attach_post_media','get_media_for_posts') then execute format('grant execute on function %s to authenticated', f.sig);
    else execute format('grant execute on function %s to service_role', f.sig); end if;
  end loop; end $$;
