-- هم‌قدم: اقدامات نظارتی قابل‌ردگیری و اعمال محدودیت در سمت پایگاه داده
-- این migration افزایشی است؛ جدول، پیام یا حساب موجودی را حذف نمی‌کند.
-- فقط پس از تهیهٔ backup و بازبینی در Supabase SQL Editor اجرا شود.
begin;

create table if not exists public.public_chat_user_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid references public.public_chat_rooms(id) on delete cascade,
  action_type text not null check (action_type in ('warn','mute','kick','ban')),
  reason text not null default '' check (char_length(reason) <= 1000),
  status text not null default 'active' check (status in ('active','revoked','expired')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  constraint public_chat_moderation_scope_check check (
    (action_type in ('warn','ban') and room_id is null)
    or (action_type in ('mute','kick') and room_id is not null)
  ),
  constraint public_chat_moderation_revocation_check check (
    (status <> 'revoked' and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null and revoked_by is not null)
  )
);

create index if not exists public_chat_moderation_user_active_idx
  on public.public_chat_user_moderation_actions(user_id, status, action_type, expires_at);
create index if not exists public_chat_moderation_room_active_idx
  on public.public_chat_user_moderation_actions(room_id, status, action_type, expires_at);
create index if not exists public_chat_moderation_created_idx
  on public.public_chat_user_moderation_actions(created_at desc);

alter table public.public_chat_user_moderation_actions enable row level security;
revoke all on public.public_chat_user_moderation_actions from anon, authenticated;
grant select, insert on public.public_chat_user_moderation_actions to authenticated;
grant update(status, revoked_by, revoked_at) on public.public_chat_user_moderation_actions to authenticated;

drop policy if exists public_chat_moderation_read_own_or_moderator on public.public_chat_user_moderation_actions;
create policy public_chat_moderation_read_own_or_moderator
on public.public_chat_user_moderation_actions for select to authenticated
using (
  user_id = (select auth.uid())
  or coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','super_admin','chat_moderator','content_moderator','support')
  or coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ?| array['admin','super_admin','chat_moderator','content_moderator','support']
);

drop policy if exists public_chat_moderation_insert_by_moderator on public.public_chat_user_moderation_actions;
create policy public_chat_moderation_insert_by_moderator
on public.public_chat_user_moderation_actions for insert to authenticated
with check (
  created_by = (select auth.uid())
  and status = 'active'
  and revoked_by is null and revoked_at is null
  and (
    coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','super_admin','chat_moderator','content_moderator','support')
    or coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ?| array['admin','super_admin','chat_moderator','content_moderator','support']
  )
);

drop policy if exists public_chat_moderation_revoke_by_moderator on public.public_chat_user_moderation_actions;
create policy public_chat_moderation_revoke_by_moderator
on public.public_chat_user_moderation_actions for update to authenticated
using (
  status = 'active' and (
    coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','super_admin','chat_moderator','content_moderator','support')
    or coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ?| array['admin','super_admin','chat_moderator','content_moderator','support']
  )
)
with check (
  status = 'revoked' and revoked_by = (select auth.uid()) and revoked_at is not null and (
    coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','super_admin','chat_moderator','content_moderator','support')
    or coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ?| array['admin','super_admin','chat_moderator','content_moderator','support']
  )
);

-- این تابع فقط محدودیت حساب جاری را برمی‌گرداند؛ کاربر نمی‌تواند حساب دیگری را جست‌وجو کند.
create or replace function public.hgd_chat_current_user_restricted(p_room_id uuid, p_action_types text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.public_chat_user_moderation_actions a
    where a.user_id = (select auth.uid())
      and a.status = 'active'
      and a.action_type = any(coalesce(p_action_types, array[]::text[]))
      and (a.room_id is null or a.room_id = p_room_id)
      and (a.expires_at is null or a.expires_at > now())
  );
$$;
revoke all on function public.hgd_chat_current_user_restricted(uuid, text[]) from public, anon;
grant execute on function public.hgd_chat_current_user_restricted(uuid, text[]) to authenticated;

-- بازتعریف سیاست‌های مشخص چت برای اعمال ban/kick/mute در دیتابیس، نه فقط در رابط.
drop policy if exists public_chat_rooms_read_active on public.public_chat_rooms;
create policy public_chat_rooms_read_active
on public.public_chat_rooms for select to authenticated
using (is_active and not public.hgd_chat_current_user_restricted(id, array['ban','kick']));

