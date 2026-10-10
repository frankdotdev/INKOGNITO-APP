-- Private "resonance" (karma) and streaks. Nobody else ever sees either. They exist to reward real participation,
-- feed the internal trust level, and are built to resist farming: no self-awards, one award per person per item,
-- daily caps per giver and per receiver, and nothing from banned or high-risk identities.
-- A streak counts only meaningful participation (a post, comment, Echo or Whisper), never merely opening the app.
create table private.karma (identity_id uuid primary key references private.identities(id) on delete cascade, points int not null default 0);
create table private.karma_events (
  id uuid primary key default gen_random_uuid(), identity_id uuid not null references private.identities(id) on delete cascade,
  actor_identity_id uuid not null references private.identities(id) on delete cascade, source_type text not null check (source_type in ('reaction','comment','echo')),
  source_id text not null, points int not null check (points > 0), created_at timestamptz not null default now()
);
create unique index on private.karma_events (source_type, source_id, actor_identity_id);
create index on private.karma_events (identity_id, created_at desc);
create index on private.karma_events (actor_identity_id, identity_id, created_at desc);
create table private.streaks (
  identity_id uuid primary key references private.identities(id) on delete cascade,
  current_streak int not null default 0, longest_streak int not null default 0, last_activity_date date, show_streak boolean not null default true
);
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'private' loop
    execute format('alter table private.%I enable row level security', t.tablename);
    execute format('alter table private.%I force row level security', t.tablename);
  end loop; end $$;

create function private.award_karma(p_to uuid, p_actor uuid, p_type text, p_source text, p_points int) returns void
language plpgsql security definer set search_path = '' as $$
declare given_today int; got_today int; pts int; lvl int;
begin
  if p_to = p_actor then return; end if;
  if exists (select 1 from private.identities where id = p_actor and (status in ('banned','suspended') or risk_level in ('high','banned'))) then return; end if;
  if exists (select 1 from private.identities where id = p_to and status in ('banned','purged')) then return; end if;
  select coalesce(sum(points), 0) into given_today from private.karma_events where actor_identity_id = p_actor and identity_id = p_to and created_at > now() - interval '1 day';
  select coalesce(sum(points), 0) into got_today from private.karma_events where identity_id = p_to and created_at > now() - interval '1 day';
  if given_today + p_points > 5 or got_today + p_points > 50 then return; end if;
  insert into private.karma_events (identity_id, actor_identity_id, source_type, source_id, points) values (p_to, p_actor, p_type, p_source, p_points) on conflict do nothing;
  if not found then return; end if;
  insert into private.karma (identity_id, points) values (p_to, p_points) on conflict (identity_id) do update set points = private.karma.points + p_points returning points into pts;
  lvl := case when pts >= 300 then 3 when pts >= 100 then 2 when pts >= 20 then 1 else 0 end;
  update private.identities set trust_level = greatest(trust_level, lvl) where id = p_to;
end $$;

create function private.touch_streak(p_identity uuid) returns void language plpgsql security definer set search_path = '' as $$
declare s private.streaks;
begin
  insert into private.streaks (identity_id, current_streak, longest_streak, last_activity_date) values (p_identity, 1, 1, current_date) on conflict (identity_id) do nothing;
  if found then return; end if;
  select * into s from private.streaks where identity_id = p_identity for update;
  if s.last_activity_date = current_date then return; end if;
  update private.streaks set current_streak = case when s.last_activity_date = current_date - 1 then s.current_streak + 1 else 1 end,
    longest_streak = greatest(s.longest_streak, case when s.last_activity_date = current_date - 1 then s.current_streak + 1 else 1 end), last_activity_date = current_date where identity_id = p_identity;
end $$;

create function private.trg_reaction() returns trigger language plpgsql security definer set search_path = '' as $$
declare author uuid;
begin
  if new.target_type = 'post' then select identity_id into author from private.posts where id = new.target_id;
  else select identity_id into author from private.comments where id = new.target_id; end if;
  if author is not null then perform private.award_karma(author, new.identity_id, 'reaction', new.target_type || ':' || new.target_id || ':' || new.kind, 1); end if;
  return new;
end $$;
create function private.trg_comment() returns trigger language plpgsql security definer set search_path = '' as $$
declare author uuid;
begin
  select identity_id into author from private.posts where id = new.post_id;
  if author is not null then perform private.award_karma(author, new.identity_id, 'comment', new.id::text, 2); end if;
  perform private.touch_streak(new.identity_id); return new;
end $$;
create function private.trg_echo() returns trigger language plpgsql security definer set search_path = '' as $$
declare author uuid;
begin
  select identity_id into author from private.posts where id = new.original_post_id;
  if author is not null then perform private.award_karma(author, new.identity_id, 'echo', new.id::text, 3); end if;
  perform private.touch_streak(new.identity_id); return new;
end $$;
create function private.trg_post() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform private.touch_streak(new.identity_id); return new; end $$;
create function private.trg_whisper() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform private.touch_streak(new.sender_identity_id); return new; end $$;
create trigger karma_reaction after insert on private.reactions for each row execute function private.trg_reaction();
create trigger karma_comment after insert on private.comments for each row execute function private.trg_comment();
create trigger karma_echo after insert on private.echoes for each row execute function private.trg_echo();
create trigger streak_post after insert on private.posts for each row execute function private.trg_post();
create trigger streak_whisper after insert on private.whispers for each row execute function private.trg_whisper();

-- Only ever returns the caller's own numbers. A streak that has already lapsed shows as 0.
create function public.my_standing() returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v uuid := private.require_identity(false); s private.streaks; pts int; shown int;
begin
  select * into s from private.streaks where identity_id = v; select coalesce(points, 0) into pts from private.karma where identity_id = v; pts := coalesce(pts, 0);
  shown := case when s.last_activity_date is not null and s.last_activity_date >= current_date - 1 then s.current_streak else 0 end;
  return jsonb_build_object('streak', shown, 'longest_streak', coalesce(s.longest_streak, 0), 'show_streak', coalesce(s.show_streak, true), 'resonance', pts,
    'level', case when pts >= 300 then 3 when pts >= 100 then 2 when pts >= 20 then 1 else 0 end);
end $$;
create function public.set_show_streak(p_on boolean) returns void language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin insert into private.streaks (identity_id, show_streak) values (v, p_on) on conflict (identity_id) do update set show_streak = p_on; end $$;

create or replace function public.delete_identity() returns void
language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  perform public.delete_my_content();
  delete from private.ai_sessions where identity_id = v; delete from private.ai_usage where identity_id = v;
  delete from private.dm_messages where sender_identity_id = v; delete from private.conversation_participants where identity_id = v;
  delete from private.conversations c where not exists (select 1 from private.conversation_participants p where p.conversation_id = c.id);
  delete from private.karma_events where identity_id = v or actor_identity_id = v; delete from private.karma where identity_id = v; delete from private.streaks where identity_id = v;
  delete from private.identity_sessions where identity_id = v; delete from private.devices where identity_id = v; delete from private.recovery where identity_id = v; delete from private.blocks where blocker_identity_id = v;
  update private.identities set status = 'purged', purged_at = now() where id = v;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('my_standing','set_show_streak') loop
    execute format('revoke all on function %s from public, anon', f.sig); execute format('grant execute on function %s to authenticated', f.sig);
  end loop; end $$;
