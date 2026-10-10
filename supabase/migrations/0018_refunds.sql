-- Refunds. A finance admin starts one from the admin app; the billing Worker asks Paystack to refund; when Paystack confirms,
-- what that payment bought (the name and the Plus month) is taken back. Every step is audited.
-- Policy (change it here if you want a different one): refunds are allowed within 30 days (platform_config refund_window_days);
-- a refund removes the name and the Plus time that payment bought and stops renewals.
alter table private.orders drop constraint orders_status_check;
alter table private.orders add constraint orders_status_check check (status in ('pending','paid','needs_review','resolved','refund_pending','refunded'));
alter table private.orders add column refund_reason text, add column refund_requested_by uuid, add column refund_ref text, add column refunded_at timestamptz;

create function public.billing_begin_refund(p_reference text, p_admin uuid, p_reason text) returns table (reference text, amount int, currency text, identity_id uuid)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare o private.orders; a private.admins; why text := btrim(coalesce(p_reason, ''));
begin
  select * into a from private.admins where auth_user_id = p_admin and disabled_at is null and role in ('super_admin','finance');
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  if char_length(why) < 5 then raise exception 'reason_required' using errcode = '22023'; end if;
  select * into o from private.orders where reference = p_reference for update;
  if not found or o.status <> 'paid' or o.paid_at is null or o.paid_at < now() - make_interval(days => private.cfg('refund_window_days', 30)) then raise exception 'not_refundable' using errcode = 'P0002'; end if;
  update private.orders set status = 'refund_pending', refund_reason = why, refund_requested_by = p_admin where reference = p_reference;
  insert into private.audit_log (admin_user_id, admin_role, action, target_type, target_id, reason, metadata) values (p_admin, a.role, 'start_refund', 'order', p_reference, why, jsonb_build_object('amount', o.amount, 'currency', o.currency));
  return query select o.reference, o.amount, o.currency, o.identity_id;
end $$;

create function public.billing_finish_refund(p_reference text, p_ok boolean, p_refund_ref text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare o private.orders; months int := private.cfg('plus_months_per_payment', 1);
begin
  select * into o from private.orders where reference = p_reference for update;
  if not found or o.status <> 'refund_pending' then return 'ignored'; end if;
  if not p_ok then
    update private.orders set status = 'paid' where reference = p_reference;
    insert into private.audit_log (admin_user_id, admin_role, action, target_type, target_id, reason) values (o.refund_requested_by, 'finance', 'refund_failed', 'order', p_reference, p_refund_ref);
    return 'failed';
  end if;
  update private.orders set status = 'refunded', refund_ref = p_refund_ref, refunded_at = now() where reference = p_reference;
  update private.aliases set revoked_at = coalesce(revoked_at, now()), use_by_default = false where identity_id = o.identity_id and order_reference = p_reference;
  update private.subscriptions set plus_until = greatest(now(), plus_until - make_interval(months => months)), status = 'cancelled', updated_at = now() where identity_id = o.identity_id;
  insert into private.audit_log (admin_user_id, admin_role, action, target_type, target_id, reason) values (o.refund_requested_by, 'finance', 'refund_completed', 'order', p_reference, o.refund_reason);
  return 'refunded';
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('billing_begin_refund','billing_finish_refund') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig); execute format('grant execute on function %s to service_role', f.sig);
  end loop; end $$;
