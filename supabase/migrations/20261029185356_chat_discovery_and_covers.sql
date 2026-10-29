begin;

alter table public.chat_conversations
  add column if not exists cover_path text;

create or replace function public.search_chat_users(p_query text)
returns table(id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, left(coalesce(nullif(btrim(p.display_name), ''), 'کاربر هم‌قدم'), 60)
  from public.profiles p
  where auth.uid() is not null
    and char_length(btrim(coalesce(p_query, ''))) >= 2
    and p.id <> (select auth.uid())
    and p.display_name ilike '%' || left(btrim(p_query), 60) || '%'
  order by p.display_name asc
  limit 20;
$$;
revoke all on function public.search_chat_users(text) from public, anon;
grant execute on function public.search_chat_users(text) to authenticated;

create or replace function public.set_chat_conversation_cover(p_conversation_id uuid, p_cover_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_cover_path is null
     or p_cover_path !~ ('^' || p_conversation_id::text || '/' || auth.uid()::text || '/[a-f0-9-]+\.(png|jpg|webp)$') then
    raise exception 'Invalid conversation cover';
  end if;
  update public.chat_conversations c
     set cover_path = p_cover_path
   where c.id = p_conversation_id
     and c.created_by = (select auth.uid())
     and c.kind in ('group', 'channel');
  if not found then raise exception 'Conversation not found or not owned by current user'; end if;
end;
$$;
revoke all on function public.set_chat_conversation_cover(uuid, text) from public, anon;
grant execute on function public.set_chat_conversation_cover(uuid, text) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('hamghadam-conversation-covers', 'hamghadam-conversation-covers', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/png','image/jpeg','image/webp'];

drop policy if exists hgd_chat_covers_insert on storage.objects;
create policy hgd_chat_covers_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'hamghadam-conversation-covers'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.chat_conversations c
    where c.id::text = (storage.foldername(name))[1]
      and c.created_by = (select auth.uid())
      and c.kind in ('group','channel')
  )
);

drop policy if exists hgd_chat_covers_delete_own on storage.objects;
create policy hgd_chat_covers_delete_own on storage.objects for delete to authenticated
using (
  bucket_id = 'hamghadam-conversation-covers'
  and (storage.foldername(name))[2] = (select auth.uid())::text
);

commit;

