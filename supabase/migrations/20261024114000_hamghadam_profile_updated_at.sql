-- هم‌قدم: به‌روزرسانی زمان تغییر پروفایل در سمت سرور
-- Applied to the live project as hamghadam_profile_updated_at.

create or replace function private.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

revoke all on function private.touch_profile_updated_at() from public, anon, authenticated;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_profile_updated_at();
