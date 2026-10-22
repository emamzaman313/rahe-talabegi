-- راهِ طلبگی — پشتیبانی خصوصی
-- Apply with the Supabase SQL Editor or the Supabase CLI migration workflow.
-- The client must use only the project's publishable key. Never place service_role keys in the app.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

grant usage on schema public to authenticated;

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null default '',
  subject text not null default 'درخواست پشتیبانی'
    check (char_length(btrim(subject)) between 1 and 160),
  status text not null default 'open'
    check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('user', 'support')),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists support_conversations_user_last_message_idx
  on public.support_conversations (user_id, last_message_at desc);
create index if not exists support_conversations_last_message_idx
  on public.support_conversations (last_message_at desc);
create index if not exists support_messages_conversation_created_idx
  on public.support_messages (conversation_id, created_at asc);

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;

-- User email comes from the authenticated JWT, never from a value supplied by the client.
create or replace function private.set_support_conversation_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.user_email := coalesce(auth.jwt() ->> 'email', '');
  return new;
end;
$$;
revoke all on function private.set_support_conversation_identity() from public, anon, authenticated;

drop trigger if exists support_conversation_identity on public.support_conversations;
create trigger support_conversation_identity
before insert on public.support_conversations
for each row execute function private.set_support_conversation_identity();

-- Bump conversation activity and status when a new immutable message is sent.
-- The SECURITY DEFINER function is isolated in the non-exposed private schema and is not callable by app roles.
create or replace function private.bump_support_conversation_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.support_conversations
     set updated_at = pg_catalog.now(),
         last_message_at = pg_catalog.now(),
         status = case when new.sender_role = 'user' then 'open' else 'answered' end
   where id = new.conversation_id;
  return new;
end;
$$;
revoke all on function private.bump_support_conversation_activity() from public, anon, authenticated;

drop trigger if exists support_message_activity on public.support_messages;
create trigger support_message_activity
after insert on public.support_messages
for each row execute function private.bump_support_conversation_activity();

-- Read a conversation only if it belongs to the signed-in user or the user is a trusted support agent.
drop policy if exists support_conversations_read_own_or_agent on public.support_conversations;
create policy support_conversations_read_own_or_agent
on public.support_conversations for select to authenticated
using (
  user_id = (select auth.uid())
  or (auth.jwt() -> 'app_metadata' ->> 'role') = 'support'
);

drop policy if exists support_conversations_create_own on public.support_conversations;
create policy support_conversations_create_own
on public.support_conversations for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'open'
);

drop policy if exists support_conversations_update_agent on public.support_conversations;
create policy support_conversations_update_agent
on public.support_conversations for update to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'support')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'support');

-- Message text is immutable in the client API. Users and support agents may only create messages
-- with their own sender id and the corresponding allowed role.
drop policy if exists support_messages_read_conversation on public.support_messages;
create policy support_messages_read_conversation
on public.support_messages for select to authenticated
using (
  exists (
    select 1 from public.support_conversations c
    where c.id = support_messages.conversation_id
      and (
        c.user_id = (select auth.uid())
        or (auth.jwt() -> 'app_metadata' ->> 'role') = 'support'
      )
  )
);

drop policy if exists support_messages_create_user_or_agent on public.support_messages;
create policy support_messages_create_user_or_agent
on public.support_messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and (
    (
      sender_role = 'user'
      and exists (
        select 1 from public.support_conversations c
        where c.id = support_messages.conversation_id
          and c.user_id = (select auth.uid())
          and c.status <> 'closed'
      )
    )
    or
    (
      sender_role = 'support'
      and (auth.jwt() -> 'app_metadata' ->> 'role') = 'support'
      and exists (
        select 1 from public.support_conversations c
        where c.id = support_messages.conversation_id
      )
    )
  )
);

-- Least-privilege grants in addition to RLS: no client writes to ids or database-owned timestamps,
-- and no client update/delete privileges on messages.
revoke all on table public.support_conversations from anon, authenticated;
revoke all on table public.support_messages from anon, authenticated;
grant select on table public.support_conversations to authenticated;
grant insert (user_id, subject) on table public.support_conversations to authenticated;
grant update (status) on table public.support_conversations to authenticated;
grant select on table public.support_messages to authenticated;
grant insert (conversation_id, sender_id, sender_role, body) on table public.support_messages to authenticated;

-- Enable Postgres Changes for these tables if the standard Supabase Realtime publication exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_conversations'
    ) then
      execute 'alter publication supabase_realtime add table public.support_conversations';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_messages'
    ) then
      execute 'alter publication supabase_realtime add table public.support_messages';
    end if;
  end if;
end $$;
