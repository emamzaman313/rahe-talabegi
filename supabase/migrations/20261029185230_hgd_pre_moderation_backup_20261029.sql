-- Scoped logical rollback snapshot before the pending additive moderation migrations.
-- Rows, table inventory, RLS policies, and affected function definitions are retained
-- in a non-exposed schema on the same Supabase project.
begin;
create schema if not exists hgd_pre_moderation_backup_20261029;
revoke all on schema hgd_pre_moderation_backup_20261029 from public, anon, authenticated;

do $snapshot$
declare
  table_name text;
begin
  foreach table_name in array array[
    'public_chat_rooms',
    'public_chat_members',
    'public_chat_messages',
    'public_chat_attachments',
    'discussion_groups',
    'discussion_group_members'
  ] loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format(
        'create table hgd_pre_moderation_backup_20261029.%I as table public.%I',
        table_name,
        table_name
      );
    end if;
  end loop;
end;
$snapshot$;

create table hgd_pre_moderation_backup_20261029.rls_policies as
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename in (
  'public_chat_rooms','public_chat_members','public_chat_messages','public_chat_attachments',
  'public_chat_reports','public_chat_user_moderation_actions','discussion_groups','discussion_group_members'
)) or (schemaname = 'storage' and tablename = 'objects');

create table hgd_pre_moderation_backup_20261029.function_definitions as
select n.nspname as schema_name, p.proname as function_name, pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in (
  'hgd_chat_current_user_restricted','hgd_guard_chat_moderation_target',
  'hgd_clamp_discussion_group_capacity','hgd_enforce_discussion_group_capacity','join_discussion_group'
);

create table hgd_pre_moderation_backup_20261029.snapshot_manifest (
  captured_at timestamptz not null default now(),
  backup_scope text not null
);
insert into hgd_pre_moderation_backup_20261029.snapshot_manifest(backup_scope)
values ('Affected public chat and discussion rows, relevant RLS policy definitions, and related function definitions');
commit;

