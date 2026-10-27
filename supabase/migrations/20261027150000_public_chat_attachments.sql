-- هم‌قدم: پیوست امن برای گروه‌ها و کانال‌ها؛ سقف هر فایل ۵۰ MiB.
-- این migration را فقط روی همان پروژه Supabase اپ اجرا کنید.
-- فایل‌ها private هستند؛ لینک‌های دانلود امضاشده و کوتاه‌عمر تولید می‌شوند.

create table if not exists public.public_chat_attachments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.public_chat_rooms(id) on delete cascade,
  message_id uuid not null unique references public.public_chat_messages(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null default 'hamghadam-chat-files'
    check (bucket_id = 'hamghadam-chat-files'),
  object_path text not null unique check (char_length(object_path) <= 600),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 120),
  mime_type text not null check (char_length(mime_type) between 1 and 120),
  size_bytes bigint not null check (size_bytes between 1 and 52428800),
  created_at timestamptz not null default now()
);

create index if not exists public_chat_attachments_room_created_idx
  on public.public_chat_attachments(room_id, created_at desc);
create index if not exists public_chat_attachments_uploaded_by_idx
  on public.public_chat_attachments(uploaded_by, created_at desc);

alter table public.public_chat_attachments enable row level security;
revoke all on table public.public_chat_attachments from anon, authenticated;
grant select on table public.public_chat_attachments to authenticated;
grant insert(room_id,message_id,uploaded_by,bucket_id,object_path,file_name,mime_type,size_bytes)
  on public.public_chat_attachments to authenticated;
grant delete on table public.public_chat_attachments to authenticated;

drop policy if exists public_chat_attachments_read_room_members on public.public_chat_attachments;
create policy public_chat_attachments_read_room_members
on public.public_chat_attachments for select to authenticated
using (
  exists (
    select 1 from public.public_chat_members m
    join public.public_chat_rooms r on r.id = m.room_id
    where m.room_id = public_chat_attachments.room_id
      and m.user_id = (select auth.uid())
      and r.is_active
  )
);

drop policy if exists public_chat_attachments_insert_own_message on public.public_chat_attachments;
create policy public_chat_attachments_insert_own_message
on public.public_chat_attachments for insert to authenticated
with check (
  uploaded_by = (select auth.uid())
  and bucket_id = 'hamghadam-chat-files'
  and object_path like room_id::text || '/' || (select auth.uid())::text || '/%'
  and exists (
    select 1 from public.public_chat_members m
    join public.public_chat_rooms r on r.id = m.room_id
    where m.room_id = public_chat_attachments.room_id
      and m.user_id = (select auth.uid())
      and r.is_active
  )
  and exists (
    select 1 from public.public_chat_messages msg
    where msg.id = public_chat_attachments.message_id
      and msg.room_id = public_chat_attachments.room_id
      and msg.sender_id = (select auth.uid())
  )
);

drop policy if exists public_chat_attachments_delete_own on public.public_chat_attachments;
create policy public_chat_attachments_delete_own
on public.public_chat_attachments for delete to authenticated
using (uploaded_by = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hamghadam-chat-files',
  'hamghadam-chat-files',
  false,
  52428800,
  array[
    'application/pdf','image/png','image/jpeg','image/webp','image/gif',
    'text/plain','text/csv','application/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip','application/x-zip-compressed','application/x-7z-compressed',
    'audio/mpeg','audio/mp4','video/mp4'
  ]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists hamghadam_chat_files_read_room_members on storage.objects;
create policy hamghadam_chat_files_read_room_members
on storage.objects for select to authenticated
using (
  bucket_id = 'hamghadam-chat-files'
  and exists (
    select 1 from public.public_chat_members m
    join public.public_chat_rooms r on r.id = m.room_id
    where m.room_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and r.is_active
  )
);

drop policy if exists hamghadam_chat_files_upload_room_members on storage.objects;
create policy hamghadam_chat_files_upload_room_members
on storage.objects for insert to authenticated
with check (
  bucket_id = 'hamghadam-chat-files'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.public_chat_members m
    join public.public_chat_rooms r on r.id = m.room_id
    where m.room_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
      and r.is_active
  )
);

drop policy if exists hamghadam_chat_files_delete_own on storage.objects;
create policy hamghadam_chat_files_delete_own
on storage.objects for delete to authenticated
using (
  bucket_id = 'hamghadam-chat-files'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.public_chat_members m
    where m.room_id::text = (storage.foldername(name))[1]
      and m.user_id = (select auth.uid())
  )
);
