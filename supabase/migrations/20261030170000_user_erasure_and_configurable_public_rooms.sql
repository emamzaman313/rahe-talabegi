begin;

alter table public.public_chat_rooms
  add column if not exists visibility text not null default 'public',
  add column if not exists post_policy text not null default 'everyone';
alter table public.public_chat_rooms
  drop constraint if exists public_chat_rooms_visibility_check,
  add constraint public_chat_rooms_visibility_check check (visibility in ('public','private')),
  drop constraint if exists public_chat_rooms_post_policy_check,
  add constraint public_chat_rooms_post_policy_check check (post_policy in ('everyone','admins','selected'));

create or replace function private.hgd_can_read_public_chat_room(p_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.public_chat_rooms r
    where r.id=p_room_id and r.is_active
      and (r.visibility='public' or private.hgd_is_admin()
        or exists(select 1 from public.public_chat_members m where m.room_id=r.id and m.user_id=(select auth.uid())))
  ) and not public.hgd_chat_current_user_restricted(p_room_id,array['ban','kick']);
$$;
revoke all on function private.hgd_can_read_public_chat_room(uuid) from public,anon;
grant execute on function private.hgd_can_read_public_chat_room(uuid) to authenticated;

create or replace function private.hgd_can_post_public_chat_room(p_room_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.public_chat_rooms r
    where r.id=p_room_id and r.is_active
      and (private.hgd_is_admin()
        or (r.post_policy='everyone' and (r.visibility='public' or exists(select 1 from public.public_chat_members m where m.room_id=r.id and m.user_id=(select auth.uid()))))
        or (r.post_policy='selected' and exists(select 1 from public.public_chat_members m where m.room_id=r.id and m.user_id=(select auth.uid()))))
  ) and not public.hgd_chat_current_user_restricted(p_room_id,array['ban','mute','kick']);
$$;
revoke all on function private.hgd_can_post_public_chat_room(uuid) from public,anon;
grant execute on function private.hgd_can_post_public_chat_room(uuid) to authenticated;

drop policy if exists public_chat_rooms_read_active on public.public_chat_rooms;
create policy public_chat_rooms_read_active on public.public_chat_rooms for select to authenticated
using (is_active and not public.hgd_chat_current_user_restricted(id,array['ban','kick'])
  and (visibility='public' or private.hgd_is_admin() or exists(select 1 from public.public_chat_members m where m.room_id=id and m.user_id=(select auth.uid()))));

drop policy if exists public_chat_members_join_own on public.public_chat_members;
create policy public_chat_members_join_own on public.public_chat_members for insert to authenticated
with check (user_id=(select auth.uid()) and exists(select 1 from public.public_chat_rooms r where r.id=room_id and r.is_active
  and not public.hgd_chat_current_user_restricted(room_id,array['ban','kick'])
  and (private.hgd_is_admin() or (r.visibility='public' and r.post_policy<>'selected'))));

drop policy if exists public_chat_messages_read_active_rooms on public.public_chat_messages;
create policy public_chat_messages_read_active_rooms on public.public_chat_messages for select to authenticated
using (private.hgd_can_read_public_chat_room(room_id));

drop policy if exists public_chat_messages_send_as_self on public.public_chat_messages;
create policy public_chat_messages_send_as_self on public.public_chat_messages for insert to authenticated
with check (sender_id=(select auth.uid()) and private.hgd_can_post_public_chat_room(room_id)
  and (reply_to is null or exists(select 1 from public.public_chat_messages parent where parent.id=reply_to and parent.room_id=room_id and parent.deleted_at is null)));

drop policy if exists public_chat_messages_edit_own_recent on public.public_chat_messages;
create policy public_chat_messages_edit_own_recent on public.public_chat_messages for update to authenticated
using (sender_id=(select auth.uid()) and deleted_at is null and created_at>now()-interval '10 minutes' and private.hgd_can_post_public_chat_room(room_id))
with check (sender_id=(select auth.uid()) and created_at>now()-interval '10 minutes' and private.hgd_can_post_public_chat_room(room_id));

