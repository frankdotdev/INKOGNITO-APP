-- Multi-device identity: many auth sessions (devices) can belong to one identity. Linking by one-time code,
-- recovery by a secret only the user holds, device revoke/purge, and full identity deletion.
alter table private.identities drop constraint identities_auth_user_id_key;
alter table private.identities drop constraint identities_auth_user_id_fkey;
alter table private.identities alter column auth_user_id drop not null;  -- origin only; no longer the access path

create table private.identity_sessions (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  identity_id uuid not null references private.identities(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on private.identity_sessions (identity_id);
insert into private.identity_sessions (auth_user_id, identity_id) select auth_user_id, id from private.identities where auth_user_id is not null on conflict do nothing;

alter table private.devices alter column public_key drop not null;
alter table private.devices add column auth_user_id uuid, add column label text, add column last_seen_at timestamptz not null default now();
create unique index on private.devices (auth_user_id);

create table private.recovery (
  identity_id uuid primary key references private.identities(id) on delete cascade,
  secret_hash text not null unique, created_at timestamptz not null default now()
);
create table private.recovery_attempts (
  id bigint generated always as identity primary key, auth_user_id uuid not null, created_at timestamptz not null default now()
);
create index on private.recovery_attempts (auth_user_id, created_at);
create table private.pairings (
  id uuid primary key default gen_random_uuid(),
  requester_auth_user uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  status text not null default 'pending' check (status in ('pending','approved','completed','expired')),
  approver_identity_id uuid references private.identities(id) on delete cascade,
  attempts int not null default 0,
  expires_at timestamptz not null, created_at timestamptz not null default now(), approved_at timestamptz
);
create index on private.pairings (requester_auth_user, created_at);
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'private' loop
    execute format('alter table private.%I enable row level security', t.tablename);
    execute format('alter table private.%I force row level security', t.tablename);
  end loop; end $$;

create function private.sha256_hex(p text) returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;

create or replace function private.require_identity(p_write boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v uuid; s text;
begin
  select i.id, i.status into v, s from private.identity_sessions x join private.identities i on i.id = x.identity_id
  where x.auth_user_id = auth.uid() and i.status <> 'purged';
  if v is null then raise exception 'no_identity' using errcode = '28000'; end if;
  if p_write and s <> 'active' then raise exception 'restricted' using errcode = '42501'; end if;
  return v;
end $$;

create or replace function public.ensure_identity() returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); v uuid;
begin
  if u is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtext(u::text));
  select x.identity_id into v from private.identity_sessions x join private.identities i on i.id = x.identity_id where x.auth_user_id = u and i.status <> 'purged';
  if v is null then
    insert into private.identities (auth_user_id) values (u) returning id into v;
    insert into private.identity_sessions (auth_user_id, identity_id) values (u, v)
      on conflict (auth_user_id) do update set identity_id = excluded.identity_id;
  end if;
  update private.identities set last_seen_at = now() where id = v;
end $$;

create function private.identity_has_content(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.posts where identity_id = p_id and status = 'active')
      or exists (select 1 from private.comments where identity_id = p_id and status = 'active')
      or exists (select 1 from private.whispers where sender_identity_id = p_id) $$;

-- Moves this auth session onto the target identity. A device that already has its own content is refused.
create function private.attach_session(p_user uuid, p_target uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare old uuid;
begin
  select identity_id into old from private.identity_sessions where auth_user_id = p_user;
  if old is not distinct from p_target then return 'ok'; end if;
  if old is not null and private.identity_has_content(old) then return 'device_has_content'; end if;
  insert into private.identity_sessions (auth_user_id, identity_id) values (p_user, p_target)
    on conflict (auth_user_id) do update set identity_id = excluded.identity_id;
  delete from private.devices where auth_user_id = p_user;
  if old is not null and not exists (select 1 from private.identity_sessions where identity_id = old) then
    update private.identities set status = 'purged', purged_at = now() where id = old;
  end if;
  return 'ok';
end $$;

-- ---------- linking (new device shows a code, existing device approves it) ----------
create function public.create_pairing(p_code_hash text) returns table (id uuid, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare u uuid := auth.uid(); pid uuid; exp timestamptz := now() + interval '5 minutes';
begin
  if u is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_code_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_hash' using errcode = '22023'; end if;
  if (select count(*) from private.pairings where requester_auth_user = u and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'rate_limited' using errcode = '54000'; end if;
  update private.pairings set status = 'expired' where requester_auth_user = u and status in ('pending','approved');
  insert into private.pairings (requester_auth_user, code_hash, expires_at) values (u, p_code_hash, exp) returning private.pairings.id into pid;
  return query select pid, exp;
end $$;

create function public.approve_pairing(p_id uuid, p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(true); r private.pairings;
begin
  select * into r from private.pairings where id = p_id for update;
  if not found or r.status <> 'pending' or r.requester_auth_user = auth.uid() or r.attempts >= 5 then return 'invalid'; end if;
  if r.expires_at < now() then update private.pairings set status = 'expired' where id = p_id; return 'expired'; end if;
  if private.sha256_hex(coalesce(p_code, '')) <> r.code_hash then update private.pairings set attempts = attempts + 1 where id = p_id; return 'invalid'; end if;
  update private.pairings set status = 'approved', approver_identity_id = v, approved_at = now() where id = p_id;
  return 'ok';
end $$;

create function public.pairing_status(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when status in ('pending','approved') and expires_at < now() then 'expired' else status end
                   from private.pairings where id = p_id and requester_auth_user = auth.uid()), 'invalid') $$;

create function public.complete_pairing(p_id uuid, p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); r private.pairings; res text;
begin
  if u is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select * into r from private.pairings where id = p_id and requester_auth_user = u for update;
  if not found or r.status <> 'approved' or r.attempts >= 5 then return 'invalid'; end if;
  if r.expires_at < now() then update private.pairings set status = 'expired' where id = p_id; return 'expired'; end if;
  if private.sha256_hex(coalesce(p_code, '')) <> r.code_hash then update private.pairings set attempts = attempts + 1 where id = p_id; return 'invalid'; end if;
  res := private.attach_session(u, r.approver_identity_id);
  if res = 'ok' then update private.pairings set status = 'completed' where id = p_id; end if;
  return res;
end $$;

-- ---------- recovery (client sends sha256 of the code; the server stores a hash of that hash) ----------
create function public.set_recovery(p_hash text) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  if p_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_hash' using errcode = '22023'; end if;
  insert into private.recovery (identity_id, secret_hash) values (v, private.sha256_hex(p_hash))
  on conflict (identity_id) do update set secret_hash = excluded.secret_hash, created_at = now();
end $$;

create function public.recover_identity(p_hash text) returns text
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); target uuid;
begin
  if u is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if (select count(*) from private.recovery_attempts where auth_user_id = u and created_at > now() - interval '1 hour') >= 5 then return 'rate_limited'; end if;
  select r.identity_id into target from private.recovery r join private.identities i on i.id = r.identity_id
   where p_hash ~ '^[0-9a-f]{64}$' and r.secret_hash = private.sha256_hex(p_hash) and i.status <> 'purged';
  if target is null then insert into private.recovery_attempts (auth_user_id) values (u); return 'invalid'; end if;
  return private.attach_session(u, target);
end $$;

-- ---------- devices, summary, purge ----------
create function public.register_device(p_label text, p_platform text default 'web') returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  insert into private.devices (identity_id, auth_user_id, label, platform) values (v, auth.uid(), left(p_label, 60), left(p_platform, 20))
  on conflict (auth_user_id) do update set identity_id = excluded.identity_id, label = excluded.label, platform = excluded.platform, last_seen_at = now(), revoked_at = null;
end $$;

create function public.list_devices() returns table (id uuid, label text, platform text, created_at timestamptz, last_seen_at timestamptz, is_current boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v uuid := private.require_identity(false);
begin
  return query select d.id, coalesce(d.label, 'Unknown device'), d.platform, d.created_at, d.last_seen_at, d.auth_user_id = auth.uid()
  from private.devices d where d.identity_id = v and d.revoked_at is null order by d.created_at;
end $$;

create function public.revoke_device(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false); d private.devices;
begin
  select * into d from private.devices where id = p_id and identity_id = v and revoked_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  if d.auth_user_id = auth.uid() then raise exception 'use_purge' using errcode = '22023'; end if;
  delete from private.identity_sessions where auth_user_id = d.auth_user_id;
  update private.devices set revoked_at = now() where id = p_id;
end $$;

create function public.identity_summary() returns table (created_at timestamptz, device_count int, has_recovery boolean, recovery_created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare v uuid := private.require_identity(false);
begin
  return query select i.created_at, (select count(*)::int from private.identity_sessions x where x.identity_id = v),
    exists (select 1 from private.recovery r where r.identity_id = v), (select r.created_at from private.recovery r where r.identity_id = v)
  from private.identities i where i.id = v;
end $$;

create function public.purge_this_device() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.identity_sessions where auth_user_id = auth.uid();
  delete from private.devices where auth_user_id = auth.uid();
end $$;

create function public.delete_identity() returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  perform public.delete_my_content();
  delete from private.identity_sessions where identity_id = v;
  delete from private.devices where identity_id = v;
  delete from private.recovery where identity_id = v;
  delete from private.blocks where blocker_identity_id = v;
  update private.identities set status = 'purged', purged_at = now() where id = v;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('ensure_identity','create_pairing','approve_pairing','pairing_status','complete_pairing','set_recovery','recover_identity','register_device','list_devices','revoke_device','identity_summary','purge_this_device','delete_identity') loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop; end $$;
