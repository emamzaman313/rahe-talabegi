create or replace function public.assign_discussion_leader(p_group_id uuid,p_user_id uuid,p_assign boolean default true)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_owner uuid; v_group_title text; v_previous_leader uuid;
begin
 if auth.uid() is null then raise exception 'ابتدا وارد حساب شو' using errcode='42501'; end if;
 select created_by,title into v_owner,v_group_title from public.discussion_groups where id=p_group_id for update;
 if not found then raise exception 'گروه پیدا نشد'; end if;
 if v_owner<>auth.uid() and not private.hgd_is_admin() then raise exception 'اجازهٔ تغییر مسئول بحث را نداری' using errcode='42501'; end if;
 if p_assign and not exists(select 1 from public.discussion_group_members where group_id=p_group_id and user_id=p_user_id) then raise exception 'مسئول باید عضو همین گروه باشد'; end if;
 select user_id into v_previous_leader from public.discussion_group_members where group_id=p_group_id and member_role='discussion_leader' limit 1;
 if p_assign and v_previous_leader=p_user_id then return true; end if;
 if p_assign then
  update public.discussion_group_members set member_role='member' where group_id=p_group_id and member_role='discussion_leader' and user_id<>p_user_id;
  update public.discussion_group_members set member_role='discussion_leader' where group_id=p_group_id and user_id=p_user_id;
 else
  update public.discussion_group_members set member_role='member' where group_id=p_group_id and user_id=p_user_id and member_role='discussion_leader';
  if not found then v_previous_leader:=null; end if;
 end if;
 if v_previous_leader is not null and (not p_assign or v_previous_leader<>p_user_id) then
  insert into public.in_app_notifications(user_id,title,body,kind,action_url,accent_color,icon)
  values(v_previous_leader,'مسئولیت مباحثه تغییر کرد','مسئولیت ریاست گروه «'||v_group_title||'» از شما گرفته شد.','system','/index.html?open=chats','#64748b','↘️');
 end if;
 if p_assign then
  insert into public.in_app_notifications(user_id,title,body,kind,action_url,accent_color,icon)
  values(p_user_id,'مسئول مباحثه شدی','مدیر تو را مسئول گروه «'||v_group_title||'» کرد. مبارکت باشد!','success','/index.html?open=chats','#168574','🎖️');
 end if;
 perform private.hgd_write_audit(case when p_assign then 'discussion_leader_assigned' else 'discussion_leader_revoked' end,'discussion_group',p_group_id::text,'',jsonb_build_object('user_id',p_user_id));
 return true;
end; $$;
revoke all on function public.assign_discussion_leader(uuid,uuid,boolean) from public,anon;
grant execute on function public.assign_discussion_leader(uuid,uuid,boolean) to authenticated;
