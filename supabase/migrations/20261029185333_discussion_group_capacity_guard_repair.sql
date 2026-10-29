-- هم‌قدم: سقف سه عضو عادی برای گروه مباحثه، با قفل ردیف برای جلوگیری از race condition.
-- نقش discussion_leader مسئول بحث است و جزو ظرفیت سه عضو عادی شمرده نمی‌شود.
-- owner/creator عضو عادی محسوب می‌شود. این migration هیچ عضوی را حذف نمی‌کند.
begin;

-- اگر دادهٔ فعلی از قبل بیش از سه عضو عادی دارد، بدون حذف خودکار داده مهاجرت را متوقف کن تا تصمیم انسانی گرفته شود.
do $$
begin
  if exists (
    select 1
    from public.discussion_group_members m
    group by m.group_id
    having count(*) filter (where m.member_role is distinct from 'discussion_leader') > 3
  ) then
    raise exception 'یک یا چند گروه فعلی بیش از سه عضو عادی دارند؛ پیش از اجرای این migration، عضویت آن گروه‌ها را دستی بررسی کن. هیچ عضوی خودکار حذف نشد.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.hgd_clamp_discussion_group_capacity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.max_members := least(3, greatest(1, coalesce(new.max_members, 3)));
  return new;
end;
$$;
revoke all on function public.hgd_clamp_discussion_group_capacity() from public, anon, authenticated;

drop trigger if exists hgd_clamp_discussion_group_capacity_trg on public.discussion_groups;
create trigger hgd_clamp_discussion_group_capacity_trg
before insert or update of max_members on public.discussion_groups
for each row execute function public.hgd_clamp_discussion_group_capacity();

-- فقط مقدار ظرفیت گروه‌های موجود را به سقف جدید محدود کن؛ عضویت‌ها و گفتگوها دست‌نخورده می‌مانند.
update public.discussion_groups
set max_members = least(3, greatest(1, coalesce(max_members, 3)))
where max_members is distinct from least(3, greatest(1, coalesce(max_members, 3)));

create or replace function public.hgd_enforce_discussion_group_capacity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_capacity integer;
  v_is_open boolean;
  v_ordinary_count integer;
begin
  -- قفل گروه باعث می‌شود پیوستن هم‌زمان چند کاربر ظرفیت را دور نزند.
  select least(3, greatest(1, coalesce(g.max_members, 3))), g.is_open
    into v_capacity, v_is_open
  from public.discussion_groups g
  where g.id = new.group_id
  for update;

  if not found then
    raise exception 'گروه مباحثه پیدا نشد.' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' and not v_is_open then
    raise exception 'این گروه بسته است و عضو تازه نمی‌پذیرد.' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_ordinary_count
  from public.discussion_group_members m
  where m.group_id = new.group_id
    and m.user_id <> new.user_id
    and m.member_role is distinct from 'discussion_leader';

  if new.member_role is distinct from 'discussion_leader'
     and v_ordinary_count >= v_capacity then
    raise exception 'ظرفیت گروه تکمیل است؛ حداکثر سه عضو عادی، با احتساب سازنده، مجازند.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
revoke all on function public.hgd_enforce_discussion_group_capacity() from public, anon, authenticated;

drop trigger if exists hgd_enforce_discussion_group_capacity_trg on public.discussion_group_members;
create trigger hgd_enforce_discussion_group_capacity_trg
before insert or update of group_id, member_role on public.discussion_group_members
for each row execute function public.hgd_enforce_discussion_group_capacity();

comment on function public.hgd_enforce_discussion_group_capacity() is
'کنترل سمت پایگاه داده برای حداکثر سه عضو عادی در گروه مباحثه؛ discussion_leader از ظرفیت مستثناست.';
commit;

