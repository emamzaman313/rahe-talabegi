-- Send a single alert to the support team when a user first opens a support thread.
create or replace function private.hgd_notify_support_team_new_request()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_admin uuid; v_subject text;
begin
 if new.sender_role<>'user' then return new; end if;
 if exists(select 1 from public.support_messages m where m.conversation_id=new.conversation_id and m.sender_role='user' and m.id<>new.id) then return new; end if;
 select c.subject into v_subject from public.support_conversations c where c.id=new.conversation_id;
 for v_admin in
  select u.id from auth.users u
  where coalesce(u.raw_app_meta_data->>'role','') in ('admin','super_admin','support')
     or coalesce(u.raw_app_meta_data->'roles','[]'::jsonb) ?| array['admin','super_admin','support']
 loop
  insert into public.in_app_notifications(user_id,title,body,kind,action_url,accent_color,icon)
  values(v_admin,'درخواست تازهٔ پشتیبانی',left(coalesce(v_subject,'درخواست پشتیبانی')||' — '||new.body,1000),'support','./support-admin.html','#176b67','🛟');
 end loop;
 return new;
end; $$;
revoke all on function private.hgd_notify_support_team_new_request() from public,anon,authenticated;
drop trigger if exists hgd_support_team_new_request_notification on public.support_messages;
create trigger hgd_support_team_new_request_notification after insert on public.support_messages
for each row when (new.sender_role='user') execute function private.hgd_notify_support_team_new_request();
