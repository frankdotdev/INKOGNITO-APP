-- Inkognito Plus and claimed aliases. An alias is bought once and kept for life (it survives Plus lapsing);
-- Plus is a monthly subscription for the features that cost money to run. Payment details never enter this
-- database: only an order reference, amount, currency and the provider's customer/subscription codes.
create table private.reserved_aliases (alias_norm text primary key);
insert into private.reserved_aliases values ('admin'),('administrator'),('support'),('inkognito'),('ink'),('moderator'),('mod'),('staff'),('team'),('official'),('help'),('security'),('system'),('root'),('null'),('undefined'),('anonymous'),('void'),('echo'),('whisper'),('plus'),('billing'),('abuse'),('safety'),('trust'),('legal'),('privacy'),('terms'),('press'),('contact'),('www'),('api'),('app'),('random'),('companion');
create table private.aliases (
  identity_id uuid primary key references private.identities(id) on delete cascade,
  alias text not null, alias_norm text not null unique, claimed_at timestamptz not null default now(), revoked_at timestamptz,
  use_by_default boolean not null default true, order_reference text
);
create table private.orders (
  reference text primary key, identity_id uuid not null references private.identities(id) on delete cascade,
  alias text, currency text not null check (currency in ('USD','NGN')), amount int not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','paid','needs_review')),
  provider text not null default 'paystack', provider_ref text, customer_code text,
  created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '30 minutes', paid_at timestamptz
);
create index on private.orders (identity_id, created_at desc);
create index on private.orders (alias) where status = 'pending';
create table private.subscriptions (
  identity_id uuid primary key references private.identities(id) on delete cascade,
  provider text not null default 'paystack', customer_code text, subscription_code text, currency text, amount int,
  status text not null default 'active' check (status in ('active','cancelled','past_due')),
  plus_until timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on private.subscriptions (customer_code);
create index on private.subscriptions (subscription_code);
create table private.pending_subscription_codes (customer_code text primary key, subscription_code text not null);
create table private.payment_events (key text primary key, created_at timestamptz not null default now());
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'private' loop
    execute format('alter table private.%I enable row level security', t.tablename);
    execute format('alter table private.%I force row level security', t.tablename);
  end loop; end $$;

create function private.plus_active(p_identity uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select plus_until > now() from private.subscriptions where identity_id = p_identity), false) $$;

create function private.alias_status(p_norm text, p_identity uuid) returns text language sql stable security definer set search_path = '' as $$
  select case
    when p_norm !~ '^[a-z][a-z0-9_]{2,19}$' or p_norm ~ '_$' or p_norm ~ '__' then 'invalid'
    when exists (select 1 from private.reserved_aliases where alias_norm = p_norm) then 'reserved'
    when exists (select 1 from private.aliases where alias_norm = p_norm) then 'taken'
    when exists (select 1 from private.orders where lower(alias) = p_norm and status = 'pending' and expires_at > now() and identity_id <> p_identity) then 'pending'
    else 'ok' end $$;

