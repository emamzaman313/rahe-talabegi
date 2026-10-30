-- Custom ranks do not override the built-in owner/admin/moderator permissions.
-- Keep privileged members out of the custom-rank flow and enforce the same rule server-side.
create or replace function public.set_chat_member_role(p_conversation_id uuid,p_user_id uuid,p_role_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_actor_role text; v_target_role text;
begin
 if auth.uid() is null or not private.hgd_chat_has_permission(p_conversation_id,'manage_members') then raise exception 'اجازهٔ مدیریت اعضا را نداری' using errcode='42501'; end if;
 if p_role_code is not null and p_role_code not in ('reader','participant','helper','greeter','scribe','resource_curator','poll_creator','event_host','member_support','trusted_member','topic_starter','discussion_guide','content_reviewer','question_curator','study_leader','voice_host','welcome_guide','community_ambassador','mentor','senior_mentor','chat_moderator','content_moderator','safety_moderator','member_manager','invite_manager','poll_manager','pin_manager','channel_editor','community_manager','deputy_owner') then raise exception 'رتبهٔ انتخابی معتبر نیست'; end if;
 if p_user_id=auth.uid() then raise exception 'نمی‌توانی رتبهٔ خودت را تغییر دهی' using errcode='42501'; end if;
 select member_role into v_actor_role from public.chat_members where conversation_id=p_conversation_id and user_id=auth.uid();
 if v_actor_role not in ('owner','admin') then raise exception 'فقط مالک یا مدیر اصلی می‌تواند رتبهٔ اعضا را تغییر دهد' using errcode='42501'; end if;
 select member_role into v_target_role from public.chat_members where conversation_id=p_conversation_id and user_id=p_user_id;
 if not found then raise exception 'عضو گفتگو پیدا نشد'; end if;
 if v_target_role in ('owner','admin','moderator') then raise exception 'رتبهٔ سفارشی فقط برای اعضای عادی است؛ نقش مالک، مدیر یا ناظر را از مسیر مدیریت نقش‌ها تغییر بده' using errcode='42501'; end if;
 update public.chat_members set custom_role_code=p_role_code where conversation_id=p_conversation_id and user_id=p_user_id;
 insert into public.in_app_notifications(user_id,title,body,kind,action_url,accent_color,icon)
 values(p_user_id,'رتبهٔ گفت‌وگویت تغییر کرد',case when p_role_code is null then 'مدیر رتبهٔ سفارشی تو را برداشت.' else 'رتبهٔ تازهٔ تو: '||p_role_code end,'system','/index.html?open=chats','#176b67','🏷️');
 perform private.hgd_write_audit('chat_member_custom_role_set','chat_member',p_conversation_id::text,'',jsonb_build_object('target_user_id',p_user_id,'role_code',p_role_code));
 return true;
end; $$;
revoke all on function public.set_chat_member_role(uuid,uuid,text) from public,anon;
grant execute on function public.set_chat_member_role(uuid,uuid,text) to authenticated;
