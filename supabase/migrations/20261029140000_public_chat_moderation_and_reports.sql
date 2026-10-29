-- هم‌قدم: گزارش تخلف و حذف نرم مدیریتی برای چت عمومی
-- این مهاجرت ساختار/سیاست اضافه می‌کند؛ هیچ پیام، کاربر یا جدولی حذف نمی‌شود.
-- ابتدا روی محیط آزمایشی اجرا کن و پیش از اجرا از پروژه پشتیبان بگیر.
begin;

alter table public.public_chat_messages enable row level security;

drop policy if exists public_chat_messages_delete_own on public.public_chat_messages;
create policy public_chat_messages_delete_own
on public.public_chat_messages for update to authenticated
using (sender_id = (select auth.uid()) and deleted_at is null)
with check (sender_id = (select auth.uid()) and deleted_at is not null and body = 'این پیام حذف شد.');

drop policy if exists public_chat_messages_moderator_delete on public.public_chat_messages;
create policy public_chat_messages_moderator_delete
on public.public_chat_messages for update to authenticated
using (
  deleted_at is null and (
    coalesce(auth.jwt()->'app_metadata'->>'role', '') in ('admin','super_admin','chat_moderator','content_moderator','support')
    or coalesce(auth.jwt()->'app_metadata'->'roles', '[]'::jsonb) ?| array['admin','super_admin','chat_moderator','content_moderator','support']
  )
)
with check (
  deleted_at is not null and body = 'این پیام حذف شد.' and (
    coalesce(auth.jwt()->'app_metadata'->>'role', '') in ('admin','super_admin','chat_moderator','content_moderator','support')
    or coalesce(auth.jwt()->'app_metadata'->'roles', '[]'::jsonb) ?| array['admin','super_admin','chat_moderator','content_moderator','support']
  )
);

-- حذف نرم به deleted_at محدود می‌شود؛ محتوای پیام یا زمان ویرایش با این مجوز قابل تغییر نیست.
grant update (deleted_at) on public.public_chat_messages to authenticated;

create table if not exists public.public_chat_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid references public.public_chat_messages(id) on delete set null,
  reported_user_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('توهین و بی‌احترامی','هرزنامه یا تبلیغات','محتوای نامرتبط','تهدید یا آزار','محتوای نامناسب','سایر')),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  moderator_id uuid references auth.users(id) on delete set null,
  moderator_note text not null default '' check (char_length(moderator_note) <= 2000),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint public_chat_report_has_target check (message_id is not null or reported_user_id is not null)
);

create unique index if not exists public_chat_reports_one_per_user_message_idx
  on public.public_chat_reports(reporter_id, message_id) where message_id is not null;
create index if not exists public_chat_reports_status_created_idx
  on public.public_chat_reports(status, created_at desc);
create index if not exists public_chat_reports_reporter_created_idx
  on public.public_chat_reports(reporter_id, created_at desc);

alter table public.public_chat_reports enable row level security;
revoke all on public.public_chat_reports from anon, authenticated;
grant select, insert on public.public_chat_reports to authenticated;
grant update (status, moderator_id, moderator_note, reviewed_at) on public.public_chat_reports to authenticated;

drop policy if exists public_chat_reports_insert_own on public.public_chat_reports;
create policy public_chat_reports_insert_own
on public.public_chat_reports for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and message_id is not null
  and reported_user_id is not null
  and status = 'open'
  and moderator_id is null
  and reviewed_at is null
  and moderator_note = ''
  and exists (
    select 1 from public.public_chat_messages m
    where m.id = message_id and m.sender_id = reported_user_id and m.deleted_at is null
  )
);

drop policy if exists public_chat_reports_read_own_or_moderator on public.public_chat_reports;
create policy public_chat_reports_read_own_or_moderator
on public.public_chat_reports for select to authenticated
using (
  reporter_id = (select auth.uid())
  or coalesce(auth.jwt()->'app_metadata'->>'role', '') in ('admin','super_admin','chat_moderator','content_moderator','support')
  or coalesce(auth.jwt()->'app_metadata'->'roles', '[]'::jsonb) ?| array['admin','super_admin','chat_moderator','content_moderator','support']
);

drop policy if exists public_chat_reports_update_moderator on public.public_chat_reports;
create policy public_chat_reports_update_moderator
on public.public_chat_reports for update to authenticated
using (
  coalesce(auth.jwt()->'app_metadata'->>'role', '') in ('admin','super_admin','chat_moderator','content_moderator','support')
  or coalesce(auth.jwt()->'app_metadata'->'roles', '[]'::jsonb) ?| array['admin','super_admin','chat_moderator','content_moderator','support']
)
with check (
  moderator_id = (select auth.uid())
  and status in ('reviewing','resolved','dismissed')
  and ((status = 'reviewing' and reviewed_at is null) or (status in ('resolved','dismissed') and reviewed_at is not null))
  and (
    coalesce(auth.jwt()->'app_metadata'->>'role', '') in ('admin','super_admin','chat_moderator','content_moderator','support')
    or coalesce(auth.jwt()->'app_metadata'->'roles', '[]'::jsonb) ?| array['admin','super_admin','chat_moderator','content_moderator','support']
  )
);

comment on table public.public_chat_reports is 'گزارش تخلف چت عمومی هم‌قدم؛ فقط گزارش‌دهنده و نقش‌های مورد اعتماد طبق RLS دسترسی دارند.';
commit;
