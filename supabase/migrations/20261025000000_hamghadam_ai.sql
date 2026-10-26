-- هم‌قدم: ذخیره امن گفت‌وگوهای دستیار هوشمند و سهمیهٔ درخواست
-- این migration باید روی همان پروژه Supabase اجرا شود که اپ به آن متصل است.
-- کلید ارائه‌دهندهٔ مدل فقط در Secrets تابع Edge نگهداری شود؛ هرگز در اپ قرار نگیرد.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'گفت‌وگوی تازه'
    check (char_length(btrim(title)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(btrim(content)) between 1 and 12000),
  created_at timestamptz not null default now()
);

create index if not exists ai_conversations_owner_updated_idx
  on public.ai_conversations (user_id, updated_at desc);
create index if not exists ai_messages_conversation_created_idx
  on public.ai_messages (conversation_id, created_at asc);
create index if not exists ai_messages_owner_created_idx
  on public.ai_messages (user_id, created_at desc);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists ai_conversations_read_own on public.ai_conversations;
create policy ai_conversations_read_own
  on public.ai_conversations for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists ai_messages_read_own on public.ai_messages;
create policy ai_messages_read_own
  on public.ai_messages for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.user_id = (select auth.uid())
    )
  );

-- Browser/mobile clients can read only their own history. All writes are done by the
-- authenticated Edge Function using a server-only service-role client.
revoke all on table public.ai_conversations from anon, authenticated;
revoke all on table public.ai_messages from anon, authenticated;
grant select on table public.ai_conversations to authenticated;
grant select on table public.ai_messages to authenticated;

create table if not exists public.ai_rate_windows (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);
alter table public.ai_rate_windows enable row level security;
revoke all on table public.ai_rate_windows from public, anon, authenticated;

create or replace function public.consume_hamghadam_ai_quota(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'user id required' using errcode = '22004';
  end if;

  insert into public.ai_rate_windows (user_id, window_started_at, request_count)
  values (p_user_id, v_now, 1)
  on conflict (user_id) do update
    set window_started_at = case
          when public.ai_rate_windows.window_started_at <= v_now - interval '1 minute' then v_now
          else public.ai_rate_windows.window_started_at
        end,
        request_count = case
          when public.ai_rate_windows.window_started_at <= v_now - interval '1 minute' then 1
          else public.ai_rate_windows.request_count + 1
        end
  returning request_count into v_count;

  return v_count;
end;
$$;

revoke all on function public.consume_hamghadam_ai_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_hamghadam_ai_quota(uuid) to service_role;
