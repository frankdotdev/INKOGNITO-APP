-- Finance tooling: orders that need a person (amount mismatch, a name taken at the moment of payment),
-- and operating metrics for billing and the AI companion.
alter table private.orders drop constraint orders_status_check;
alter table private.orders add constraint orders_status_check check (status in ('pending','paid','needs_review','resolved'));
alter table private.orders add column resolved_note text, add column resolved_at timestamptz;

create function public.admin_list_orders(p_status text default 'needs_review', p_limit int default 50, p_offset int default 0)
returns table (reference text, identity_id uuid, alias text, currency text, amount int, status text, provider_ref text, created_at timestamptz, paid_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare r text := private.require_admin(array['super_admin','finance']);
begin
  return query select o.reference, o.identity_id, o.alias, o.currency, o.amount, o.status, o.provider_ref, o.created_at, o.paid_at
  from private.orders o where o.status = p_status order by o.created_at desc limit least(greatest(p_limit,1),100) offset greatest(p_offset,0);
end $$;

-- Refunds are made in the Paystack dashboard; this records that a person dealt with the order.
create function public.admin_resolve_order(p_reference text, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
declare r text := private.require_admin(array['super_admin','finance']); why text := private.need_reason(p_note);
begin
  update private.orders set status = 'resolved', resolved_note = why, resolved_at = now() where reference = p_reference and status = 'needs_review';
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  perform private.audit(r, 'resolve_order', 'order', p_reference, why);
end $$;

create or replace function public.admin_metrics() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r text := private.require_admin(array['super_admin','moderator','safety_moderator','support','analytics','finance']); d timestamptz := date_trunc('day', now());
begin
  return jsonb_build_object(
    'generated_at', now(),
    'dau', (select count(*) from private.identities where status <> 'purged' and last_seen_at > now() - interval '1 day'),
    'wau', (select count(*) from private.identities where status <> 'purged' and last_seen_at > now() - interval '7 days'),
    'mau', (select count(*) from private.identities where status <> 'purged' and last_seen_at > now() - interval '30 days'),
    'new_identities_today', (select count(*) from private.identities where created_at >= d),
    'posts_today', (select count(*) from private.posts where created_at >= d),
    'comments_today', (select count(*) from private.comments where created_at >= d),
    'echoes_today', (select count(*) from private.echoes where created_at >= d),
    'whispers_today', (select count(*) from private.whispers where created_at >= d),
    'random_sessions_today', (select count(*) from private.random_sessions where created_at >= d),
    'reports_open', (select count(*) from private.reports where status = 'open'),
    'random_reports_open', (select count(*) from private.random_reports where status = 'open'),
    'restricted_identities', (select count(*) from private.identities where status in ('restricted','suspended','banned')),
    'media_objects', (select count(*) from private.post_media),
    'plus_active', (select count(*) from private.subscriptions where plus_until > now()),
    'aliases_claimed', (select count(*) from private.aliases where revoked_at is null),
    'orders_needing_review', (select count(*) from private.orders where status = 'needs_review'),
    'ai_messages_today', (select coalesce(sum(messages), 0) from private.ai_usage where day = current_date),
    'ai_tokens_today', (select coalesce(sum(input_tokens + output_tokens), 0) from private.ai_usage where day = current_date),
    'ai_safety_events_today', (select count(*) from private.ai_safety_events where created_at >= d),
    'database_bytes', pg_database_size(current_database()));
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('admin_list_orders','admin_resolve_order') loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop; end $$;
