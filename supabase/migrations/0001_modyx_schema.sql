-- MODYX FREE FIRE — full schema + RLS
-- Run in Supabase SQL editor (or via supabase migrations).

-- ============ helpers ============
create extension if not exists "pgcrypto";

-- ============ profiles ============
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  username text not null unique,
  email text,
  ff_uid text,
  phone text,
  share_phone_with_admin boolean default false not null,
  team_name text,
  avatar_url text,
  role text not null default 'user' check (role in ('user','referee','moderator','admin')),
  status text not null default 'active' check (status in ('active','banned','pending')),
  created_at timestamptz default now() not null
);
create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_profiles_ff_uid on public.profiles(ff_uid);
create index if not exists idx_profiles_created on public.profiles(created_at);

-- ============ teams ============
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  tag text,
  description text,
  logo_url text,
  captain_id uuid references public.profiles(id) on delete set null,
  wins int default 0 not null, points int default 0 not null,
  created_at timestamptz default now() not null
);
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('captain','member','sub')),
  joined_at timestamptz default now() not null,
  unique(team_id, user_id)
);
create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz default now() not null,
  unique(team_id, user_id)
);

-- ============ tournaments ============
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  mode text not null check (mode in ('solo','duo','squad')),
  max_slots int not null check (max_slots >= 2 and max_slots <= 512),
  registered_count int not null default 0,
  status text not null default 'upcoming' check (status in ('upcoming','ongoing','finished','cancelled')),
  registration_open boolean not null default true,
  starts_at timestamptz not null,
  rules text, prize text,
  winner_text text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now() not null
);
create table if not exists public.tournament_registrations (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  status text not null default 'confirmed' check (status in ('confirmed','waitlist','cancelled')),
  created_at timestamptz default now() not null,
  unique(tournament_id, user_id)
);
create index if not exists idx_treg_tournament on public.tournament_registrations(tournament_id);

-- ============ matches & results ============
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round text not null default 'group',
  stage text not null default 'group' check (stage in ('group','quarter','semi','final')),
  scheduled_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','live','finished','cancelled')),
  created_at timestamptz default now() not null
);
create table if not exists public.match_participants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  unique(match_id, user_id)
);
create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  placement int, kills int default 0,
  points int default 0,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now() not null
);
create table if not exists public.score_rules (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  place int not null, points int not null
);
create table if not exists public.score_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  tournament_id uuid references public.tournaments(id) on delete set null,
  points int not null default 0, reason text,
  created_at timestamptz default now() not null
);

-- ============ rooms ============
create table if not exists public.room_details (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade unique,
  room_id text not null,
  room_password text,
  map text, scheduled_at timestamptz, instructions text,
  created_at timestamptz default now() not null
);

-- ============ notifications ============
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null, body text, link text,
  read boolean default false not null,
  created_at timestamptz default now() not null
);
create index if not exists idx_notif_user on public.notifications(user_id);
create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  kind text not null,
  payload jsonb,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts int default 0 not null, last_error text,
  created_at timestamptz default now() not null
);

-- ============ news / support / gamification ============
create table if not exists public.news_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null, slug text not null unique,
  excerpt text, body text not null,
  cover_url text, published boolean default true not null,
  created_at timestamptz default now() not null
);
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  subject text not null, message text not null,
  status text not null default 'open' check (status in ('open','answered','closed')),
  created_at timestamptz default now() not null
);
create table if not exists public.support_replies (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  message text not null, is_staff boolean default false not null,
  created_at timestamptz default now() not null
);
create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, title text not null, description text, points int default 0
);
create table if not exists public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  created_at timestamptz default now() not null,
  unique(user_id, achievement_id)
);
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null, target text, meta jsonb,
  created_at timestamptz default now() not null
);
create table if not exists public.site_settings (
  key text primary key, value jsonb, updated_at timestamptz default now()
);

-- ============ atomic registration function ============
create or replace function public.register_for_tournament(p_tournament uuid, p_user uuid, p_team uuid default null)
returns jsonb language plpgsql security definer as $$
declare v_open boolean; v_count int; v_max int; v_status text;
begin
  select registration_open, registered_count, max_slots into v_open, v_count, v_max
  from public.tournaments where id = p_tournament for update;
  if not found then return jsonb_build_object('ok', false, 'error', 'tournament-not-found'); end if;
  if not v_open then return jsonb_build_object('ok', false, 'error', 'registration-closed'); end if;
  if exists (select 1 from public.tournament_registrations where tournament_id = p_tournament and user_id = p_user) then
    return jsonb_build_object('ok', false, 'error', 'already-registered');
  end if;
  v_status := case when v_count >= v_max then 'waitlist' else 'confirmed' end;
  insert into public.tournament_registrations (tournament_id, user_id, team_id, status)
  values (p_tournament, p_user, p_team, v_status);
  if v_status = 'confirmed' then
    update public.tournaments set registered_count = registered_count + 1 where id = p_tournament;
  end if;
  return jsonb_build_object('ok', true, 'status', v_status);
end $$;

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invitations enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_registrations enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.match_results enable row level security;
alter table public.room_details enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.news_articles enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_replies enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.audit_logs enable row level security;
alter table public.score_history enable row level security;
alter table public.score_rules enable row level security;
alter table public.site_settings enable row level security;

-- public readable
drop policy if exists "public read tournaments" on public.tournaments;
create policy "public read tournaments" on public.tournaments for select using (true);
drop policy if exists "public read news" on public.news_articles;
create policy "public read news" on public.news_articles for select using (published = true);
drop policy if exists "public read achievements" on public.achievements;
create policy "public read achievements" on public.achievements for select using (true);
drop policy if exists "profiles public basic" on public.profiles;
create policy "profiles public basic" on public.profiles for select using (true);
drop policy if exists "own profile update" on public.profiles;
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "teams read" on public.teams;
create policy "teams read" on public.teams for select using (true);
drop policy if exists "auth create team" on public.teams;
create policy "auth create team" on public.teams for insert with check (auth.uid() is not null);
drop policy if exists "members read" on public.team_members;
create policy "members read" on public.team_members for select using (true);
drop policy if exists "matches read" on public.matches;
create policy "matches read" on public.matches for select using (true);
drop policy if exists "results read approved" on public.match_results;
create policy "results read approved" on public.match_results for select using (status = 'approved' or auth.uid() is not null);
drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "own tickets" on public.support_tickets;
create policy "own tickets" on public.support_tickets for select using (auth.uid() = user_id);
drop policy if exists "own tickets insert" on public.support_tickets;
create policy "own tickets insert" on public.support_tickets for insert with check (auth.uid() = user_id);
drop policy if exists "own reg read" on public.tournament_registrations;
create policy "own reg read" on public.tournament_registrations for select using (true);

-- NOTE: privileged writes (roles, results approval, rooms, outbox, audit) must go through service-role server actions only.