drop policy if exists public_chat_reactions_read_active on public.public_chat_reactions;
create policy public_chat_reactions_read_active on public.public_chat_reactions for select to authenticated
using (exists(select 1 from public.public_chat_messages m where m.id=message_id and private.hgd_can_read_public_chat_room(m.room_id)));
drop policy if exists public_chat_reactions_add_own on public.public_chat_reactions;
create policy public_chat_reactions_add_own on public.public_chat_reactions for insert to authenticated
with check (user_id=(select auth.uid()) and exists(select 1 from public.public_chat_messages m where m.id=message_id and m.deleted_at is null and private.hgd_can_post_public_chat_room(m.room_id)));

drop policy if exists public_chat_attachments_read_room_members on public.public_chat_attachments;
create policy public_chat_attachments_read_room_members on public.public_chat_attachments for select to authenticated
using (private.hgd_can_read_public_chat_room(room_id));
drop policy if exists public_chat_attachments_insert_own_message on public.public_chat_attachments;
create policy public_chat_attachments_insert_own_message on public.public_chat_attachments for insert to authenticated
with check (uploaded_by=(select auth.uid()) and bucket_id='hamghadam-chat-files'
  and object_path like room_id::text||'/'||(select auth.uid())::text||'/%'
  and private.hgd_can_post_public_chat_room(room_id)
  and exists(select 1 from public.public_chat_messages m where m.id=message_id and m.room_id=room_id and m.sender_id=(select auth.uid())));

drop policy if exists hamghadam_chat_files_read_room_members on storage.objects;
create policy hamghadam_chat_files_read_room_members on storage.objects for select to authenticated
using (bucket_id='hamghadam-chat-files'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and private.hgd_can_read_public_chat_room(((storage.foldername(name))[1])::uuid));

create or replace function public.admin_create_public_chat_room(
  p_title text,p_description text default '',p_icon text default '💬',p_category text default 'عمومی',
  p_visibility text default 'public',p_post_policy text default 'everyone',p_allowed_user_ids uuid[] default '{}'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_room uuid; v_ids uuid[]:=array(select distinct x from unnest(coalesce(p_allowed_user_ids,'{}'::uuid[])) x where x is not null);
begin
  if auth.uid() is null or not private.hgd_is_admin() then raise exception 'ساخت اتاق فقط برای مدیر برنامه مجاز است' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_title,''))) not between 2 and 80 then raise exception 'نام اتاق باید ۲ تا ۸۰ نویسه باشد'; end if;
  if p_visibility not in ('public','private') or p_post_policy not in ('everyone','admins','selected') then raise exception 'تنظیم دسترسی اتاق نامعتبر است'; end if;
  if cardinality(v_ids)>50 then raise exception 'حداکثر ۵۰ عضو ویژه می‌توان انتخاب کرد'; end if;
  if p_visibility='private' and cardinality(v_ids)=0 then raise exception 'برای اتاق خصوصی دست‌کم یک عضو انتخاب کن'; end if;
  if p_post_policy='selected' and cardinality(v_ids)=0 then raise exception 'برای ارسال منتخب، دست‌کم یک نفر انتخاب کن'; end if;
  if exists(select 1 from unnest(v_ids) x where not exists(select 1 from public.profiles p where p.id=x)) then raise exception 'یکی از کاربران انتخاب‌شده پیدا نشد'; end if;
  insert into public.public_chat_rooms(slug,title,description,icon,category,is_active,visibility,post_policy)
  values ('room-'||substr(replace(gen_random_uuid()::text,'-',''),1,16),left(btrim(p_title),80),left(coalesce(p_description,''),240),left(coalesce(p_icon,'💬'),12),left(coalesce(p_category,'عمومی'),40),true,p_visibility,p_post_policy)
  returning id into v_room;
  insert into public.public_chat_members(room_id,user_id)
  select v_room,x from (select unnest(v_ids) as x union select auth.uid()) invited
  on conflict(room_id,user_id) do nothing;
  perform private.hgd_write_audit('public_chat_room_created','public_chat_room',v_room::text,'',jsonb_build_object('visibility',p_visibility,'post_policy',p_post_policy));
  return v_room;
