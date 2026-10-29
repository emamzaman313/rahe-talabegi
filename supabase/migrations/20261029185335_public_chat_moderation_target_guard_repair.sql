-- هم‌قدم: محافظت از مرز نقش‌ها برای اقدامات نظارتی و جلوگیری از گزارش خودِ کاربر
-- این migration پس از 20261029140000 و 20261029160000 اجرا شود.
-- جدول‌ها و سابقهٔ موجود حذف یا بازنویسی نمی‌شوند.
begin;

create or replace function public.hgd_guard_chat_moderation_target()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_meta jsonb := coalesce(auth.jwt() -> 'app_metadata', '{}'::jsonb);
  v_target_meta jsonb := '{}'::jsonb;
  v_actor_owner boolean;
  v_actor_super boolean;
  v_actor_admin boolean;
  v_target_owner boolean;
  v_target_super boolean;
  v_target_admin boolean;
  v_target_moderator boolean;
begin
  if v_actor_id is null or new.created_by <> v_actor_id then
    raise exception 'هویت ایجادکنندهٔ اقدام نظارتی معتبر نیست.' using errcode = '42501';
  end if;

  if new.user_id = v_actor_id then
    raise exception 'ناظر نمی‌تواند از مسیر اقدامات چت عمومی خودش را محدود کند.' using errcode = '42501';
  end if;

  select coalesce(u.raw_app_meta_data, '{}'::jsonb)
    into v_target_meta
  from auth.users u
  where u.id = new.user_id;

  if not found then
    raise exception 'حساب مقصد پیدا نشد.' using errcode = 'P0002';
  end if;

  v_actor_owner := coalesce(v_actor_meta ->> 'role', '') = 'owner'
    or coalesce(v_actor_meta -> 'roles', '[]'::jsonb) ? 'owner';
  v_actor_super := coalesce(v_actor_meta ->> 'role', '') = 'super_admin'
    or coalesce(v_actor_meta -> 'roles', '[]'::jsonb) ? 'super_admin';
  v_actor_admin := v_actor_owner or v_actor_super
    or coalesce(v_actor_meta ->> 'role', '') = 'admin'
    or coalesce(v_actor_meta -> 'roles', '[]'::jsonb) ? 'admin';

  v_target_owner := coalesce(v_target_meta ->> 'role', '') = 'owner'
    or coalesce(v_target_meta -> 'roles', '[]'::jsonb) ? 'owner';
  v_target_super := coalesce(v_target_meta ->> 'role', '') = 'super_admin'
    or coalesce(v_target_meta -> 'roles', '[]'::jsonb) ? 'super_admin';
  v_target_admin := coalesce(v_target_meta ->> 'role', '') = 'admin'
    or coalesce(v_target_meta -> 'roles', '[]'::jsonb) ? 'admin';
  v_target_moderator := coalesce(v_target_meta ->> 'role', '') in ('chat_moderator','content_moderator','support')
    or coalesce(v_target_meta -> 'roles', '[]'::jsonb) ?| array['chat_moderator','content_moderator','support'];

  if v_target_owner and not v_actor_owner then
    raise exception 'اقدام روی مالک سامانه فقط توسط مالک مجاز است.' using errcode = '42501';
  end if;
  if v_target_super and not v_actor_owner then
    raise exception 'اقدام روی مدیر ارشد فقط توسط مالک سامانه مجاز است.' using errcode = '42501';
  end if;
  if v_target_admin and not v_actor_owner and not v_actor_super then
    raise exception 'اقدام روی مدیر فقط توسط مالک یا مدیر ارشد مجاز است.' using errcode = '42501';
  end if;
  if v_target_moderator and not v_actor_admin then
    raise exception 'اقدام روی ناظر یا کارمند فقط توسط مدیر مجاز است.' using errcode = '42501';
  end if;

  return new;
end;
$$;
revoke all on function public.hgd_guard_chat_moderation_target() from public, anon, authenticated;

drop trigger if exists hgd_guard_chat_moderation_target_trg on public.public_chat_user_moderation_actions;
create trigger hgd_guard_chat_moderation_target_trg
before insert on public.public_chat_user_moderation_actions
for each row execute function public.hgd_guard_chat_moderation_target();

-- هماهنگ‌کردن RPC پیوستن با تعریف ظرفیت: مسئول بحث عضو عادی نیست.
-- در migration قدیمی شمارش همهٔ ردیف‌ها انجام می‌شد و حضور مسئول، ظرفیت عضو سوم را می‌گرفت.
create or replace function public.join_discussion_group(p_group_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.discussion_groups%rowtype;
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'ابتدا وارد حساب شو' using errcode = '42501';
  end if;
  perform private.hgd_assert_can_post('group');

  select * into v_group
  from public.discussion_groups
  where id = p_group_id
  for update;

  if not found or not v_group.is_open then
    raise exception 'این گروه در دسترس نیست';
  end if;

  if exists (
    select 1 from public.discussion_group_members
    where group_id = p_group_id and user_id = auth.uid()
  ) then
    return true;
  end if;

  select count(*)::integer into v_count
  from public.discussion_group_members
  where group_id = p_group_id
    and member_role is distinct from 'discussion_leader';

  if v_count >= least(3, greatest(1, coalesce(v_group.max_members, 3))) then
    raise exception 'ظرفیت گروه تکمیل است؛ مسئول بحث در ظرفیت سه عضو عادی شمرده نمی‌شود.' using errcode = 'P0001';
  end if;

  insert into public.discussion_group_members(group_id, user_id, member_role)
  values (p_group_id, auth.uid(), 'member');

  perform private.hgd_write_audit('discussion_group_joined', 'discussion_group', p_group_id::text, '', '{}'::jsonb);
  return true;
end;
$$;
revoke all on function public.join_discussion_group(uuid) from public, anon;
grant execute on function public.join_discussion_group(uuid) to authenticated;

-- RLS نیز اجازهٔ گزارش‌دادن پیام خود را نمی‌دهد؛ رابط کاربری به‌تنهایی مرز امنیتی نیست.
drop policy if exists public_chat_reports_insert_own on public.public_chat_reports;
create policy public_chat_reports_insert_own
on public.public_chat_reports for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and message_id is not null
  and reported_user_id is not null
  and reporter_id <> reported_user_id
  and status = 'open'
  and moderator_id is null
  and reviewed_at is null
  and moderator_note = ''
  and exists (
    select 1 from public.public_chat_messages m
    where m.id = message_id
      and m.sender_id = reported_user_id
      and m.deleted_at is null
  )
);

comment on function public.hgd_guard_chat_moderation_target() is
'جلوگیری از اقدامات نظارتی خودی یا اقدام ناظر رده پایین‌تر روی حساب مدیر/ناظر؛ نقش‌ها از app_metadata سروری خوانده می‌شوند.';
commit;

