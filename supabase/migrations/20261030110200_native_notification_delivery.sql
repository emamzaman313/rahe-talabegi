-- Make user-scoped in-app notifications available to signed-in native clients.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'in_app_notifications') then
    alter publication supabase_realtime add table public.in_app_notifications;
  end if;
end $$;

-- Thirty assignable presets use explicit permission sets enforced by database policies.
alter table public.chat_members add column if not exists custom_role_code text;
alter table public.chat_members drop constraint if exists chat_members_custom_role_code_check;
alter table public.chat_members add constraint chat_members_custom_role_code_check check (custom_role_code is null or custom_role_code in (
 'reader','participant','helper','greeter','scribe','resource_curator','poll_creator','event_host','member_support','trusted_member',
 'topic_starter','discussion_guide','content_reviewer','question_curator','study_leader','voice_host','welcome_guide','community_ambassador','mentor','senior_mentor',
 'chat_moderator','content_moderator','safety_moderator','member_manager','invite_manager','poll_manager','pin_manager','channel_editor','community_manager','deputy_owner'
));

create or replace function private.hgd_chat_has_permission(p_conversation_id uuid,p_permission text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_role text; v_permissions text[] := array[]::text[];
begin
 if auth.uid() is null then return false; end if;
 if private.hgd_is_admin() then return true; end if;
 select m.member_role into v_role from public.chat_members m
 where m.conversation_id=p_conversation_id and m.user_id=auth.uid();
 if not found then return false; end if;
 if v_role in ('owner','admin','moderator') then return true; end if;
 select case m.custom_role_code
  when 'reader' then array[]::text[]
  when 'participant' then array['send_messages','create_polls']
  when 'helper' then array['send_messages','invite_members']
  when 'greeter' then array['send_messages','invite_members']
  when 'scribe' then array['send_messages','create_polls','pin_messages']
  when 'resource_curator' then array['send_messages','pin_messages']
  when 'poll_creator' then array['send_messages','create_polls']
  when 'event_host' then array['send_messages','create_polls','pin_messages']
  when 'member_support' then array['send_messages','invite_members']
  when 'trusted_member' then array['send_messages','create_polls','invite_members']
  when 'topic_starter' then array['send_messages','create_polls']
  when 'discussion_guide' then array['send_messages','create_polls','pin_messages']
  when 'content_reviewer' then array['send_messages','delete_messages']
  when 'question_curator' then array['send_messages','create_polls']
  when 'study_leader' then array['send_messages','create_polls','pin_messages']
  when 'voice_host' then array['send_messages','invite_members']
  when 'welcome_guide' then array['send_messages','invite_members']
  when 'community_ambassador' then array['send_messages','invite_members','create_polls']
  when 'mentor' then array['send_messages','create_polls']
  when 'senior_mentor' then array['send_messages','create_polls','pin_messages']
  when 'chat_moderator' then array['send_messages','create_polls','invite_members','pin_messages','delete_messages']
  when 'content_moderator' then array['send_messages','pin_messages','delete_messages']
  when 'safety_moderator' then array['send_messages','delete_messages','manage_members']
  when 'member_manager' then array['send_messages','invite_members','manage_members']
  when 'invite_manager' then array['send_messages','invite_members']
  when 'poll_manager' then array['send_messages','create_polls','pin_messages']
  when 'pin_manager' then array['send_messages','pin_messages']
  when 'channel_editor' then array['send_messages','create_polls','pin_messages']
  when 'community_manager' then array['send_messages','create_polls','invite_members','pin_messages','delete_messages','manage_members']
  when 'deputy_owner' then array['send_messages','create_polls','invite_members','pin_messages','delete_messages','manage_members']
  else array[]::text[] end into v_permissions from public.chat_members m
  where m.conversation_id=p_conversation_id and m.user_id=auth.uid();
 return p_permission = any(v_permissions);
end; $$;
revoke all on function private.hgd_chat_has_permission(uuid,text) from public,anon;
grant execute on function private.hgd_chat_has_permission(uuid,text) to authenticated;

create or replace function private.hgd_can_manage_chat(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select private.hgd_is_admin() or exists(select 1 from public.chat_members m where m.conversation_id=p_conversation_id and m.user_id=auth.uid() and m.member_role in ('owner','admin','moderator'));
$$;

create or replace function private.hgd_can_send_chat(p_conversation_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_kind text; v_slow integer; v_muted timestamptz;
begin
 if auth.uid() is null then return false; end if;
 select kind,slow_mode_seconds into v_kind,v_slow from public.chat_conversations where id=p_conversation_id and is_active;
 if not found or not private.hgd_chat_has_permission(p_conversation_id,'send_messages') then return false; end if;
 if exists(select 1 from public.chat_blocks b where (b.blocker_id=auth.uid() and b.blocked_id in (select m.user_id from public.chat_members m where m.conversation_id=p_conversation_id)) or (b.blocked_id=auth.uid() and b.blocker_id in (select m.user_id from public.chat_members m where m.conversation_id=p_conversation_id)) and b.blocker_id<>auth.uid()) then return false; end if;
 select muted_until into v_muted from public.chat_members where conversation_id=p_conversation_id and user_id=auth.uid();
 if v_muted is not null and v_muted>now() then return false; end if;
 if exists(select 1 from public.user_moderation_actions a where a.user_id=auth.uid() and a.revoked_at is null and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now()) and a.action in ('mute','ban','kick') and a.scope in ('global','chat','community','channel','group')) then return false; end if;
 if v_slow>0 and exists(select 1 from public.chat_messages m where m.conversation_id=p_conversation_id and m.sender_id=auth.uid() and m.created_at>now()-make_interval(secs=>v_slow)) then return false; end if;
 return true;
end; $$;

create or replace function public.set_chat_member_role(p_conversation_id uuid,p_user_id uuid,p_role_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_actor_role text; v_actor_permissions text[]; v_target_permissions text[];
begin
 if auth.uid() is null or not private.hgd_chat_has_permission(p_conversation_id,'manage_members') then raise exception 'اجازهٔ مدیریت اعضا را نداری' using errcode='42501'; end if;
 if p_role_code is not null and p_role_code not in ('reader','participant','helper','greeter','scribe','resource_curator','poll_creator','event_host','member_support','trusted_member','topic_starter','discussion_guide','content_reviewer','question_curator','study_leader','voice_host','welcome_guide','community_ambassador','mentor','senior_mentor','chat_moderator','content_moderator','safety_moderator','member_manager','invite_manager','poll_manager','pin_manager','channel_editor','community_manager','deputy_owner') then raise exception 'نقش انتخابی معتبر نیست'; end if;
 if p_user_id=auth.uid() then raise exception 'نمی‌توانی نقش خودت را تغییر دهی' using errcode='42501'; end if;
 select member_role into v_actor_role from public.chat_members where conversation_id=p_conversation_id and user_id=auth.uid();
 if v_actor_role not in ('owner','admin') then raise exception 'فقط مالک یا مدیر اصلی می‌تواند نقش اعضا را تغییر دهد' using errcode='42501'; end if;
 update public.chat_members set custom_role_code=p_role_code where conversation_id=p_conversation_id and user_id=p_user_id;
 if not found then raise exception 'عضو گفتگو پیدا نشد'; end if;
 perform private.hgd_write_audit('chat_member_custom_role_set','chat_member',p_conversation_id::text,'',jsonb_build_object('target_user_id',p_user_id,'role_code',p_role_code));
 return true;
end; $$;
revoke all on function public.set_chat_member_role(uuid,uuid,text) from public,anon;
grant execute on function public.set_chat_member_role(uuid,uuid,text) to authenticated;

create or replace function public.create_chat_invite(p_conversation_id uuid,p_expires_at timestamptz default null,p_max_uses integer default 20) returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
 if not private.hgd_chat_has_permission(p_conversation_id,'invite_members') then raise exception 'اجازهٔ دعوت عضو را نداری' using errcode='42501'; end if;
 if p_max_uses not between 1 and 5000 or (p_expires_at is not null and p_expires_at<=now()) then raise exception 'تنظیمات لینک دعوت نامعتبر است'; end if;
 insert into public.chat_invites(conversation_id,created_by,expires_at,max_uses) values(p_conversation_id,auth.uid(),p_expires_at,p_max_uses) returning invite_code into v_code;
 perform private.hgd_write_audit('chat_invite_created','chat_invite',p_conversation_id::text,'','{}'::jsonb);
 return v_code;
end; $$;

create or replace function public.pin_chat_message(p_message_id uuid,p_pin boolean,p_reason text default '') returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_conv uuid;
begin
 select conversation_id into v_conv from public.chat_messages where id=p_message_id;
 if not found or not private.hgd_chat_has_permission(v_conv,'pin_messages') then raise exception 'اجازهٔ سنجاق‌کردن این پیام را نداری' using errcode='42501'; end if;
 update public.chat_messages set pinned_at=case when p_pin then now() else null end,pinned_by=case when p_pin then auth.uid() else null end where id=p_message_id;
 perform private.hgd_write_audit(case when p_pin then 'chat_message_pinned' else 'chat_message_unpinned' end,'chat_message',p_message_id::text,p_reason,'{}'::jsonb);
 return true;
end; $$;

drop policy if exists hgd_chat_messages_moderator_update on public.chat_messages;
create policy hgd_chat_messages_moderator_update on public.chat_messages for update to authenticated using (private.hgd_is_chat_moderator() or private.hgd_chat_has_permission(conversation_id,'delete_messages')) with check (private.hgd_is_chat_moderator() or private.hgd_chat_has_permission(conversation_id,'delete_messages'));
