begin;

-- Users must explicitly confirm their study stage; avatars stay tied to the
-- authenticated user's own storage folder.
alter table public.profiles
  add column if not exists stage_confirmed boolean not null default false,
  add column if not exists avatar_path text;

revoke insert, update on table public.profiles from authenticated;
grant insert (id, display_name, stage, stage_confirmed, free_minutes, study_style)
  on public.profiles to authenticated;
grant update (display_name, stage, stage_confirmed, avatar_path, free_minutes, study_style)
  on public.profiles to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=true,file_size_limit=5242880,allowed_mime_types=array['image/png','image/jpeg','image/webp'];

drop policy if exists hgd_profile_avatars_insert_own on storage.objects;
create policy hgd_profile_avatars_insert_own on storage.objects for insert to authenticated
with check (bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text and name ~ '^[0-9a-f-]+/avatar\.(png|jpg|webp)$');
drop policy if exists hgd_profile_avatars_update_own on storage.objects;
create policy hgd_profile_avatars_update_own on storage.objects for update to authenticated
using (bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check (bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text and name ~ '^[0-9a-f-]+/avatar\.(png|jpg|webp)$');
drop policy if exists hgd_profile_avatars_delete_own on storage.objects;
create policy hgd_profile_avatars_delete_own on storage.objects for delete to authenticated
using (bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Public groups and channels can both be discovered and joined.
create or replace function private.hgd_can_read_chat(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.chat_conversations c where c.id=p_conversation_id and c.is_active and ((c.kind in ('group','channel') and c.visibility='public') or exists(select 1 from public.chat_members m where m.conversation_id=c.id and m.user_id=auth.uid()))) or private.hgd_is_chat_moderator();
$$;

drop policy if exists hgd_chat_conversations_read on public.chat_conversations;
create policy hgd_chat_conversations_read on public.chat_conversations for select to authenticated using (
 (visibility='public' and kind in ('group','channel') and is_active) or exists(select 1 from public.chat_members m where m.conversation_id=id and m.user_id=(select auth.uid())) or private.hgd_is_chat_moderator()
);
drop policy if exists hgd_chat_conversations_create on public.chat_conversations;
create policy hgd_chat_conversations_create on public.chat_conversations for insert to authenticated with check (created_by=(select auth.uid()) and kind in ('group','channel') and visibility in ('private','public') and direct_key is null);
drop policy if exists hgd_chat_messages_read on public.chat_messages;
create policy hgd_chat_messages_read on public.chat_messages for select to authenticated using (
 exists(select 1 from public.chat_conversations c where c.id=conversation_id and c.is_active and (private.hgd_is_chat_moderator() or (c.visibility='public' and c.kind in ('group','channel')) or exists(select 1 from public.chat_members m where m.conversation_id=c.id and m.user_id=(select auth.uid()))))
 and (deleted_at is null or sender_id=(select auth.uid()) or private.hgd_is_chat_moderator())
);

create or replace function public.create_chat_conversation(p_kind text,p_title text,p_visibility text default 'private',p_description text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'ابتدا وارد حساب شو' using errcode='42501'; end if;
 if p_kind not in ('group','channel') or p_visibility not in ('private','public') then raise exception 'نوع گفتگو یا حریم خصوصی نامعتبر است'; end if;
 perform private.hgd_assert_can_post(case when p_kind='channel' then 'channel' else 'group' end);
 insert into public.chat_conversations(kind,visibility,title,description,created_by)
 values(p_kind,p_visibility,left(btrim(p_title),120),left(coalesce(p_description,''),1200),auth.uid()) returning id into v_id;
 insert into public.chat_members(conversation_id,user_id,member_role) values(v_id,auth.uid(),'owner');
 perform private.hgd_write_audit('chat_conversation_created',p_kind,v_id::text,'',jsonb_build_object('visibility',p_visibility));
 return v_id;
end; $$;

drop function if exists public.search_chat_users(text);
create function public.search_chat_users(p_query text)
returns table(id uuid, display_name text, avatar_path text)
language sql stable security definer set search_path = '' as $$
  select p.id,left(coalesce(nullif(btrim(p.display_name),''),'کاربر هم‌قدم'),60),p.avatar_path
  from public.profiles p
  where auth.uid() is not null and char_length(btrim(coalesce(p_query,'')))>=2
    and p.id<>(select auth.uid()) and p.display_name ilike '%'||left(btrim(p_query),60)||'%'
  order by p.display_name asc limit 20;
$$;
revoke all on function public.search_chat_users(text) from public,anon;
grant execute on function public.search_chat_users(text) to authenticated;

create or replace function public.get_chat_profile_cards(p_user_ids uuid[])
returns table(id uuid,display_name text,avatar_path text)
language sql stable security definer set search_path = '' as $$
  select p.id,left(coalesce(nullif(btrim(p.display_name),''),'کاربر هم‌قدم'),60),p.avatar_path
  from public.profiles p
  where auth.uid() is not null and p.id=any(coalesce(p_user_ids,'{}'::uuid[]))
    and (p.id=(select auth.uid())
      or exists(select 1 from public.chat_members me join public.chat_members peer using(conversation_id) where me.user_id=(select auth.uid()) and peer.user_id=p.id)
      or exists(select 1 from public.public_chat_members me join public.public_chat_members peer using(room_id) where me.user_id=(select auth.uid()) and peer.user_id=p.id))
  limit 250;
$$;
revoke all on function public.get_chat_profile_cards(uuid[]) from public,anon;
grant execute on function public.get_chat_profile_cards(uuid[]) to authenticated;

commit;
