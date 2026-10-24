-- هم‌قدم: گفت‌وگوی عمومی زنده؛ این طرح چت خصوصی ایجاد نمی‌کند.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.public_chat_rooms (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
 title text not null check (char_length(btrim(title)) between 2 and 80),
 description text not null default '' check (char_length(description) <= 240),
 icon text not null default '💬' check (char_length(icon) <= 12),
 category text not null default 'عمومی' check (char_length(category) <= 40),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 last_message_at timestamptz not null default now()
);

create table if not exists public.public_chat_members (
 room_id uuid not null references public.public_chat_rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(),
 last_read_at timestamptz not null default now(),
 primary key(room_id,user_id)
);

create table if not exists public.public_chat_messages (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references public.public_chat_rooms(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 sender_name text not null default 'هم‌قدم' check (char_length(sender_name) <= 60),
 body text not null check (char_length(btrim(body)) between 1 and 3000),
 reply_to uuid references public.public_chat_messages(id) on delete set null,
 edited_at timestamptz,
 deleted_at timestamptz,
 created_at timestamptz not null default now()
);

create index if not exists public_chat_messages_room_created_idx
on public.public_chat_messages(room_id,created_at desc);

create index if not exists public_chat_messages_sender_created_idx
on public.public_chat_messages(sender_id,created_at desc);

create index if not exists public_chat_members_user_idx
on public.public_chat_members(user_id,room_id);

create table if not exists public.public_chat_reactions (
 message_id uuid not null references public.public_chat_messages(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 emoji text not null check (emoji in ('👍','❤️','😂','🤝','🙏','💡')),
 created_at timestamptz not null default now(),
 primary key(message_id,user_id,emoji)
);

alter table public.public_chat_rooms enable row level security;
alter table public.public_chat_members enable row level security;
alter table public.public_chat_messages enable row level security;
alter table public.public_chat_reactions enable row level security;

drop policy if exists public_chat_rooms_read_active on public.public_chat_rooms;
create policy public_chat_rooms_read_active
on public.public_chat_rooms for select to authenticated using (is_active);

drop policy if exists public_chat_members_read_own on public.public_chat_members;
create policy public_chat_members_read_own
on public.public_chat_members for select to authenticated
using (user_id=(select auth.uid()));

drop policy if exists public_chat_members_join_own on public.public_chat_members;
create policy public_chat_members_join_own
on public.public_chat_members for insert to authenticated
with check (
 user_id=(select auth.uid())
 and exists(select 1 from public.public_chat_rooms r
 where r.id=room_id and r.is_active)
);

drop policy if exists public_chat_members_update_own on public.public_chat_members;
create policy public_chat_members_update_own
on public.public_chat_members for update to authenticated
using(user_id=(select auth.uid()))
with check(user_id=(select auth.uid()));

drop policy if exists public_chat_messages_read_active_rooms on public.public_chat_messages;
create policy public_chat_messages_read_active_rooms
on public.public_chat_messages for select to authenticated
using (
 exists(select 1 from public.public_chat_rooms r
 where r.id=room_id and r.is_active)
);

drop policy if exists public_chat_messages_send_as_self on public.public_chat_messages;
create policy public_chat_messages_send_as_self
on public.public_chat_messages for insert to authenticated
with check (
 sender_id=(select auth.uid())
 and exists(select 1 from public.public_chat_rooms r
 where r.id=room_id and r.is_active)
 and (
  reply_to is null
  or exists(select 1 from public.public_chat_messages parent
  where parent.id=reply_to
  and parent.room_id=public_chat_messages.room_id
  and parent.deleted_at is null)
 )
);

drop policy if exists public_chat_messages_edit_own_recent on public.public_chat_messages;
create policy public_chat_messages_edit_own_recent
on public.public_chat_messages for update to authenticated
using(
 sender_id=(select auth.uid())
 and deleted_at is null
 and created_at>now()-interval '10 minutes'
 and exists(select 1 from public.public_chat_rooms r
 where r.id=room_id and r.is_active)
)
with check(
 sender_id=(select auth.uid())
 and created_at>now()-interval '10 minutes'
 and exists(select 1 from public.public_chat_rooms r
 where r.id=room_id and r.is_active)
);

drop policy if exists public_chat_reactions_read_active on public.public_chat_reactions;
create policy public_chat_reactions_read_active
on public.public_chat_reactions for select to authenticated
using (
 exists(select 1 from public.public_chat_messages m
 join public.public_chat_rooms r on r.id=m.room_id
 where m.id=message_id and r.is_active)
);

drop policy if exists public_chat_reactions_add_own on public.public_chat_reactions;
create policy public_chat_reactions_add_own
on public.public_chat_reactions for insert to authenticated
with check (
 user_id=(select auth.uid())
 and exists(select 1 from public.public_chat_messages m
 join public.public_chat_rooms r on r.id=m.room_id
 where m.id=message_id and r.is_active and m.deleted_at is null)
);

drop policy if exists public_chat_reactions_remove_own on public.public_chat_reactions;
create policy public_chat_reactions_remove_own
on public.public_chat_reactions for delete to authenticated
using(user_id=(select auth.uid()));

revoke all on table public.public_chat_rooms from anon,authenticated;
revoke all on table public.public_chat_members from anon,authenticated;
revoke all on table public.public_chat_messages from anon,authenticated;
revoke all on table public.public_chat_reactions from anon,authenticated;

grant select on public.public_chat_rooms to authenticated;
grant select on public.public_chat_members to authenticated;
grant insert(room_id,user_id) on public.public_chat_members to authenticated;
grant update(last_read_at) on public.public_chat_members to authenticated;
grant select on public.public_chat_messages to authenticated;
grant insert(room_id,sender_id,body,reply_to) on public.public_chat_messages to authenticated;
grant update(body,edited_at,deleted_at) on public.public_chat_messages to authenticated;
grant select on public.public_chat_reactions to authenticated;
grant insert(message_id,user_id,emoji) on public.public_chat_reactions to authenticated;
grant delete on public.public_chat_reactions to authenticated;

create or replace function private.prepare_public_chat_message()
returns trigger
language plpgsql
security definer
set search_path='' as $$
declare
 v_name text;
 v_recent_count integer;
begin
 if new.sender_id is distinct from auth.uid() then
  raise exception 'sender_id does not match current user';
 end if;

 select count(*) into v_recent_count
 from public.public_chat_messages
 where sender_id=new.sender_id
 and created_at>pg_catalog.now()-interval '10 seconds';

 if v_recent_count>=5 then
  raise exception 'برای جلوگیری از هرزنامه، کمی آهسته‌تر پیام بفرست.'
  using errcode='P0001';
 end if;

 select nullif(pg_catalog.btrim(p.display_name),'')
 into v_name
 from public.profiles p
 where p.id=new.sender_id;

 new.sender_name:=pg_catalog.left(
  coalesce(
   v_name,
   nullif(pg_catalog.split_part(auth.jwt()->>'email','@',1),''),
   'هم‌قدم'
  ),60
 );

 return new;
end $$;

revoke all on function private.prepare_public_chat_message()
from public,anon,authenticated;

create or replace function private.stamp_public_chat_message_edit()
returns trigger
language plpgsql
set search_path='' as $$
begin
 if new.body is distinct from old.body then
  new.edited_at:=pg_catalog.now();
 end if;

 if old.deleted_at is null and new.deleted_at is not null then
  new.body:='این پیام حذف شد.';
  new.edited_at:=pg_catalog.now();
 end if;

 return new;
end $$;

revoke all on function private.stamp_public_chat_message_edit()
from public,anon,authenticated;

create or replace function private.bump_public_chat_room_activity()
returns trigger
language plpgsql
security definer
set search_path='' as $$
begin
 update public.public_chat_rooms
 set last_message_at=pg_catalog.now()
 where id=new.room_id;

 return new;
end $$;

revoke all on function private.bump_public_chat_room_activity()
from public,anon,authenticated;

drop trigger if exists public_chat_message_identity_and_rate_limit
on public.public_chat_messages;

create trigger public_chat_message_identity_and_rate_limit
before insert on public.public_chat_messages
for each row execute function private.prepare_public_chat_message();

drop trigger if exists public_chat_message_edit_stamp
on public.public_chat_messages;

create trigger public_chat_message_edit_stamp
before update of body,deleted_at on public.public_chat_messages
for each row execute function private.stamp_public_chat_message_edit();

drop trigger if exists public_chat_room_activity
on public.public_chat_messages;

create trigger public_chat_room_activity
after insert on public.public_chat_messages
for each row execute function private.bump_public_chat_room_activity();

insert into public.public_chat_rooms(slug,title,description,icon,category)
values
 ('general','گفت‌وگوی همگانی','گفت‌وگوی آزاد، محترمانه و دوستانه برای اعضای هم‌قدم.','💬','عمومی'),
 ('study','درس و مباحثه','پرسش درسی، تجربهٔ مطالعه و گفت‌وگوی علمی.','📚','مطالعه'),
 ('nahw-sarf','نحو و صرف','تمرین عربی، قواعد، اعراب و رفع اشکال.','🪶','آموزشی'),
 ('talabegi','مسیر طلبگی','تجربه‌ها و پرسش‌های عمومی دربارهٔ مسیر طلبگی.','🌱','هم‌قدم')
on conflict(slug) do update set
 title=excluded.title,
 description=excluded.description,
 icon=excluded.icon,
 category=excluded.category;

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
   and schemaname='public' and tablename='public_chat_rooms') then
   execute 'alter publication supabase_realtime add table public.public_chat_rooms';
  end if;

  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
   and schemaname='public' and tablename='public_chat_members') then
   execute 'alter publication supabase_realtime add table public.public_chat_members';
  end if;

  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
   and schemaname='public' and tablename='public_chat_messages') then
   execute 'alter publication supabase_realtime add table public.public_chat_messages';
  end if;

  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
   and schemaname='public' and tablename='public_chat_reactions') then
   execute 'alter publication supabase_realtime add table public.public_chat_reactions';
  end if;
 end if;
end $$;
