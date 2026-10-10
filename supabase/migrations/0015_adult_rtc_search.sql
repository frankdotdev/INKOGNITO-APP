-- Audio/video random chat gates (off by default, adults only) and search for claimed names.
alter table private.identities add column adult_confirmed_at timestamptz;

-- A recorded self-declaration. It is not age verification; it is the legal "I am 18 or older" step.
create function public.confirm_adult() returns void language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin update private.identities set adult_confirmed_at = coalesce(adult_confirmed_at, now()) where id = v; end $$;

create function public.random_availability() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  return jsonb_build_object('audio', private.cfg('random_audio_enabled', 0) = 1, 'video', private.cfg('random_video_enabled', 0) = 1,
    'adult', (select adult_confirmed_at is not null from private.identities where id = v));
end $$;

-- Used by the random chat Worker for every mode. Audio and video must be switched on and the person must have confirmed they are 18+.
create function public.random_mode_check(p_auth_user uuid, p_mode text) returns table (identity_id uuid, allowed boolean, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare r private.identities;
begin
  select i.* into r from private.identity_sessions x join private.identities i on i.id = x.identity_id where x.auth_user_id = p_auth_user and i.status <> 'purged';
  if not found then return; end if;
  if p_mode not in ('text','audio','video') then return query select r.id, false, 'invalid'::text; return; end if;
  if r.status <> 'active' or r.risk_level = 'banned' then return query select r.id, false, 'not_allowed'::text; return; end if;
  if p_mode <> 'text' and private.cfg('random_' || p_mode || '_enabled', 0) <> 1 then return query select r.id, false, 'disabled'::text; return; end if;
  if p_mode <> 'text' and r.adult_confirmed_at is null then return query select r.id, false, 'adult_required'::text; return; end if;
  return query select r.id, true, 'ok'::text;
end $$;

create function public.search_aliases(p_query text) returns table (alias text)
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := private.require_identity(false); q text := lower(btrim(coalesce(p_query, '')));
begin
  if char_length(q) < 2 or char_length(q) > 20 or q !~ '^[a-z0-9_]+$' then return; end if;
  return query select a.alias from private.aliases a where a.revoked_at is null and a.alias_norm like replace(q, '_', '\_') || '%' order by a.alias_norm limit 8;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('confirm_adult','random_availability','random_mode_check','search_aliases') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname = 'random_mode_check' then execute format('grant execute on function %s to service_role', f.sig); else execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop; end $$;