create function public.check_alias(p_alias text) returns table (available boolean, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := private.require_identity(false); s text;
begin
  s := private.alias_status(lower(btrim(coalesce(p_alias, ''))), v);
  return query select s = 'ok', s;
end $$;

-- Stored aliases are lowercase. Existing contexts keep their names; new ones use the alias when the owner has it switched on.
create or replace function private.ensure_context(p_identity uuid, p_type text, p_ref uuid) returns private.identity_contexts
language plpgsql security definer set search_path = '' as $$
declare
  r private.identity_contexts; salt int := 0; h bytea; n text; a text;
  adj text[] := array['Quiet','Midnight','Paper','Lost','Fallen','Silver','Hidden','Burning','Distant','Hollow','Gentle','Faded','Restless','Velvet','Cold','Amber'];
  noun text[] := array['Static','Sparrow','Ghost','Signal','Moon','Rain','Window','Letter','Lantern','Comet','Thunder','Harbor','Echo','Ember','River','Shadow'];
begin
  select * into r from private.identity_contexts where identity_id = p_identity and context_type = p_type and context_ref = p_ref;
  if found then return r; end if;
  select '@' || alias into a from private.aliases where identity_id = p_identity and revoked_at is null and use_by_default;
  if a is not null then
    begin
      insert into private.identity_contexts (identity_id, context_type, context_ref, public_name, mark)
      values (p_identity, p_type, p_ref, a, get_byte(decode(md5(a), 'hex'), 0)) returning * into r;
      return r;
    exception when unique_violation then
      select * into r from private.identity_contexts where identity_id = p_identity and context_type = p_type and context_ref = p_ref;
      if found then return r; end if;
    end;
  end if;
  loop
    h := decode(md5(p_identity::text || p_ref::text || salt::text), 'hex');
    n := adj[1 + get_byte(h,0) % 16] || ' ' || noun[1 + get_byte(h,1) % 16] || case when salt >= 20 then ' ' || salt else '' end;
    begin
      insert into private.identity_contexts (identity_id, context_type, context_ref, public_name, mark)
      values (p_identity, p_type, p_ref, n, get_byte(h,2)) returning * into r;
      return r;
    exception when unique_violation then
      select * into r from private.identity_contexts where identity_id = p_identity and context_type = p_type and context_ref = p_ref;
      if found then return r; end if;
      salt := salt + 1;
    end;
  end loop;
end $$;

-- ---------- called by the billing Worker (service_role) ----------
create function public.billing_start_checkout(p_identity uuid, p_alias text, p_currency text, p_amount int) returns text
language plpgsql security definer set search_path = '' as $$
declare norm text := lower(btrim(coalesce(p_alias, ''))); ref text := 'ink_' || replace(gen_random_uuid()::text, '-', ''); s text;
begin
  if p_currency not in ('USD','NGN') or p_amount <= 0 then raise exception 'invalid' using errcode = '22023'; end if;
  if (select count(*) from private.orders where identity_id = p_identity and created_at > now() - interval '1 hour') >= 10 then raise exception 'rate_limited' using errcode = '54000'; end if;
  if p_alias is not null then
    if exists (select 1 from private.aliases where identity_id = p_identity) then raise exception 'has_alias' using errcode = '22023'; end if;
    s := private.alias_status(norm, p_identity);
    if s <> 'ok' then raise exception 'alias_%', s using errcode = '22023'; end if;
  end if;
  insert into private.orders (reference, identity_id, alias, currency, amount) values (ref, p_identity, nullif(norm, ''), p_currency, p_amount);
  return ref;
end $$;

create function public.billing_get_order(p_reference text) returns table (identity_id uuid, status text, amount int, currency text, alias text)
language sql stable security definer set search_path = '' as $$
  select identity_id, status, amount, currency, alias from private.orders where reference = p_reference $$;

create function public.billing_complete_order(p_reference text, p_provider_ref text, p_amount int, p_currency text, p_customer_code text, p_subscription_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare o private.orders; res text := 'ok'; months int := private.cfg('plus_months_per_payment', 1); sub text;
begin
  select * into o from private.orders where reference = p_reference for update;
  if not found then return 'unknown'; end if;
  if o.paid_at is not null then return 'already'; end if;
  if o.amount <> p_amount or o.currency <> p_currency then update private.orders set status = 'needs_review', provider_ref = p_provider_ref where reference = p_reference; return 'mismatch'; end if;
  if o.alias is not null then
    begin insert into private.aliases (identity_id, alias, alias_norm, order_reference) values (o.identity_id, lower(o.alias), lower(o.alias), p_reference);
    exception when unique_violation then res := 'alias_taken'; end;
  end if;
  select subscription_code into sub from private.pending_subscription_codes where customer_code = p_customer_code; sub := coalesce(sub, p_subscription_code);
  delete from private.pending_subscription_codes where customer_code = p_customer_code;
  insert into private.subscriptions (identity_id, customer_code, subscription_code, currency, amount, plus_until)
  values (o.identity_id, p_customer_code, sub, o.currency, o.amount, now() + make_interval(months => months))
  on conflict (identity_id) do update set customer_code = excluded.customer_code, subscription_code = coalesce(excluded.subscription_code, private.subscriptions.subscription_code),
    currency = excluded.currency, amount = excluded.amount, status = 'active',
    plus_until = greatest(now(), private.subscriptions.plus_until) + make_interval(months => months), updated_at = now();
  update private.orders set status = case when res = 'ok' then 'paid' else 'needs_review' end, provider_ref = p_provider_ref, customer_code = p_customer_code, paid_at = now() where reference = p_reference;
  return res;
end $$;

create function public.billing_record_renewal(p_customer_code text, p_subscription_code text, p_key text) returns text
language plpgsql security definer set search_path = '' as $$
declare s private.subscriptions; months int := private.cfg('plus_months_per_payment', 1); n int;
begin
  if exists (select 1 from private.payment_events where key = p_key) then return 'duplicate'; end if;
  select * into s from private.subscriptions where (p_subscription_code is not null and subscription_code = p_subscription_code) or (p_customer_code is not null and customer_code = p_customer_code) limit 1;
  if not found then return 'unknown'; end if;
  insert into private.payment_events (key) values (p_key) on conflict do nothing;
  update private.subscriptions set plus_until = greatest(now(), plus_until) + make_interval(months => months), status = 'active', updated_at = now() where identity_id = s.identity_id;
  return 'ok';
end $$;

create function public.billing_set_subscription(p_customer_code text, p_subscription_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update private.subscriptions set subscription_code = p_subscription_code, updated_at = now() where customer_code = p_customer_code;
  if not found then insert into private.pending_subscription_codes (customer_code, subscription_code) values (p_customer_code, p_subscription_code) on conflict (customer_code) do update set subscription_code = excluded.subscription_code; end if;
end $$;

create function public.billing_subscription_ended(p_subscription_code text, p_status text) returns void language sql security definer set search_path = '' as $$
  update private.subscriptions set status = case when p_status = 'past_due' then 'past_due' else 'cancelled' end, updated_at = now() where subscription_code = p_subscription_code $$;
create function public.billing_get_subscription_code(p_identity uuid) returns text language sql stable security definer set search_path = '' as $$
  select subscription_code from private.subscriptions where identity_id = p_identity and status = 'active' $$;

-- ---------- called by the signed-in person ----------
create function public.my_entitlements() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v uuid := private.require_identity(false); s private.subscriptions; a private.aliases; plus boolean;
begin
  select * into s from private.subscriptions where identity_id = v; select * into a from private.aliases where identity_id = v;
  plus := coalesce(s.plus_until > now(), false);
  return jsonb_build_object('plus', plus, 'plus_until', s.plus_until, 'auto_renews', coalesce(s.status = 'active' and s.subscription_code is not null, false),
    'alias', case when a.revoked_at is null then a.alias end, 'alias_revoked', a.revoked_at is not null, 'speak_as_alias', coalesce(a.use_by_default, false),
    'can_claim_alias', a.identity_id is null,
    'ai_daily_limit', case when plus then private.cfg('ai_plus_daily_limit', 100) else private.cfg('ai_free_daily_limit', 20) end);
end $$;

create function public.set_alias_default(p_on boolean) returns void language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  update private.aliases set use_by_default = p_on where identity_id = v and revoked_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
end $$;

create function public.get_public_alias(p_alias text) returns table (alias text, claimed_at timestamptz, post_count int, posts jsonb)
language sql stable security definer set search_path = '' as $$
  with a as (select * from private.aliases where alias_norm = lower(btrim(p_alias)) and revoked_at is null),
  p as (select p.id, left(p.body, 200) body, p.created_at from private.posts p join private.identity_contexts c on c.id = p.context_id, a
        where c.public_name = '@' || a.alias and p.identity_id = a.identity_id and p.status = 'active' and p.moderation_state = 'allow' and p.allow_sharing and (p.expires_at is null or p.expires_at > now()))
  select a.alias, a.claimed_at, (select count(*)::int from p), coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'body', x.body, 'created_at', x.created_at) order by x.created_at desc) from (select * from p order by created_at desc limit 20) x), '[]'::jsonb) from a $$;

