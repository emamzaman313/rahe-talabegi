begin;

create table if not exists public.forbidden_word_attempt_reports (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 term text not null check(char_length(term) between 2 and 80),
 attempted_text text not null check(char_length(attempted_text)<=3000),
 source_table text not null default 'public_chat_messages' check(source_table in ('public_chat_messages','chat_messages')),
 status text not null default 'new' check(status in ('new','reviewed')),
 review_action text, review_note text not null default '', reviewed_by uuid references auth.users(id) on delete set null, reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists forbidden_word_attempt_reports_new_idx on public.forbidden_word_attempt_reports(created_at desc) where status='new';
alter table public.forbidden_word_attempt_reports enable row level security;
revoke all on public.forbidden_word_attempt_reports from public,anon,authenticated;
grant select on public.forbidden_word_attempt_reports to authenticated;
grant update(status,review_action,review_note,reviewed_by,reviewed_at) on public.forbidden_word_attempt_reports to authenticated;
drop policy if exists forbidden_word_attempt_reports_moderator_read on public.forbidden_word_attempt_reports;
create policy forbidden_word_attempt_reports_moderator_read on public.forbidden_word_attempt_reports for select to authenticated using(private.hgd_is_moderator());
drop policy if exists forbidden_word_attempt_reports_moderator_update on public.forbidden_word_attempt_reports;
create policy forbidden_word_attempt_reports_moderator_update on public.forbidden_word_attempt_reports for update to authenticated using(private.hgd_is_moderator()) with check(private.hgd_is_moderator());

create or replace function private.hgd_filter_forbidden_chat_term()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_term text; v_sender uuid := coalesce(new.sender_id,(select auth.uid()));
begin
 if v_sender is null then return new; end if;
 select t.term into v_term from public.forbidden_chat_terms t where t.active and strpos(lower(coalesce(new.body,'')),lower(t.term))>0 order by char_length(t.term) desc limit 1;
 if v_term is null then return new; end if;
 insert into public.forbidden_word_attempt_reports(user_id,term,attempted_text,source_table) values(v_sender,v_term,left(coalesce(new.body,''),3000),tg_table_name);
 return null;
end; $$;
revoke all on function private.hgd_filter_forbidden_chat_term() from public,anon,authenticated;

-- Seed concrete abusive expressions across common Persian variants.
insert into public.forbidden_chat_terms(term,active,created_by)
select v.term,true,(select id from auth.users where coalesce(raw_app_meta_data->>'role','')='super_admin' or coalesce(raw_app_meta_data->'roles','[]'::jsonb) ? 'super_admin' order by created_at limit 1)
from (values ('کثافت'),('بی‌شعور'),('بی شعور'),('احمق'),('نفهم'),('عوضی'),('پفیوز'),('حرومزاده'),('حرامزاده'),('بی‌ناموس'),('بی ناموس'),('آشغال'),('مزخرف'),('خفه شو'),('گمشو'),('لعنتی'),('بی‌ادب'),('بی ادب'),('توهین نژادی'),('تهدید به خشونت'),('تهدید به افشای اطلاعات')) as v(term)
where exists(select 1 from auth.users where coalesce(raw_app_meta_data->>'role','')='super_admin' or coalesce(raw_app_meta_data->'roles','[]'::jsonb) ? 'super_admin')
on conflict(term) do nothing;

commit;