end; $$;
revoke all on function public.admin_create_public_chat_room(text,text,text,text,text,text,uuid[]) from public,anon;
grant execute on function public.admin_create_public_chat_room(text,text,text,text,text,text,uuid[]) to authenticated;

create or replace function public.admin_erase_hamghadam_user(p_actor_id uuid,p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_files jsonb; v_file_count integer;
begin
  if p_actor_id is null or p_user_id is null or p_actor_id=p_user_id then raise exception 'حساب مدیر ارشد یا شناسهٔ کاربر نامعتبر است' using errcode='42501'; end if;
  if not exists(select 1 from auth.users u where u.id=p_actor_id and (coalesce(u.raw_app_meta_data->>'role','')='super_admin' or coalesce(u.raw_app_meta_data->'roles','[]'::jsonb) ? 'super_admin')) then
    raise exception 'پاک‌سازی کامل فقط برای مدیر ارشد مجاز است' using errcode='42501';
  end if;
  if not exists(select 1 from auth.users u where u.id=p_user_id) then raise exception 'کاربر پیدا نشد'; end if;
  if exists(select 1 from auth.users u where u.id=p_user_id and (coalesce(u.raw_app_meta_data->>'role','')='super_admin' or coalesce(u.raw_app_meta_data->'roles','[]'::jsonb) ? 'super_admin')) then
    raise exception 'حذف حساب مدیر ارشد از این مسیر مجاز نیست' using errcode='42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name)),'[]'::jsonb) into v_files
  from storage.objects o where o.owner=p_user_id or o.owner_id=p_user_id::text or o.name like p_user_id::text||'/%';
  v_file_count:=jsonb_array_length(v_files);

  delete from public.public_chat_reports where reporter_id=p_user_id or reported_user_id=p_user_id or moderator_id=p_user_id
    or message_id in(select id from public.public_chat_messages where sender_id=p_user_id);
  delete from public.public_chat_user_moderation_actions where created_by=p_user_id or user_id=p_user_id;
  delete from public.community_reports where reporter_id=p_user_id or assigned_to=p_user_id or resolved_by=p_user_id
    or (target_type='user' and target_id=p_user_id::text);
  update public.app_announcements set audience_ids=array_remove(audience_ids,p_user_id) where p_user_id=any(audience_ids);
  delete from public.app_announcements where created_by=p_user_id;
  delete from public.chat_invites where created_by=p_user_id;
  delete from public.chat_messages where sender_id=p_user_id;
  delete from public.chat_polls where created_by=p_user_id;
  delete from public.chat_conversations where created_by=p_user_id;
  delete from public.debate_posts where author_id=p_user_id;
  delete from public.debate_topics where created_by=p_user_id;
  delete from public.discussion_groups where created_by=p_user_id;
  delete from public.hamghadam_quizzes where created_by=p_user_id;
  delete from public.forbidden_chat_terms where created_by=p_user_id;
  delete from public.user_moderation_actions where created_by=p_user_id or user_id=p_user_id;
  delete from public.user_notification_sequences where created_by=p_user_id or user_id=p_user_id;
  delete from public.admin_audit_logs where actor_id=p_user_id or target_id=p_user_id::text or details::text like '%'||p_user_id::text||'%';
  return jsonb_build_object('files',v_files,'file_count',v_file_count);
end; $$;
revoke all on function public.admin_erase_hamghadam_user(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_erase_hamghadam_user(uuid,uuid) to service_role;

commit;
