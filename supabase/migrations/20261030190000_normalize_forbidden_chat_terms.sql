begin;

-- Match whole normalized words and common Persian/Arabic keyboard variants.
create or replace function private.hgd_normalize_forbidden_text(p_text text)
returns text language sql immutable parallel safe set search_path = '' as $$
 select btrim(regexp_replace(
   regexp_replace(
     translate(lower(coalesce(p_text,'')), 'كيىـًٌٍَُِّْٰ‌‍', 'کییه' || repeat(' ', 11)),
     '[،؛؟.!,:;…(){}\[\]«»"''`~@#$%^&*+=<>|/\\_-]+', ' ', 'g'),
   '[[:space:]]+', ' ', 'g'));
$$;
revoke all on function private.hgd_normalize_forbidden_text(text) from public,anon,authenticated;

create or replace function private.hgd_filter_forbidden_chat_term()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_term text; v_body text; v_sender uuid := coalesce(new.sender_id,(select auth.uid()));
begin
 if v_sender is null then return new; end if;
 v_body := ' ' || private.hgd_normalize_forbidden_text(new.body) || ' ';
 select t.term into v_term
 from public.forbidden_chat_terms t
 where t.active
   and position(' ' || private.hgd_normalize_forbidden_text(t.term) || ' ' in v_body) > 0
 order by char_length(private.hgd_normalize_forbidden_text(t.term)) desc
 limit 1;
 if v_term is null then return new; end if;
 insert into public.forbidden_word_attempt_reports(user_id,term,attempted_text,source_table)
 values(v_sender,v_term,left(coalesce(new.body,''),3000),tg_table_name);
 return null;
end; $$;
revoke all on function private.hgd_filter_forbidden_chat_term() from public,anon,authenticated;

-- These entries describe report categories rather than abusive text.
update public.forbidden_chat_terms
set active=false
where term in ('توهین نژادی','تهدید به خشونت','تهدید به افشای اطلاعات');

commit;
