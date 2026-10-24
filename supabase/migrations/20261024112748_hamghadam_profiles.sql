-- هم‌قدم: پایهٔ پروفایل سروری فاز اول
-- This migration was applied to project gnbwcupxtbsjdgnncort as hamghadam_profiles.
-- Never add roles or trusted permissions to this user-editable profile row.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  stage text not null default 'پایه یک' check (char_length(btrim(stage)) between 1 and 60),
  free_minutes integer not null default 60 check (free_minutes between 0 and 1440),
  study_style text not null default 'ترکیبی'
    check (study_style in ('خواندن','خلاصه‌نویسی','پرسش‌وپاسخ','مباحثه','حل تمرین','ترکیبی')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
