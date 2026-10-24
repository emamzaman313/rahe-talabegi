-- هم‌قدم: محدودسازی مجوزهای ستون‌های پروفایل
-- Applied to the live project as hamghadam_profile_column_grants.

revoke insert, update on table public.profiles from authenticated;
grant insert (id, display_name, stage, free_minutes, study_style)
  on table public.profiles to authenticated;
grant update (display_name, stage, free_minutes, study_style)
  on table public.profiles to authenticated;
