begin;

create table if not exists public.forbidden_chat_terms (
 id uuid primary key default gen_random_uuid(),
 term text not null unique check(char_length(btrim(term)) between 2 and 80),
 active boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.forbidden_chat_terms enable row level security;
revoke all on public.forbidden_chat_terms from anon,authenticated;
grant select,insert,update,delete on public.forbidden_chat_terms to authenticated;
drop policy if exists forbidden_chat_terms_admin_all on public.forbidden_chat_terms;
create policy forbidden_chat_terms_admin_all on public.forbidden_chat_terms for all to authenticated
using(private.hgd_is_admin()) with check(private.hgd_is_admin() and (created_by=(select auth.uid()) or private.hgd_is_admin()));

create or replace function private.hgd_filter_forbidden_chat_term()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_term text; v_sender uuid := coalesce(new.sender_id,(select auth.uid()));
begin
 if v_sender is null then return new; end if;
 select t.term into v_term from public.forbidden_chat_terms t
 where t.active and strpos(lower(coalesce(new.body,'')),lower(t.term))>0
 order by char_length(t.term) desc limit 1;
 if v_term is null then return new; end if;
 insert into public.community_reports(reporter_id,target_type,target_id,reason,description)
 values(v_sender,'chat_message',new.id::text,'inappropriate',left('پیام به‌علت واژهٔ ممنوع «'||v_term||'» پیش از انتشار حذف شد. متن: '||coalesce(new.body,''),2000))
 on conflict(reporter_id,target_type,target_id,reason) do nothing;
 return null;
end; $$;
revoke all on function private.hgd_filter_forbidden_chat_term() from public,anon,authenticated;

drop trigger if exists hgd_forbidden_term_public_chat_message on public.public_chat_messages;
create trigger hgd_forbidden_term_public_chat_message before insert on public.public_chat_messages
for each row execute function private.hgd_filter_forbidden_chat_term();
drop trigger if exists hgd_forbidden_term_private_chat_message on public.chat_messages;
create trigger hgd_forbidden_term_private_chat_message before insert on public.chat_messages
for each row execute function private.hgd_filter_forbidden_chat_term();

commit;
