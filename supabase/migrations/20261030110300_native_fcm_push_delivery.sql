-- Per-user device registrations remain invisible to normal clients.
create table if not exists public.push_device_tokens (
  token text primary key check (char_length(token) between 40 and 4096),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('android','ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists push_device_tokens_user_idx on public.push_device_tokens(user_id);
alter table public.push_device_tokens enable row level security;
revoke all on public.push_device_tokens from public,anon,authenticated;

create or replace function public.register_push_device(p_token text,p_platform text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'ابتدا وارد حساب شو' using errcode='42501'; end if;
 if p_token is null or char_length(p_token) not between 40 and 4096 or p_platform not in ('android','ios') then raise exception 'توکن یا نوع دستگاه معتبر نیست'; end if;
 insert into public.push_device_tokens(token,user_id,platform,updated_at)
 values(p_token,auth.uid(),p_platform,now())
 on conflict(token) do update set user_id=excluded.user_id,platform=excluded.platform,updated_at=now();
 return true;
end; $$;
revoke all on function public.register_push_device(text,text) from public,anon;
grant execute on function public.register_push_device(text,text) to authenticated;

create or replace function public.unregister_push_device(p_token text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'ابتدا وارد حساب شو' using errcode='42501'; end if;
 delete from public.push_device_tokens where token=p_token and user_id=auth.uid();
 return true;
end; $$;
revoke all on function public.unregister_push_device(text) from public,anon;
grant execute on function public.unregister_push_device(text) to authenticated;

create table if not exists public.push_delivery_jobs (
  notification_id uuid primary key references public.in_app_notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  attempts smallint not null default 0 check (attempts between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists push_delivery_jobs_due_idx on public.push_delivery_jobs(next_attempt_at,created_at) where status='pending';
alter table public.push_delivery_jobs enable row level security;
revoke all on public.push_delivery_jobs from public,anon,authenticated;

create or replace function private.hgd_enqueue_push_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.push_delivery_jobs(notification_id,user_id)
 values(new.id,new.user_id) on conflict(notification_id) do nothing;
 return new;
end; $$;
revoke all on function private.hgd_enqueue_push_notification() from public,anon,authenticated;
drop trigger if exists hgd_enqueue_push_notification on public.in_app_notifications;
create trigger hgd_enqueue_push_notification after insert on public.in_app_notifications
for each row execute function private.hgd_enqueue_push_notification();

create or replace function public.claim_push_delivery_jobs(p_limit integer default 50)
returns table(notification_id uuid,user_id uuid,title text,body text,action_url text,attempts smallint)
language plpgsql security definer set search_path = '' as $$
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 return query
 with due as (
   select j.notification_id from public.push_delivery_jobs j
   where j.status='pending' and j.next_attempt_at<=now() and (j.claimed_at is null or j.claimed_at<now()-interval '3 minutes')
   order by j.created_at for update skip locked limit greatest(1,least(coalesce(p_limit,50),100))
 ), claimed as (
   update public.push_delivery_jobs j set claimed_at=now(),attempts=j.attempts+1
   from due where j.notification_id=due.notification_id returning j.notification_id,j.attempts
 )
 select n.id,n.user_id,n.title,n.body,n.action_url,c.attempts
 from claimed c join public.in_app_notifications n on n.id=c.notification_id;
end; $$;
revoke all on function public.claim_push_delivery_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_push_delivery_jobs(integer) to service_role;

create or replace function public.finish_push_delivery_job(p_notification_id uuid,p_success boolean,p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_attempts smallint;
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 select attempts into v_attempts from public.push_delivery_jobs where notification_id=p_notification_id for update;
 if not found then return false; end if;
 if p_success then
   update public.push_delivery_jobs set status='sent',sent_at=now(),claimed_at=null,last_error=null where notification_id=p_notification_id;
 else
   update public.push_delivery_jobs set status=case when v_attempts>=10 then 'failed' else 'pending' end,
    next_attempt_at=now()+make_interval(secs=>least(3600,30*(2^least(v_attempts,7)))),
    claimed_at=null,last_error=left(coalesce(p_error,'Push delivery failed'),500)
   where notification_id=p_notification_id;
 end if;
 return true;
end; $$;
revoke all on function public.finish_push_delivery_job(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.finish_push_delivery_job(uuid,boolean,text) to service_role;

create table if not exists private.push_dispatch_secret (
 singleton boolean primary key default true check (singleton),
 secret_hex text not null
);
revoke all on private.push_dispatch_secret from public,anon,authenticated;
insert into private.push_dispatch_secret(singleton,secret_hex)
values(true,encode(extensions.gen_random_bytes(32),'hex')) on conflict(singleton) do nothing;

create or replace function public.verify_push_dispatch_request(p_payload text,p_signature text)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from private.push_dispatch_secret s
 where s.singleton and encode(extensions.hmac(convert_to(p_payload,'UTF8'),decode(s.secret_hex,'hex'),'sha256'),'hex')=p_signature);
$$;
revoke all on function public.verify_push_dispatch_request(text,text) from public;
grant execute on function public.verify_push_dispatch_request(text,text) to anon,authenticated,service_role;

-- Admin-authored notification journeys. Each advancement also enters the FCM delivery queue.
create table if not exists public.user_notification_sequences (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 created_by uuid not null references auth.users(id) on delete restrict,
 title text not null check (char_length(title) between 2 and 160),
 steps jsonb not null check (case when jsonb_typeof(steps)='array' then jsonb_array_length(steps) between 2 and 10 else false end),
 current_step smallint not null default 0 check (current_step between 0 and 10),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz
);
alter table public.user_notification_sequences enable row level security;
revoke all on public.user_notification_sequences from public,anon,authenticated;
alter table public.in_app_notifications
 add column if not exists sequence_id uuid references public.user_notification_sequences(id) on delete set null,
 add column if not exists sequence_step smallint,
 add column if not exists sequence_total smallint;

create or replace function public.create_user_notification_sequence(p_user_id uuid,p_title text,p_steps jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_step jsonb; v_action text;
begin
 if auth.uid() is null or not private.hgd_is_admin() then raise exception 'فقط مدیر برنامه می‌تواند دنبالهٔ اعلان بسازد' using errcode='42501'; end if;
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'کاربر پیدا نشد'; end if;
 if char_length(btrim(coalesce(p_title,''))) not between 2 and 160 then raise exception 'عنوان دنباله معتبر نیست'; end if;
 if jsonb_typeof(p_steps)<>'array' then raise exception 'ساختار گام‌ها معتبر نیست'; end if;
 if jsonb_array_length(p_steps) not between 2 and 10 then raise exception 'تعداد گام‌ها باید بین ۲ تا ۱۰ باشد'; end if;
 for v_step in select value from jsonb_array_elements(p_steps) loop
  if char_length(btrim(coalesce(v_step->>'title',''))) not between 1 and 160 or char_length(coalesce(v_step->>'body',''))>3000 then raise exception 'عنوان یا متن یکی از گام‌ها معتبر نیست'; end if;
  if coalesce(v_step->>'kind','info') not in ('info','success','warning','support','chat','system') then raise exception 'نوع اعلان معتبر نیست'; end if;
  if coalesce(v_step->>'accent_color','#168574') !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'رنگ یکی از گام‌ها معتبر نیست'; end if;
  if char_length(coalesce(v_step->>'icon','🔔'))>12 then raise exception 'نماد یکی از گام‌ها بیش از حد بلند است'; end if;
  v_action := coalesce(v_step->>'action_url','');
  if v_action<>'' and v_action !~ '^/index\.html(\?open=(chats|announcements|study|quizzes|settings|support))?$' then raise exception 'پیوند یکی از گام‌ها باید به بخش داخلی برنامه باشد'; end if;
 end loop;
 insert into public.user_notification_sequences(user_id,created_by,title,steps)
 values(p_user_id,auth.uid(),btrim(p_title),p_steps) returning id into v_id;
 perform private.hgd_write_audit('notification_sequence_created','notification_sequence',v_id::text,'',jsonb_build_object('user_id',p_user_id,'steps',jsonb_array_length(p_steps)));
 return v_id;
end; $$;
revoke all on function public.create_user_notification_sequence(uuid,text,jsonb) from public,anon;
grant execute on function public.create_user_notification_sequence(uuid,text,jsonb) to authenticated;

create or replace function public.advance_user_notification_sequence(p_sequence_id uuid)
returns smallint language plpgsql security definer set search_path = '' as $$
declare v public.user_notification_sequences%rowtype; v_step jsonb; v_next smallint;
begin
 if auth.uid() is null or not private.hgd_is_admin() then raise exception 'فقط مدیر برنامه می‌تواند گام اعلان را ارسال کند' using errcode='42501'; end if;
 select * into v from public.user_notification_sequences where id=p_sequence_id for update;
 if not found then raise exception 'دنبالهٔ اعلان پیدا نشد'; end if;
 v_next := v.current_step+1;
 if v_next>jsonb_array_length(v.steps) then raise exception 'همهٔ گام‌های این دنباله ارسال شده است'; end if;
 v_step := v.steps->(v_next-1);
 insert into public.in_app_notifications(user_id,title,body,kind,action_url,accent_color,icon,sequence_id,sequence_step,sequence_total)
 values(v.user_id,v_step->>'title',coalesce(v_step->>'body',''),coalesce(v_step->>'kind','info'),nullif(v_step->>'action_url',''),coalesce(v_step->>'accent_color','#168574'),coalesce(v_step->>'icon','🔔'),v.id,v_next,jsonb_array_length(v.steps));
 update public.user_notification_sequences set current_step=v_next,updated_at=now(),completed_at=case when v_next=jsonb_array_length(v.steps) then now() else null end where id=v.id;
 perform private.hgd_write_audit('notification_sequence_advanced','notification_sequence',v.id::text,'',jsonb_build_object('user_id',v.user_id,'step',v_next,'total',jsonb_array_length(v.steps)));
 return v_next;
end; $$;
revoke all on function public.advance_user_notification_sequence(uuid) from public,anon;
grant execute on function public.advance_user_notification_sequence(uuid) to authenticated;

create or replace function public.list_user_notification_sequences()
returns table(id uuid,user_id uuid,title text,current_step smallint,total_steps integer,created_at timestamptz,completed_at timestamptz)
language sql stable security definer set search_path = '' as $$
 select s.id,s.user_id,s.title,s.current_step,jsonb_array_length(s.steps),s.created_at,s.completed_at
 from public.user_notification_sequences s where private.hgd_is_admin() order by s.created_at desc limit 50;
$$;
revoke all on function public.list_user_notification_sequences() from public,anon;
grant execute on function public.list_user_notification_sequences() to authenticated;

-- Notify members when a group or channel administrator changes their custom rank.
create or replace function public.set_chat_member_role(p_conversation_id uuid,p_user_id uuid,p_role_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_actor_role text;
begin
 if auth.uid() is null or not private.hgd_chat_has_permission(p_conversation_id,'manage_members') then raise exception 'اجازهٔ مدیریت اعضا را نداری' using errcode='42501'; end if;
 if p_role_code is not null and p_role_code not in ('reader','participant','helper','greeter','scribe','resource_curator','poll_creator','event_host','member_support','trusted_member','topic_starter','discussion_guide','content_reviewer','question_curator','study_leader','voice_host','welcome_guide','community_ambassador','mentor','senior_mentor','chat_moderator','content_moderator','safety_moderator','member_manager','invite_manager','poll_manager','pin_manager','channel_editor','community_manager','deputy_owner') then raise exception 'نقش انتخابی معتبر نیست'; end if;
 if p_user_id=auth.uid() then raise exception 'نمی‌توانی نقش خودت را تغییر دهی' using errcode='42501'; end if;
 select member_role into v_actor_role from public.chat_members where conversation_id=p_conversation_id and user_id=auth.uid();
 if v_actor_role not in ('owner','admin') then raise exception 'فقط مالک یا مدیر اصلی می‌تواند نقش اعضا را تغییر دهد' using errcode='42501'; end if;
 update public.chat_members set custom_role_code=p_role_code where conversation_id=p_conversation_id and user_id=p_user_id;
 if not found then raise exception 'عضو گفتگو پیدا نشد'; end if;
 insert into public.in_app_notifications(user_id,title,body,kind,action_url,accent_color,icon)
 values(p_user_id,'رتبهٔ گفت‌وگویت تغییر کرد',case when p_role_code is null then 'مدیر رتبهٔ سفارشی تو را برداشت.' else 'رتبهٔ تازهٔ تو: '||p_role_code end,'system','/index.html?open=chats','#176b67','🏷️');
 perform private.hgd_write_audit('chat_member_custom_role_set','chat_member',p_conversation_id::text,'',jsonb_build_object('target_user_id',p_user_id,'role_code',p_role_code));
 return true;
end; $$;
revoke all on function public.set_chat_member_role(uuid,uuid,text) from public,anon;
grant execute on function public.set_chat_member_role(uuid,uuid,text) to authenticated;
