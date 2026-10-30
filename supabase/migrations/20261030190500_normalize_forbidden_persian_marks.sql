begin;
create or replace function private.hgd_normalize_forbidden_text(p_text text)
returns text language sql immutable parallel safe set search_path = '' as $$
 select btrim(regexp_replace(regexp_replace(translate(lower(coalesce(p_text,'')), 'كيىـًٌٍَُِّْٰ‌‍', 'کییه' || repeat(' ', 11)), '[،؛؟.!,:;…(){}\[\]«»"''`~@#$%^&*+=<>|/\\_-]+', ' ', 'g'), '[[:space:]]+', ' ', 'g'));
$$;
revoke all on function private.hgd_normalize_forbidden_text(text) from public,anon,authenticated;
commit;