create function public.admin_revoke_alias(p_identity uuid, p_reason text) returns void language plpgsql security definer set search_path = '' as $$
declare r text := private.require_admin(array['super_admin','safety_moderator']); why text := private.need_reason(p_reason);
begin
  update private.aliases set revoked_at = now(), use_by_default = false where identity_id = p_identity and revoked_at is null;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.audit(r, 'revoke_alias', 'identity', p_identity::text, why);
end $$;

-- Plus raises the AI allowance.
create or replace function public.ai_begin_turn(p_identity uuid, p_session uuid, p_mode text)
returns table (allowed boolean, reason text, session_id uuid, remaining int, daily_limit int)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare lim int := case when private.plus_active(p_identity) then private.cfg('ai_plus_daily_limit', 100) else private.cfg('ai_free_daily_limit', 20) end;
  burst int := private.cfg('ai_burst_per_minute', 6); used int; sid uuid := p_session;
begin
  if p_mode not in ('talk','vent','think','journal','perspective','calm') then raise exception 'invalid_mode' using errcode = '22023'; end if;
  if sid is not null and not exists (select 1 from private.ai_sessions where id = sid and identity_id = p_identity) then
    return query select false, 'not_found'::text, sid, 0, lim; return; end if;
  if (select count(*) from private.ai_messages m join private.ai_sessions s on s.id = m.session_id where s.identity_id = p_identity and m.role = 'user' and m.created_at > now() - interval '1 minute') >= burst then
    return query select false, 'slow_down'::text, sid, greatest(lim - coalesce((select messages from private.ai_usage where identity_id = p_identity and day = current_date), 0), 0), lim; return; end if;
  if lim <= 0 then return query select false, 'quota_exceeded'::text, sid, 0, lim; return; end if;
  insert into private.ai_usage (identity_id, day, messages) values (p_identity, current_date, 1)
  on conflict (identity_id, day) do update set messages = private.ai_usage.messages + 1 where private.ai_usage.messages < lim returning messages into used;
  if used is null then return query select false, 'quota_exceeded'::text, sid, 0, lim; return; end if;
  if sid is null then insert into private.ai_sessions (identity_id, mode) values (p_identity, p_mode) returning id into sid;
  else update private.ai_sessions set mode = p_mode where id = sid; end if;
  return query select true, 'ok'::text, sid, lim - used, lim;
end $$;
create or replace function public.ai_usage_today(p_identity uuid) returns table (used int, daily_limit int) language sql stable security definer set search_path = '' as $$
  select coalesce((select messages from private.ai_usage where identity_id = p_identity and day = current_date), 0),
         case when private.plus_active(p_identity) then private.cfg('ai_plus_daily_limit', 100) else private.cfg('ai_free_daily_limit', 20) end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and (p.proname like 'billing\_%' or p.proname in ('check_alias','my_entitlements','set_alias_default','get_public_alias','admin_revoke_alias')) loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname like 'billing\_%' then execute format('grant execute on function %s to service_role', f.sig);
    elsif f.proname = 'get_public_alias' then execute format('grant execute on function %s to anon, authenticated', f.sig);
    else execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop; end $$;