drop policy if exists public_chat_members_join_own on public.public_chat_members;
create policy public_chat_members_join_own
on public.public_chat_members for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.public_chat_rooms r where r.id = room_id and r.is_active)
  and not public.hgd_chat_current_user_restricted(room_id, array['ban','kick'])
);

drop policy if exists public_chat_messages_read_active_rooms on public.public_chat_messages;
create policy public_chat_messages_read_active_rooms
on public.public_chat_messages for select to authenticated
using (
  exists (select 1 from public.public_chat_rooms r where r.id = room_id and r.is_active)
  and not public.hgd_chat_current_user_restricted(room_id, array['ban','kick'])
);

drop policy if exists public_chat_messages_send_as_self on public.public_chat_messages;
create policy public_chat_messages_send_as_self
on public.public_chat_messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (select 1 from public.public_chat_rooms r where r.id = room_id and r.is_active)
  and not public.hgd_chat_current_user_restricted(room_id, array['ban','mute','kick'])
  and (
    reply_to is null or exists (
      select 1 from public.public_chat_messages parent
      where parent.id = reply_to and parent.room_id = public_chat_messages.room_id and parent.deleted_at is null
    )
  )
);

-- اگر migration پیوست‌ها قبلاً اجرا شده باشد، همین محدودیت‌ها روی فایل‌ها نیز اعمال می‌شوند.
drop policy if exists public_chat_attachments_read_room_members on public.public_chat_attachments;
create policy public_chat_attachments_read_room_members
on public.public_chat_attachments for select to authenticated
using (
  not public.hgd_chat_current_user_restricted(room_id, array['ban','kick'])
  and exists (
    select 1 from public.public_chat_members m
    join public.public_chat_rooms r on r.id = m.room_id
    where m.room_id = public_chat_attachments.room_id and m.user_id = (select auth.uid()) and r.is_active
  )
);

drop policy if exists public_chat_attachments_insert_own_message on public.public_chat_attachments;
create policy public_chat_attachments_insert_own_message
on public.public_chat_attachments for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and bucket_id = 'hamghadam-chat-files'
  and object_path like room_id::text || '/' || (select auth.uid())::text || '/%'
  and not public.hgd_chat_current_user_restricted(room_id, array['ban','mute','kick'])
  and exists (
    select 1 from public.public_chat_members m
    join public.public_chat_rooms r on r.id = m.room_id
    where m.room_id = public_chat_attachments.room_id and m.user_id = (select auth.uid()) and r.is_active
  )
  and exists (
    select 1 from public.public_chat_messages msg
    where msg.id = public_chat_attachments.message_id and msg.room_id = public_chat_attachments.room_id
      and msg.sender_id = (select auth.uid())
  )
);

drop policy if exists hamghadam_chat_files_read_room_members on storage.objects;
create policy hamghadam_chat_files_read_room_members
on storage.objects for select to authenticated
using (
  bucket_id = 'hamghadam-chat-files'
  and not public.hgd_chat_current_user_restricted((case when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then ((storage.foldername(name))[1])::uuid else null end), array['ban','kick'])
  and exists (
    select 1 from public.public_chat_members m
    join public.public_chat_rooms r on r.id = m.room_id
    where m.room_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()) and r.is_active
  )
);

drop policy if exists hamghadam_chat_files_upload_room_members on storage.objects;
create policy hamghadam_chat_files_upload_room_members
on storage.objects for insert to authenticated
with check (
  bucket_id = 'hamghadam-chat-files'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and not public.hgd_chat_current_user_restricted((case when (storage.foldername(name))[1] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then ((storage.foldername(name))[1])::uuid else null end), array['ban','mute','kick'])
  and exists (
    select 1 from public.public_chat_members m
    join public.public_chat_rooms r on r.id = m.room_id
    where m.room_id::text = (storage.foldername(name))[1] and m.user_id = (select auth.uid()) and r.is_active
  )
);

comment on table public.public_chat_user_moderation_actions is 'سابقهٔ هشدار، سکوت، اخراج و محرومیت هم‌قدم؛ اقدامات فقط با app_metadata role مورداعتماد ثبت می‌شوند.';
commit;
