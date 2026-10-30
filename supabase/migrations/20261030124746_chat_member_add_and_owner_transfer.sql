begin;

drop policy if exists hgd_profile_avatars_read_own on storage.objects;
create policy hgd_profile_avatars_read_own on storage.objects for select to authenticated
using (bucket_id='profile-avatars' and (storage.foldername(name))[1]=(select auth.uid())::text);

create or replace function public.add_chat_member(p_conversation_id uuid,p_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v public.chat_conversations%rowtype; v_count integer;
begin
 if auth.uid() is null or p_user_id is null or p_user_id=auth.uid() then raise exception 'کاربر مقصد نامعتبر است' using errcode='42501'; end if;
 select * into v from public.chat_conversations where id=p_conversation_id and is_active for update;
 if not found or v.kind not in ('group','channel') then raise exception 'گروه یا کانال پیدا نشد'; end if;
 if not private.hgd_can_manage_chat(p_conversation_id) then raise exception 'فقط مالک یا مدیر گفتگو می‌تواند عضو اضافه کند' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'کاربر پیدا نشد'; end if;
 if exists(select 1 from public.chat_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p_user_id) or (b.blocker_id=p_user_id and b.blocked_id=auth.uid())) then raise exception 'افزودن عضو به دلیل تنظیم حریم خصوصی ممکن نیست' using errcode='42501'; end if;
 select count(*) into v_count from public.chat_members where conversation_id=p_conversation_id;
 if not private.hgd_is_admin() and v_count>=11 then raise exception 'ظرفیت گروه به ۱۰ عضو دعوت‌شده به‌علاوهٔ سازنده رسیده است'; end if;
 insert into public.chat_members(conversation_id,user_id,member_role)
 values(p_conversation_id,p_user_id,case when v.kind='channel' then 'subscriber' else 'member' end)
 on conflict(conversation_id,user_id) do nothing;
 if not exists(select 1 from public.chat_members where conversation_id=p_conversation_id and user_id=p_user_id) then raise exception 'افزودن عضو انجام نشد'; end if;
 perform private.hgd_write_audit('chat_member_added','chat_conversation',p_conversation_id::text,'',jsonb_build_object('user_id',p_user_id));
 return true;
end; $$;
revoke all on function public.add_chat_member(uuid,uuid) from public,anon;
grant execute on function public.add_chat_member(uuid,uuid) to authenticated;

create or replace function public.transfer_chat_ownership(p_conversation_id uuid,p_new_owner_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_old_owner uuid;
begin
 if auth.uid() is null or p_new_owner_id is null or p_new_owner_id=auth.uid() then raise exception 'مالک تازه نامعتبر است' using errcode='42501'; end if;
 select user_id into v_old_owner from public.chat_members where conversation_id=p_conversation_id and member_role='owner' for update;
 if v_old_owner is distinct from auth.uid() then raise exception 'فقط مالک فعلی می‌تواند مالکیت را منتقل کند' using errcode='42501'; end if;
 if not exists(select 1 from public.chat_members where conversation_id=p_conversation_id and user_id=p_new_owner_id) then raise exception 'مالک تازه باید اول عضو همین گفتگو باشد'; end if;
 update public.chat_members set member_role='member',custom_role_code='reader' where conversation_id=p_conversation_id and user_id=v_old_owner;
 update public.chat_members set member_role='owner',custom_role_code=null where conversation_id=p_conversation_id and user_id=p_new_owner_id;
 perform private.hgd_write_audit('chat_ownership_transferred','chat_conversation',p_conversation_id::text,'',jsonb_build_object('previous_owner',v_old_owner,'new_owner',p_new_owner_id));
 return true;
end; $$;
revoke all on function public.transfer_chat_ownership(uuid,uuid) from public,anon;
grant execute on function public.transfer_chat_ownership(uuid,uuid) to authenticated;

commit;
