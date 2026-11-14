-- UniPulse HK database schema.
-- Paste the whole file into Supabase -> SQL Editor -> Run. Safe to run again.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- True when the e-mail belongs to a Hong Kong university.
-- Keep the list in sync with lib/hk-universities.ts.
create or replace function public.is_hk_uni_email(email text)
returns boolean
language sql
immutable
as $$
  select exists (
    select 1
    from unnest(array[
      'cityu.edu.hk', 'hku.hk', 'cuhk.edu.hk', 'ust.hk', 'polyu.edu.hk',
      'polyu.hk', 'hkbu.edu.hk', 'ln.edu.hk', 'ln.hk', 'eduhk.hk',
      'hkmu.edu.hk', 'hksyu.edu', 'hsu.edu.hk', 'vtc.edu.hk', 'hkapa.edu',
      'sfu.edu.hk', 'twc.edu.hk', 'chuhai.edu.hk'
    ]) as d
    where lower(split_part(email, '@', 2)) = d
       or lower(split_part(email, '@', 2)) like '%.' || d
  );
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

-- Public part of a student profile: what other students may see.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  university text,
  major text,
  year_of_study text,
  interests text[] not null default '{}',
  skills text[] not null default '{}',
  preferred_categories text[] not null default '{}',
  goals text,
  verified boolean not null default false,
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

-- Private part: details used only to fill in registration forms.
create table if not exists public.profile_private (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  student_id text,
  linkedin text,
  github text,
  pitch text,
  updated_at timestamptz not null default now()
);

-- Create both rows as soon as somebody signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    public.is_hk_uni_email(new.email)
  )
  on conflict (id) do nothing;

  insert into public.profile_private (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  title text not null,
  category text not null check (category in (
    'hackathon', 'seminar', 'training', 'meetup',
    'volunteering', 'internship', 'helper'
  )),
  summary text not null default '',
  description text,
  start_at timestamptz,
  end_at timestamptz,
  deadline_at timestamptz,
  location text,
  mode text check (mode in ('in_person', 'online', 'hybrid')),
  organizer text,
  url text,
  apply_url text,
  eligibility text,
  tags text[] not null default '{}',
  source_type text not null check (source_type in (
    'seed', 'web', 'site', 'email', 'telegram', 'manual'
  )),
  source_ref text,
  submitted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists events_start_at_idx on public.events (start_at);
create index if not exists events_category_idx on public.events (category);
create index if not exists events_url_idx on public.events (url);

-- ---------------------------------------------------------------------------
-- Things students do with events
-- ---------------------------------------------------------------------------

create table if not exists public.saved_events (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  status text not null default 'saved' check (status in ('saved', 'going', 'applied')),
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table if not exists public.follows (
  follower_id uuid not null references auth.users (id) on delete cascade,
  following_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  name text not null,
  description text,
  looking_for text[] not null default '{}',
  owner_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- Cached "why this fits you" results written by the server.
create table if not exists public.matches (
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  score integer not null,
  reason text,
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- ---------------------------------------------------------------------------
-- Agent bookkeeping
-- ---------------------------------------------------------------------------

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  step text not null,
  status text not null default 'running' check (status in ('running', 'ok', 'error', 'skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  found integer not null default 0,
  added integer not null default 0,
  log text not null default ''
);

-- Posts, e-mails and pages the agent has already processed.
create table if not exists public.agent_seen (
  ref text primary key,
  seen_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.profile_private enable row level security;
alter table public.events enable row level security;
alter table public.saved_events enable row level security;
alter table public.follows enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.matches enable row level security;
alter table public.agent_runs enable row level security;
alter table public.agent_seen enable row level security;

-- profiles: signed-in students see each other, everyone edits only their own row.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- profile_private: owner only.
drop policy if exists profile_private_select on public.profile_private;
create policy profile_private_select on public.profile_private
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists profile_private_update on public.profile_private;
create policy profile_private_update on public.profile_private
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- events: readable by everyone, written only by the server (service role).
drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to anon, authenticated using (true);

-- saved_events: your own rows, plus other people's "going" so friends show up.
drop policy if exists saved_events_select on public.saved_events;
create policy saved_events_select on public.saved_events
  for select to authenticated
  using (user_id = (select auth.uid()) or status = 'going');

drop policy if exists saved_events_insert on public.saved_events;
create policy saved_events_insert on public.saved_events
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists saved_events_update on public.saved_events;
create policy saved_events_update on public.saved_events
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists saved_events_delete on public.saved_events;
create policy saved_events_delete on public.saved_events
  for delete to authenticated using (user_id = (select auth.uid()));

-- follows
drop policy if exists follows_select on public.follows;
create policy follows_select on public.follows
  for select to authenticated using (true);

drop policy if exists follows_insert on public.follows;
create policy follows_insert on public.follows
  for insert to authenticated with check (follower_id = (select auth.uid()));

drop policy if exists follows_delete on public.follows;
create policy follows_delete on public.follows
  for delete to authenticated using (follower_id = (select auth.uid()));

-- teams
drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams
  for select to authenticated using (true);

drop policy if exists teams_insert on public.teams;
create policy teams_insert on public.teams
  for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists teams_delete on public.teams;
create policy teams_delete on public.teams
  for delete to authenticated using (owner_id = (select auth.uid()));

-- team_members
drop policy if exists team_members_select on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated using (true);

drop policy if exists team_members_insert on public.team_members;
create policy team_members_insert on public.team_members
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists team_members_delete on public.team_members;
create policy team_members_delete on public.team_members
  for delete to authenticated using (user_id = (select auth.uid()));

-- matches: owner reads, server writes.
drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches
  for select to authenticated using (user_id = (select auth.uid()));

-- agent_runs: the activity log is public, the server writes it.
drop policy if exists agent_runs_select on public.agent_runs;
create policy agent_runs_select on public.agent_runs
  for select to anon, authenticated using (true);

-- agent_seen: server only (no policies).

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------
-- Policies decide which rows a role may touch; these grants decide which
-- tables and columns it may touch at all. Start from nothing and add exactly
-- what the site uses.

revoke all on
  public.profiles, public.profile_private, public.events, public.saved_events,
  public.follows, public.teams, public.team_members, public.matches,
  public.agent_runs, public.agent_seen
from anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;

grant all on
  public.profiles, public.profile_private, public.events, public.saved_events,
  public.follows, public.teams, public.team_members, public.matches,
  public.agent_runs, public.agent_seen
to service_role;

grant select on public.events, public.agent_runs to anon, authenticated;

-- "verified" is decided by the sign-up trigger, never by the student, so it
-- is left out of the columns a student may change.
grant select on public.profiles to authenticated;
grant update (
  full_name, university, major, year_of_study, interests, skills,
  preferred_categories, goals, onboarded
) on public.profiles to authenticated;

grant select on public.profile_private to authenticated;
grant update (phone, student_id, linkedin, github, pitch, updated_at)
  on public.profile_private to authenticated;

grant select, insert, update, delete on public.saved_events to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, delete on public.team_members to authenticated;
grant select on public.matches to authenticated;
