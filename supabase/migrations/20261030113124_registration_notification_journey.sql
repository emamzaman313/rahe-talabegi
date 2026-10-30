-- A small, real onboarding journey: account/profile created, then discussion group selected.
create table if not exists private.registration_notification_sequences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sequence_id uuid not null unique references public.user_notification_sequences(id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on private.registration_notification_sequences from public,anon,authenticated;

create or replace function private.hgd_start_registration_notification_journey()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_sequence uuid; v_steps jsonb;
begin
 if new.selected_discussion_group_id is not null then return new; end if;
 v_steps := jsonb_build_array(
  jsonb_build_object('title','خوش آمدی · گام ۱ از ۲','body','حسابت آماده است. برای تکمیل ثبت‌نام، گروه مباحثهٔ هم‌پایه‌ات را انتخاب کن.','kind','info','accent_color','#176b67','icon','👋','action_url','/index.html?open=chats'),
  jsonb_build_object('title','ثبت‌نام کامل شد · گام ۲ از ۲','body','گروه مباحثه‌ات انتخاب شد؛ مسیرت را با هم‌قدم ادامه بده.','kind','success','accent_color','#168574','icon','✅','action_url','/index.html?open=chats')
 );
 insert into public.user_notification_sequences(user_id,created_by,title,steps,current_step)
 values(new.id,new.id,'تکمیل ثبت‌نام',v_steps,1) returning id into v_sequence;
 insert into private.registration_notification_sequences(user_id,sequence_id) values(new.id,v_sequence)
 on conflict(user_id) do nothing;
 insert into public.in_app_notifications(user_id,title,body,kind,action_url,accent_color,icon,sequence_id,sequence_step,sequence_total)
 values(new.id,'خوش آمدی · گام ۱ از ۲','حسابت آماده است. برای تکمیل ثبت‌نام، گروه مباحثهٔ هم‌پایه‌ات را انتخاب کن.','info','/index.html?open=chats','#176b67','👋',v_sequence,1,2);
 return new;
end; $$;
revoke all on function private.hgd_start_registration_notification_journey() from public,anon,authenticated;
drop trigger if exists hgd_registration_notification_journey_start on public.profiles;
create trigger hgd_registration_notification_journey_start after insert on public.profiles
for each row execute function private.hgd_start_registration_notification_journey();

create or replace function private.hgd_finish_registration_notification_journey()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_sequence public.user_notification_sequences%rowtype; v_group_title text; v_step jsonb; v_next smallint;
begin
 if old.selected_discussion_group_id is not null or new.selected_discussion_group_id is null then return new; end if;
 select g.title into v_group_title from public.discussion_groups g where g.id=new.selected_discussion_group_id;
 select s.* into v_sequence from private.registration_notification_sequences m
 join public.user_notification_sequences s on s.id=m.sequence_id
 where m.user_id=new.id for update of s;
 if not found or v_sequence.current_step>=jsonb_array_length(v_sequence.steps) then return new; end if;
 v_next:=v_sequence.current_step+1;
 v_step:=v_sequence.steps->(v_next-1);
 v_step:=jsonb_set(v_step,'{body}',to_jsonb('گروه «'||coalesce(v_group_title,'مباحثه')||'» برایت ثبت شد. مسیرت را با هم‌قدم ادامه بده.'::text),true);
 insert into public.in_app_notifications(user_id,title,body,kind,action_url,accent_color,icon,sequence_id,sequence_step,sequence_total)
 values(new.id,v_step->>'title',v_step->>'body',v_step->>'kind',v_step->>'action_url',v_step->>'accent_color',v_step->>'icon',v_sequence.id,v_next,jsonb_array_length(v_sequence.steps));
 update public.user_notification_sequences set current_step=v_next,updated_at=now(),completed_at=now() where id=v_sequence.id;
 return new;
end; $$;
revoke all on function private.hgd_finish_registration_notification_journey() from public,anon,authenticated;
drop trigger if exists hgd_registration_notification_journey_finish on public.profiles;
create trigger hgd_registration_notification_journey_finish after update of selected_discussion_group_id on public.profiles
for each row execute function private.hgd_finish_registration_notification_journey();
