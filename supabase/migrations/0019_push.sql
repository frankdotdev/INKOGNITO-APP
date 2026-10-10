-- Web push notifications. Deliberately limited: replies, Whispers and private messages (and, if switched on, Echoes).
-- Payloads never contain what anyone wrote; there are no "come back" reminders. A device's push address is private data.
create table private.push_subscriptions (
  id uuid primary key default gen_random_uuid(), identity_id uuid not null references private.identities(id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 20 and 2000), p256dh text not null, auth text not null,
  created_at timestamptz not null default now(), last_ok_at timestamptz
);
create index on private.push_subscriptions (identity_id);
create table private.notification_prefs (
  identity_id uuid primary key references private.identities(id) on delete cascade,
  replies boolean not null default true, whispers boolean not null default true, messages boolean not null default true, activity boolean not null default false
);
create table private.notifications (
  id bigint generated always as identity primary key, identity_id uuid not null references private.identities(id) on delete cascade,
  kind text not null check (kind in ('reply','whisper','message','echo')), ref_id text not null,
  created_at timestamptz not null default now(), sent_at timestamptz, attempts int not null default 0
);
create index on private.notifications (id) where sent_at is null;
create index on private.notifications (identity_id, kind, ref_id, created_at desc);
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'private' loop
    execute format('alter table private.%I enable row level security', t.tablename);
    execute format('alter table private.%I force row level security', t.tablename);
  end loop; end $$;

-- One notification per person, kind and item per 10 minutes. Nothing is queued for people with no subscribed device or who switched the kind off.
create function private.enqueue_notification(p_to uuid, p_from uuid, p_kind text, p_ref text) returns void language plpgsql security definer set search_path = '' as $$
declare allowed boolean;
begin
  if p_to is null or p_to = p_from then return; end if;
  if not exists (select 1 from private.push_subscriptions where identity_id = p_to) then return; end if;
  if p_from is not null and public.random_blocked(p_to, p_from) then return; end if;
  select case p_kind when 'reply' then coalesce(replies, true) when 'whisper' then coalesce(whispers, true) when 'message' then coalesce(messages, true) else coalesce(activity, false) end into allowed
    from (select 1) x left join private.notification_prefs np on np.identity_id = p_to;
  if not coalesce(allowed, false) then return; end if;
  if exists (select 1 from private.notifications where identity_id = p_to and kind = p_kind and ref_id = p_ref and created_at > now() - interval '10 minutes') then return; end if;
  insert into private.notifications (identity_id, kind, ref_id) values (p_to, p_kind, p_ref);
end $$;
create function private.trg_notify_comment() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform private.enqueue_notification((select identity_id from private.posts where id = new.post_id), new.identity_id, 'reply', new.post_id::text); return new; end $$;
create function private.trg_notify_whisper() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform private.enqueue_notification(new.recipient_identity_id, new.sender_identity_id, 'whisper', new.id::text); return new; end $$;
create function private.trg_notify_message() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform private.enqueue_notification(private.dm_peer(new.sender_identity_id, new.conversation_id), new.sender_identity_id, 'message', new.conversation_id::text); return new; end $$;
create function private.trg_notify_echo() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform private.enqueue_notification((select identity_id from private.posts where id = new.original_post_id), new.identity_id, 'echo', new.original_post_id::text); return new; end $$;
create trigger notify_comment after insert on private.comments for each row execute function private.trg_notify_comment();
create trigger notify_whisper after insert on private.whispers for each row execute function private.trg_notify_whisper();
create trigger notify_message after insert on private.dm_messages for each row execute function private.trg_notify_message();
create trigger notify_echo after insert on private.echoes for each row execute function private.trg_notify_echo();
create function private.trg_purge_push() returns trigger language plpgsql security definer set search_path = '' as $$
begin delete from private.push_subscriptions where identity_id = new.id; delete from private.notifications where identity_id = new.id; return new; end $$;
create trigger purge_push after update of status on private.identities for each row when (new.status = 'purged') execute function private.trg_purge_push();

-- ---------- the signed-in person ----------
create function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text) returns void language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  if p_endpoint !~ '^https://' or char_length(coalesce(p_p256dh, '')) not between 40 and 200 or char_length(coalesce(p_auth, '')) not between 10 and 100 then raise exception 'invalid' using errcode = '22023'; end if;
  if (select count(*) from private.push_subscriptions where identity_id = v and endpoint <> p_endpoint) >= 10 then raise exception 'too_many_devices' using errcode = '22023'; end if;
  insert into private.push_subscriptions (identity_id, endpoint, p256dh, auth) values (v, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set identity_id = v, p256dh = excluded.p256dh, auth = excluded.auth;
end $$;
create function public.push_unsubscribe(p_endpoint text) returns void language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin delete from private.push_subscriptions where identity_id = v and endpoint = p_endpoint; end $$;
create function public.get_notification_prefs() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v uuid := private.require_identity(false); p private.notification_prefs;
begin select * into p from private.notification_prefs where identity_id = v;
  return jsonb_build_object('replies', coalesce(p.replies, true), 'whispers', coalesce(p.whispers, true), 'messages', coalesce(p.messages, true), 'activity', coalesce(p.activity, false));
end $$;
create function public.set_notification_prefs(p_replies boolean, p_whispers boolean, p_messages boolean, p_activity boolean) returns void language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin insert into private.notification_prefs (identity_id, replies, whispers, messages, activity) values (v, p_replies, p_whispers, p_messages, p_activity)
  on conflict (identity_id) do update set replies = excluded.replies, whispers = excluded.whispers, messages = excluded.messages, activity = excluded.activity; end $$;

-- ---------- the push Worker (service_role) ----------
create function public.push_take_batch(p_limit int default 50) returns table (id bigint, kind text, ref_id text, endpoint text, p256dh text, auth text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  return query
  with picked as (select n.id from private.notifications n join private.identities i on i.id = n.identity_id
                  where n.sent_at is null and n.attempts < 3 and n.created_at > now() - interval '1 day' and i.status = 'active' order by n.id limit least(greatest(p_limit,1),200) for update of n skip locked),
  claimed as (update private.notifications n set attempts = n.attempts + 1 from picked where n.id = picked.id returning n.id, n.identity_id, n.kind, n.ref_id)
  select c.id, c.kind, c.ref_id, s.endpoint, s.p256dh, s.auth from claimed c join private.push_subscriptions s on s.identity_id = c.identity_id;
end $$;
create function public.push_mark_sent(p_ids bigint[]) returns void language sql security definer set search_path = '' as $$
  update private.notifications set sent_at = now() where id = any(p_ids) $$;
create function public.push_drop_subscription(p_endpoint text) returns void language sql security definer set search_path = '' as $$
  delete from private.push_subscriptions where endpoint = p_endpoint $$;
create function public.push_prune() returns void language sql security definer set search_path = '' as $$
  delete from private.notifications where created_at < now() - interval '2 days' $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('push_subscribe','push_unsubscribe','get_notification_prefs','set_notification_prefs','push_take_batch','push_mark_sent','push_drop_subscription','push_prune') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname like 'push\_take%' or f.proname in ('push_mark_sent','push_drop_subscription','push_prune') then execute format('grant execute on function %s to service_role', f.sig); else execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop; end $$;
