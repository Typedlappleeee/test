-- ═══════════════════════════════════════════════════════════════════════════
-- Talents — salons Telegram, annonces ingérées, décisions match/pass, favoris
-- ═══════════════════════════════════════════════════════════════════════════
-- À jouer dans le SQL editor Supabase. Idempotent : relançable sans casse.
--
-- Modèle : tout est scopé par organisation. Les annonces sont partagées dans
-- l'org (un seul worker les ingère pour tout le monde), les décisions sont
-- personnelles (chacun swipe pour soi) et la mise en favori remonte au niveau
-- de l'org — quand quelqu'un matche, l'annonce entre dans le pipeline commun.

-- ── Helper : appartenance à une org (SECURITY DEFINER, évite les RLS récursives)
create or replace function public.is_org_member(p_org_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.organization_members m
    where m.org_id = p_org_id and m.user_id = auth.uid()
  );
$$;

-- ── 1. Salons Telegram liés ──────────────────────────────────────────────────
create table if not exists public.talent_salons (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  tg_chat_id    text not null,                    -- id numérique Telegram (ou -100…)
  title         text not null,
  username      text,                             -- @salon si public
  kind          text not null default 'channel',  -- channel | group | supergroup
  active        boolean not null default true,
  -- Réglages de parsing spécifiques au salon (regex custom, alias en plus).
  template      jsonb not null default '{}'::jsonb,
  added_by      uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz,                      -- dernier message reçu
  last_error    text,
  listing_count int not null default 0,
  unique (org_id, tg_chat_id)
);
create index if not exists talent_salons_org on public.talent_salons(org_id) where active;

-- ── 2. Annonces ──────────────────────────────────────────────────────────────
create table if not exists public.talent_listings (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  salon_id         uuid references public.talent_salons(id) on delete set null,
  tg_message_id    bigint,
  tg_grouped_id    text,                          -- album Telegram (plusieurs photos)
  listing_id       text,                          -- réf. du salon (« #8260 »)
  posted_at        timestamptz not null default now(),
  raw_text         text not null,
  fields           jsonb not null default '{}'::jsonb,   -- sortie du parseur
  photos           jsonb not null default '[]'::jsonb,   -- [{path,width,height,hash}]
  parse_confidence real not null default 0,
  -- inbox : à swiper · filtered : rejetée par les filtres durs · review : parsing douteux
  status           text not null default 'inbox',
  filter_reasons   jsonb not null default '[]'::jsonb,
  dedupe_key       text not null,
  seen_in          jsonb not null default '[]'::jsonb,   -- autres salons où l'annonce a été revue
  created_at       timestamptz not null default now(),
  unique (org_id, dedupe_key)
);
create index if not exists talent_listings_feed on public.talent_listings(org_id, status, posted_at desc);
create index if not exists talent_listings_salon on public.talent_listings(salon_id);

-- ── 3. Décisions (match / pass / later) ──────────────────────────────────────
create table if not exists public.talent_decisions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  listing_id  uuid not null references public.talent_listings(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  decision    text not null check (decision in ('match','pass','later')),
  created_at  timestamptz not null default now(),
  unique (listing_id, user_id)      -- re-swiper met à jour, n'empile pas
);
create index if not exists talent_decisions_user on public.talent_decisions(org_id, user_id, created_at desc);

-- ── 4. Pipeline des favoris ──────────────────────────────────────────────────
-- Une annonce matchée entre ici. Les étapes sont le suivi de recrutement.
create table if not exists public.talent_favorites (
  listing_id  uuid primary key references public.talent_listings(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  stage       text not null default 'new'
              check (stage in ('new','contacted','negotiating','signed','lost')),
  owner_id    uuid references auth.users(id) on delete set null,
  tags        text[] not null default '{}',
  note        text,
  matched_by  uuid references auth.users(id) on delete set null,
  matched_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists talent_favorites_org on public.talent_favorites(org_id, stage, matched_at desc);

-- ── 5. Préférences de tri (filtres durs) ─────────────────────────────────────
create table if not exists public.talent_prefs (
  org_id      uuid primary key references public.organizations(id) on delete cascade,
  prefs       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.talent_salons    enable row level security;
alter table public.talent_listings  enable row level security;
alter table public.talent_decisions enable row level security;
alter table public.talent_favorites enable row level security;
alter table public.talent_prefs     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['talent_salons','talent_listings','talent_favorites','talent_prefs'] loop
    execute format('drop policy if exists %I_member_all on public.%I', t, t);
    execute format($f$
      create policy %I_member_all on public.%I
        for all using (public.is_org_member(org_id))
        with check (public.is_org_member(org_id))
    $f$, t, t);
  end loop;
end $$;

-- Les décisions sont personnelles : on lit celles de son org (pour les compteurs
-- d'équipe) mais on n'écrit que les siennes.
drop policy if exists talent_decisions_read on public.talent_decisions;
create policy talent_decisions_read on public.talent_decisions
  for select using (public.is_org_member(org_id));
drop policy if exists talent_decisions_write on public.talent_decisions;
create policy talent_decisions_write on public.talent_decisions
  for all using (user_id = auth.uid() and public.is_org_member(org_id))
  with check (user_id = auth.uid() and public.is_org_member(org_id));

-- ── Automatismes ─────────────────────────────────────────────────────────────
-- Un « match » crée la ligne de pipeline ; un « pass » la retire. L'app n'a donc
-- qu'un seul écrit à faire par swipe, et l'état ne peut pas diverger.
create or replace function public.talent_sync_favorite()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.decision = 'match' then
    insert into public.talent_favorites (listing_id, org_id, matched_by)
    values (new.listing_id, new.org_id, new.user_id)
    on conflict (listing_id) do nothing;
  elsif new.decision = 'pass' then
    delete from public.talent_favorites f
      where f.listing_id = new.listing_id
        and f.stage = 'new'          -- on ne casse pas un dossier déjà engagé
        and not exists (
          select 1 from public.talent_decisions d
          where d.listing_id = new.listing_id and d.decision = 'match' and d.user_id <> new.user_id
        );
  end if;
  return new;
end $$;

drop trigger if exists talent_decisions_sync on public.talent_decisions;
create trigger talent_decisions_sync
  after insert or update on public.talent_decisions
  for each row execute function public.talent_sync_favorite();

create or replace function public.talent_touch_salon()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.talent_salons
     set listing_count = listing_count + 1, last_seen_at = now(), last_error = null
   where id = new.salon_id;
  return new;
end $$;

drop trigger if exists talent_listings_touch on public.talent_listings;
create trigger talent_listings_touch
  after insert on public.talent_listings
  for each row execute function public.talent_touch_salon();

-- ── Deck : les annonces à swiper, non encore décidées par MOI ────────────────
create or replace function public.talent_deck(p_org_id uuid, p_limit int default 60)
returns setof public.talent_listings
language sql stable security definer set search_path = public as $$
  select l.* from public.talent_listings l
  where l.org_id = p_org_id
    and l.status = 'inbox'
    and public.is_org_member(p_org_id)
    and not exists (
      select 1 from public.talent_decisions d
      where d.listing_id = l.id and d.user_id = auth.uid() and d.decision <> 'later'
    )
  order by l.posted_at desc
  limit p_limit;
$$;

-- ── Storage : photos des annonces ────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('talents', 'talents', true)
on conflict (id) do nothing;

drop policy if exists talents_read on storage.objects;
create policy talents_read on storage.objects
  for select using (bucket_id = 'talents');
