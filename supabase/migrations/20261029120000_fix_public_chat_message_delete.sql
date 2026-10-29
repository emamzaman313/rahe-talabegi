-- هم‌قدم: اصلاح مجوز حذف نرم پیام‌های گفت‌وگوی عمومی
-- این migration را پس از migrationهای قبلی اجرا کنید؛ هیچ داده‌ای حذف نمی‌شود.

alter table public.public_chat_messages enable row level security;

-- نویسنده بتواند پیام خودش را در هر زمانی به «این پیام حذف شد» تبدیل کند.
-- محدودیت ۱۰ دقیقه‌ای ویرایش متن دست‌نخورده می‌ماند؛ این policy فقط برای حذف نرم است.
drop policy if exists public_chat_messages_delete_own on public.public_chat_messages;
create policy public_chat_messages_delete_own
on public.public_chat_messages
for update to authenticated
using (
  sender_id = (select auth.uid())
  and deleted_at is null
)
with check (
  sender_id = (select auth.uid())
  and deleted_at is not null
  and body = 'این پیام حذف شد.'
);

-- مدیر یا ناظر چت می‌تواند هر پیام را حذف نرم کند؛ این policy به‌تنهایی اجازهٔ
-- ویرایش متن پیام دیگران را نمی‌دهد، چون شرط WITH CHECK فقط نسخهٔ حذف‌شده را می‌پذیرد.
drop policy if exists public_chat_messages_moderator_delete on public.public_chat_messages;
create policy public_chat_messages_moderator_delete
on public.public_chat_messages
for update to authenticated
using (
  deleted_at is null
  and (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','super_admin','chat_moderator','content_moderator','support')
    or coalesce(auth.jwt() -> 'app_metadata' -> 'roles', '[]'::jsonb) ?| array['admin','super_admin','chat_moderator','content_moderator','support']
  )
)
with check (
  deleted_at is not null
  and body = 'این پیام حذف شد.'
  and (
    coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','super_admin','chat_moderator','content_moderator','support')
    or coalesce(auth.jwt() -> 'app_metadata' -> 'roles', '[]'::jsonb) ?| array['admin','super_admin','chat_moderator','content_moderator','support']
  )
);

-- ستون‌های مورد استفادهٔ حذف نرم از قبل در migration اصلی مجاز شده‌اند؛ این grant
-- تکرارپذیر است و برای اطمینان از دسترسی نقش authenticated درج می‌شود.
grant update (body, edited_at, deleted_at)
on public.public_chat_messages to authenticated;

comment on policy public_chat_messages_delete_own on public.public_chat_messages is
'Allows an authenticated sender to soft-delete their own message at any time.';
comment on policy public_chat_messages_moderator_delete on public.public_chat_messages is
'Allows admin/support/chat moderators to soft-delete messages; it does not authorize changing message text.';
