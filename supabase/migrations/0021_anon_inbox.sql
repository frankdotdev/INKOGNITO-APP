-- Migration 0021: Anonymous Inbox (Anon Link) feature (IDEMPOTENT)
-- Allows users to create a named "inbox" and share a link so others can leave anonymous confessions.
-- Three visibility modes:
--   'private'  → only the inbox owner can read replies (classic anonymous Q&A)
--   'link'     → anyone with the link can read all replies
--   'public'   → all Inkognito users can see the inbox and its replies in Discover

-- ─── tables ──────────────────────────────────────────────────────────────────

create table if not exists private.anon_inboxes (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references private.identities(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  prompt        text,                              -- optional prompt shown to visitors
  visibility    text not null default 'private'
                  check (visibility in ('private','link','public')),
  slug          text unique,                       -- short random URL slug e.g. /anon/abc123
  created_at    timestamptz not null default now(),
  closed_at     timestamptz                        -- when set, no new messages accepted
);

create table if not exists private.anon_messages (
  id            uuid primary key default gen_random_uuid(),
  inbox_id      uuid not null references private.anon_inboxes(id) on delete cascade,
  sender_id     uuid references private.identities(id) on delete set null,  -- null = unauthenticated sender
  public_name   text not null,                     -- random name assigned per sender per inbox
  body          text not null check (char_length(body) between 1 and 2000),
  created_at    timestamptz not null default now(),
  status        text not null default 'active' check (status in ('active','removed'))
);

create index if not exists anon_inboxes_owner_idx on private.anon_inboxes(owner_id);
create index if not exists anon_messages_inbox_idx on private.anon_messages(inbox_id, status, created_at desc);

-- RLS
alter table private.anon_inboxes enable row level security;
alter table private.anon_inboxes force row level security;
alter table private.anon_messages enable row level security;
alter table private.anon_messages force row level security;

-- ─── slug generator ───────────────────────────────────────────────────────────

create or replace function private.random_slug() returns text language sql as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
$$;

-- ─── name pool (massively expanded — ~1 billion+ unique pairs) ────────────────
-- These also replace the old 16-word adj/noun in ensure_context
-- We store them in a single table for easy updates without re-migrations

create table if not exists private.name_parts (
  id      smallserial primary key,
  kind    text not null check (kind in ('adj','noun')),
  word    text not null unique
);

insert into private.name_parts (kind, word) values
-- ADJECTIVES
-- Moods/atmosphere
('adj','Quiet'),('adj','Hollow'),('adj','Distant'),('adj','Lost'),('adj','Faded'),('adj','Restless'),
('adj','Burning'),('adj','Frozen'),('adj','Drifting'),('adj','Haunted'),('adj','Trembling'),('adj','Numb'),
('adj','Broken'),('adj','Mended'),('adj','Veiled'),('adj','Hidden'),('adj','Wandering'),('adj','Scattered'),
('adj','Fleeting'),('adj','Lingering'),('adj','Fractured'),('adj','Woven'),('adj','Unraveled'),
-- Colors/beauty
('adj','Silver'),('adj','Golden'),('adj','Crimson'),('adj','Violet'),('adj','Amber'),('adj','Ivory'),
('adj','Obsidian'),('adj','Scarlet'),('adj','Azure'),('adj','Indigo'),('adj','Teal'),('adj','Jade'),
('adj','Cobalt'),('adj','Alabaster'),('adj','Onyx'),('adj','Sable'),('adj','Russet'),('adj','Vermilion'),
('adj','Copper'),('adj','Cerulean'),('adj','Umber'),('adj','Ochre'),('adj','Magenta'),
-- Nature/texture
('adj','Velvet'),('adj','Mist'),('adj','Frost'),('adj','Thorned'),('adj','Wild'),('adj','Still'),
('adj','Stormy'),('adj','Ashen'),('adj','Pale'),('adj','Dark'),('adj','Deep'),('adj','Vast'),
('adj','Ancient'),('adj','Young'),('adj','Eternal'),('adj','Mortal'),('adj','Celestial'),('adj','Lunar'),
('adj','Solar'),('adj','Stellar'),('adj','Cosmic'),('adj','Tidal'),('adj','Glacial'),('adj','Volcanic'),
('adj','Primordial'),('adj','Sacred'),('adj','Cursed'),('adj','Blessed'),('adj','Wounded'),
-- Myth/power
('adj','Fallen'),('adj','Rising'),('adj','Exiled'),('adj','Chosen'),('adj','Forgotten'),('adj','Reborn'),
('adj','Unseen'),('adj','Unheard'),('adj','Unnamed'),('adj','Unbound'),('adj','Relentless'),
('adj','Sovereign'),('adj','Errant'),('adj','Defiant'),('adj','Luminous'),
('adj','Radiant'),('adj','Shadowed'),('adj','Cloaked'),('adj','Masked'),
-- Poetic
('adj','Paper'),('adj','Glass'),('adj','Iron'),('adj','Marble'),('adj','Stone'),('adj','Bone'),
('adj','Silk'),('adj','Ash'),('adj','Ember'),('adj','Smoke'),('adj','Sand'),('adj','Salt'),
('adj','Ruined'),('adj','Severed'),('adj','Torn'),
('adj','Bitter'),('adj','Sweet'),('adj','Heavy'),('adj','Light'),('adj','Soft'),('adj','Sharp'),
('adj','True'),('adj','False'),('adj','Real'),('adj','Dream'),('adj','Midnight'),('adj','Dawn'),
('adj','Twilight'),('adj','Sunken'),('adj','Soaring'),('adj','Sinking'),('adj','Floating'),

-- NOUNS — mythology, ancient names, creatures, places, real old names, concepts
-- Greek mythology
('noun','Orion'),('noun','Lyra'),('noun','Cassidy'),('noun','Selene'),('noun','Helios'),('noun','Eos'),
('noun','Nyx'),('noun','Erebus'),('noun','Hypnos'),('noun','Morpheus'),('noun','Thanatos'),
('noun','Charon'),('noun','Hermes'),('noun','Atlas'),('noun','Prometheus'),('noun','Icarus'),
('noun','Daedalus'),('noun','Ariadne'),('noun','Penelope'),('noun','Calypso'),('noun','Circe'),
('noun','Medea'),('noun','Orpheus'),('noun','Eurydice'),('noun','Persephone'),('noun','Demeter'),
('noun','Hecate'),('noun','Iris'),('noun','Nemesis'),('noun','Tyche'),('noun','Ananke'),
('noun','Aether'),('noun','Chaos'),('noun','Gaia'),('noun','Tartarus'),('noun','Elysium'),
-- Norse mythology
('noun','Odin'),('noun','Freya'),('noun','Loki'),('noun','Sigrid'),('noun','Astrid'),('noun','Bjorn'),
('noun','Valkyrie'),('noun','Ymir'),('noun','Fenrir'),('noun','Jormun'),('noun','Baldur'),
('noun','Tyr'),('noun','Skadi'),('noun','Njorun'),('noun','Brynhildr'),('noun','Gudrun'),
-- Egyptian mythology
('noun','Osiris'),('noun','Anubis'),('noun','Thoth'),('noun','Horus'),('noun','Isis'),('noun','Bastet'),
('noun','Sekhmet'),('noun','Nephthys'),('noun','Sobek'),('noun','Khnum'),('noun','Amon'),
('noun','Hathor'),('noun','Maat'),('noun','Nut'),('noun','Geb'),('noun','Shu'),
-- Mesopotamian/Sumerian
('noun','Enki'),('noun','Enlil'),('noun','Inanna'),('noun','Nanna'),('noun','Ishtar'),('noun','Marduk'),
('noun','Nergal'),('noun','Ereshkigal'),('noun','Dumuzi'),('noun','Shamash'),('noun','Adad'),
-- Celtic
('noun','Morrigan'),('noun','Cernunnos'),('noun','Brigid'),('noun','Lugh'),('noun','Dagda'),
('noun','Danu'),('noun','Nuada'),('noun','Arawn'),('noun','Rhiannon'),('noun','Ceridwen'),
('noun','Taliesin'),('noun','Merlin'),('noun','Nimue'),('noun','Morgana'),
-- Slavic mythology  
('noun','Veles'),('noun','Perun'),('noun','Mokosh'),('noun','Marzanna'),('noun','Jarilo'),
('noun','Zorya'),('noun','Kikimora'),('noun','Rusalka'),('noun','Domovoi'),
-- Nature entities
('noun','Aurora'),('noun','Solstice'),('noun','Equinox'),('noun','Zenith'),('noun','Nadir'),
('noun','Vortex'),('noun','Nebula'),('noun','Quasar'),('noun','Pulsar'),('noun','Comet'),
('noun','Meteor'),('noun','Eclipse'),('noun','Solaris'),('noun','Aphelion'),
-- Ancient real names
('noun','Zephyr'),('noun','Caspian'),('noun','Lysander'),('noun','Evander'),('noun','Leander'),
('noun','Theron'),('noun','Doran'),('noun','Calix'),('noun','Soren'),('noun','Leif'),
('noun','Rowan'),('noun','Cael'),('noun','Emrys'),('noun','Idris'),('noun','Aldric'),
('noun','Elowen'),('noun','Isolde'),('noun','Elara'),('noun','Vesper'),('noun','Seraphina'),
('noun','Calista'),('noun','Thessaly'),('noun','Corvin'),('noun','Alaric'),('noun','Cato'),
('noun','Declan'),('noun','Evren'),('noun','Caius'),('noun','Kaelen'),('noun','Zara'),
-- Cool abstract nouns
('noun','Ghost'),('noun','Echo'),('noun','Shadow'),('noun','Ember'),('noun','Signal'),
('noun','Cipher'),('noun','Nexus'),('noun','Prism'),('noun','Relic'),('noun','Specter'),
('noun','Wraith'),('noun','Rift'),('noun','Reverie'),('noun','Requiem'),('noun','Elegy'),
('noun','Nocturne'),('noun','Ode'),('noun','Sonnet'),('noun','Ballad'),('noun','Dirge'),
('noun','Lament'),('noun','Hymn'),('noun','Anthem'),('noun','Psalm'),('noun','Verse'),
-- Places/natural wonders
('noun','Abyss'),('noun','Horizon'),('noun','Meridian'),('noun','Solitude'),('noun','Arcadia'),
('noun','Avalon'),('noun','Valhalla'),('noun','Olympus'),
('noun','Zion'),('noun','Eden'),('noun','Asgard'),('noun','Midgard'),('noun','Niflheim'),
-- Animals/creatures
('noun','Raven'),('noun','Wolf'),('noun','Crane'),('noun','Falcon'),('noun','Serpent'),
('noun','Phoenix'),('noun','Dragon'),('noun','Sphinx'),('noun','Griffin'),('noun','Leviathan'),
('noun','Kraken'),('noun','Selkie'),('noun','Kirin'),('noun','Tanuki'),('noun','Basilisk'),
('noun','Manticore'),('noun','Wyvern'),('noun','Cockatrice'),('noun','Chimera'),
-- Random cool mix
('noun','Lore'),('noun','Tide'),('noun','Storm'),('noun','Rain'),('noun','River'),('noun','Harbor'),
('noun','Lantern'),('noun','Compass'),('noun','Anchor'),('noun','Vessel'),
('noun','Pilgrim'),('noun','Wanderer'),('noun','Seeker'),('noun','Keeper'),('noun','Warden'),
('noun','Herald'),('noun','Envoy'),('noun','Oracle'),('noun','Seer'),('noun','Prophet'),
('noun','Scribe'),('noun','Sage'),('noun','Mystic'),('noun','Nomad'),('noun','Rogue'),
('noun','Paladin'),('noun','Sentinel'),('noun','Vanguard'),('noun','Arbiter'),('noun','Curator')
on conflict (word) do nothing;

-- ─── updated ensure_context using name_parts table ────────────────────────────

create or replace function private.ensure_context(p_identity uuid, p_type text, p_ref uuid)
returns private.identity_contexts
language plpgsql security definer set search_path = '' as $$
declare
  r     private.identity_contexts;
  salt  int := 0;
  h     bytea;
  n     text;
  adj_count int;
  noun_count int;
  adj_word text;
  noun_word text;
  a text;
begin
  select * into r from private.identity_contexts
    where identity_id = p_identity and context_type = p_type and context_ref = p_ref;
  if found then return r; end if;

  -- Use alias (Plus feature) if user has one set as default
  select '@' || alias into a from private.aliases
    where identity_id = p_identity and revoked_at is null and use_by_default;
  if a is not null then
    begin
      insert into private.identity_contexts (identity_id, context_type, context_ref, public_name, mark)
        values (p_identity, p_type, p_ref, a, get_byte(decode(md5(a), 'hex'), 0))
        returning * into r;
      return r;
    exception when unique_violation then
      select * into r from private.identity_contexts
        where identity_id = p_identity and context_type = p_type and context_ref = p_ref;
      if found then return r; end if;
    end;
  end if;

  select count(*) into adj_count  from private.name_parts where kind = 'adj';
  select count(*) into noun_count from private.name_parts where kind = 'noun';

  loop
    h := decode(md5(p_identity::text || p_ref::text || salt::text), 'hex');

    select word into adj_word  from private.name_parts where kind = 'adj'
      order by id offset (get_byte(h,0) + get_byte(h,2) * 256) % adj_count  limit 1;
    select word into noun_word from private.name_parts where kind = 'noun'
      order by id offset (get_byte(h,1) + get_byte(h,3) * 256) % noun_count limit 1;

    n := adj_word || ' ' || noun_word || case when salt >= 20 then ' ' || salt else '' end;

    begin
      insert into private.identity_contexts (identity_id, context_type, context_ref, public_name, mark)
        values (p_identity, p_type, p_ref, n, get_byte(h, 4))
        returning * into r;
      return r;
    exception when unique_violation then
      select * into r from private.identity_contexts
        where identity_id = p_identity and context_type = p_type and context_ref = p_ref;
      if found then return r; end if;
      salt := salt + 1;
    end;
  end loop;
end $$;

-- ─── anon inbox helper: assign a per-sender name in this inbox ────────────────

create or replace function private.anon_inbox_name(p_inbox uuid, p_identity uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  h         bytea;
  adj_count int; noun_count int;
  adj_word  text; noun_word  text;
  salt      int := 0;
  n         text;
begin
  -- Always same name for same sender in same inbox (deterministic)
  select count(*) into adj_count  from private.name_parts where kind = 'adj';
  select count(*) into noun_count from private.name_parts where kind = 'noun';
  loop
    h := decode(md5(p_inbox::text || coalesce(p_identity::text, 'anon') || salt::text), 'hex');
    select word into adj_word  from private.name_parts where kind = 'adj'
      order by id offset (get_byte(h,0) + get_byte(h,2)*256) % adj_count  limit 1;
    select word into noun_word from private.name_parts where kind = 'noun'
      order by id offset (get_byte(h,1) + get_byte(h,3)*256) % noun_count limit 1;
    n := adj_word || ' ' || noun_word;
    -- Avoid duplicate names in same inbox
    if not exists (
      select 1 from private.anon_messages
        where inbox_id = p_inbox and public_name = n
          and (p_identity is null or sender_id is distinct from p_identity)
    ) then
      return n;
    end if;
    salt := salt + 1;
    if salt > 100 then return n || ' ' || salt; end if;
  end loop;
end $$;

-- ─── public API ───────────────────────────────────────────────────────────────

-- Create an inbox
create or replace function public.create_anon_inbox(
  p_title      text,
  p_prompt     text default null,
  p_visibility text default 'private'
) returns table (id uuid, slug text)
language plpgsql security definer set search_path = '' as $$
declare
  v   uuid := private.require_identity(true);
  iid uuid;
  sl  text;
begin
  loop
    sl := private.random_slug();
    exit when not exists (select 1 from private.anon_inboxes where private.anon_inboxes.slug = sl);
  end loop;
  insert into private.anon_inboxes (owner_id, title, prompt, visibility, slug)
    values (v, p_title, p_prompt, p_visibility, sl)
    returning id into iid;
  return query select iid, sl;
end $$;

-- Update visibility of your own inbox
create or replace function public.update_anon_inbox(p_id uuid, p_visibility text)
returns void language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  update private.anon_inboxes
    set visibility = p_visibility
    where id = p_id and owner_id = v;
end $$;

-- Close (stop accepting messages) your own inbox
create or replace function public.close_anon_inbox(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  update private.anon_inboxes set closed_at = now()
    where id = p_id and owner_id = v;
end $$;

-- Get inbox metadata for share page (public, by slug — respects visibility)
create or replace function public.get_anon_inbox(p_slug text)
returns table (id uuid, title text, prompt text, visibility text, created_at timestamptz, closed boolean)
language sql stable security definer set search_path = '' as $$
  select id, title, prompt, visibility, created_at, closed_at is not null
    from private.anon_inboxes
    where slug = p_slug;
$$;

-- Send an anonymous message to an inbox
create or replace function public.send_anon_message(p_slug text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v    uuid;
  iid  uuid;
  nm   text;
  cl   timestamptz;
begin
  -- Identity is optional — unauthenticated users can still leave messages
  begin
    v := private.require_identity(false);
  exception when others then
    v := null;
  end;

  select id, closed_at into iid, cl from private.anon_inboxes where slug = p_slug;
  if iid is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  if cl is not null then raise exception 'inbox_closed' using errcode = '23514'; end if;

  nm := private.anon_inbox_name(iid, v);

  insert into private.anon_messages (inbox_id, sender_id, public_name, body)
    values (iid, v, nm, p_body);
end $$;

-- Get messages for an inbox
create or replace function public.get_anon_messages(p_slug text, p_limit int default 50, p_offset int default 0)
returns table (id uuid, public_name text, body text, created_at timestamptz, is_mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v    uuid;
  iid  uuid;
  vis  text;
  oid  uuid;
begin
  begin v := private.require_identity(false); exception when others then v := null; end;

  select i.id, i.visibility, i.owner_id into iid, vis, oid
    from private.anon_inboxes i where i.slug = p_slug;

  if iid is null then raise exception 'not_found' using errcode = 'P0002'; end if;

  -- Access check
  if oid is distinct from v then
    if vis = 'private' then raise exception 'forbidden' using errcode = '42501'; end if;
  end if;

  return query
    select m.id, m.public_name, m.body, m.created_at,
           (v is not null and m.sender_id = v)
      from private.anon_messages m
      where m.inbox_id = iid and m.status = 'active'
      order by m.created_at desc
      limit p_limit offset p_offset;
end $$;

-- Owner removes a single message
create or replace function public.remove_anon_message(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  update private.anon_messages m
    set status = 'removed'
    from private.anon_inboxes i
    where m.id = p_id and m.inbox_id = i.id and i.owner_id = v;
end $$;

-- List owner's inboxes (my inboxes page)
create or replace function public.my_anon_inboxes(p_limit int default 20, p_offset int default 0)
returns table (
  id uuid, title text, prompt text, visibility text,
  slug text, created_at timestamptz, closed boolean, message_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare v uuid := private.require_identity(false);
begin
  return query
    select i.id, i.title, i.prompt, i.visibility,
           i.slug, i.created_at, i.closed_at is not null,
           count(m.id)
      from private.anon_inboxes i
      left join private.anon_messages m on m.inbox_id = i.id and m.status = 'active'
      where i.owner_id = v
      group by i.id
      order by i.created_at desc
      limit p_limit offset p_offset;
end $$;

-- Public discover: list public inboxes
create or replace function public.get_public_inboxes(p_limit int default 30, p_offset int default 0)
returns table (id uuid, title text, prompt text, slug text, created_at timestamptz, message_count bigint)
language sql stable security definer set search_path = '' as $$
  select i.id, i.title, i.prompt, i.slug, i.created_at, count(m.id)
    from private.anon_inboxes i
    left join private.anon_messages m on m.inbox_id = i.id and m.status = 'active'
    where i.visibility = 'public' and i.closed_at is null
    group by i.id
    order by i.created_at desc
    limit p_limit offset p_offset;
$$;

grant execute on function public.create_anon_inbox to anon, authenticated;
grant execute on function public.update_anon_inbox to anon, authenticated;
grant execute on function public.close_anon_inbox to anon, authenticated;
grant execute on function public.get_anon_inbox to anon, authenticated;
grant execute on function public.send_anon_message to anon, authenticated;
grant execute on function public.get_anon_messages to anon, authenticated;
grant execute on function public.remove_anon_message to anon, authenticated;
grant execute on function public.my_anon_inboxes to anon, authenticated;
grant execute on function public.get_public_inboxes to anon, authenticated;

-- Immediately reload PostgREST schema cache
notify pgrst, 'reload schema';
