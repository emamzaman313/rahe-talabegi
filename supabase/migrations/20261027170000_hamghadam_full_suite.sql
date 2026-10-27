-- هم‌قدم: زیرساخت مباحثه، پیام‌رسان چندنوعی، مدیریت، تم‌های مناسبتی، میز مطالعه و آزمون
-- پس از پشتیبان‌گیری و بازبینی schema روی پروژه هدف اجرا شود. این فایل توسط CI خودکار روی دیتابیس اعمال نمی‌شود.
-- هیچ کلید service_role یا کلید خصوصی در این مهاجرت قرار ندهید.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------------------------
-- نقش‌های مورد اعتماد
-- ---------------------------
create or replace function private.hgd_is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role','') in ('admin','super_admin')
     or coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ? 'admin'
     or coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ? 'super_admin';
$$;

create or replace function private.hgd_is_super_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(auth.jwt()->'app_metadata'->>'role','') = 'super_admin'
     or coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ? 'super_admin';
$$;

create or replace function private.hgd_is_moderator()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.hgd_is_admin()
     or coalesce(auth.jwt()->'app_metadata'->>'role','') in ('support','chat_moderator','content_moderator')
     or coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ? 'chat_moderator'
     or coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ? 'content_moderator'
     or coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ? 'support';
$$;

revoke all on function private.hgd_is_admin() from public, anon;
revoke all on function private.hgd_is_super_admin() from public, anon;
revoke all on function private.hgd_is_moderator() from public, anon;
grant execute on function private.hgd_is_admin() to authenticated;
grant execute on function private.hgd_is_super_admin() to authenticated;
grant execute on function private.hgd_is_moderator() to authenticated;

-- Private-chat access is narrower than generic support/content moderation.
-- Support and content moderators must not gain blanket visibility into direct conversations.
create or replace function private.hgd_is_chat_moderator()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.hgd_is_admin()
     or coalesce(auth.jwt()->'app_metadata'->>'role','') = 'chat_moderator'
     or coalesce(auth.jwt()->'app_metadata'->'roles','[]'::jsonb) ? 'chat_moderator';
$$;
revoke all on function private.hgd_is_chat_moderator() from public,anon;
grant execute on function private.hgd_is_chat_moderator() to authenticated;

create table if not exists public.admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 2 and 100),
  target_type text not null default 'system' check (char_length(target_type) between 2 and 60),
  target_id text,
  reason text not null default '' check (char_length(reason) <= 1200),
  details jsonb not null default '{}'::jsonb check (pg_catalog.octet_length(details::text) <= 12000),
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_logs_created_at_idx on public.admin_audit_logs(created_at desc);
create index if not exists admin_audit_logs_actor_idx on public.admin_audit_logs(actor_id,created_at desc);
alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from anon, authenticated;
grant select on public.admin_audit_logs to authenticated;
drop policy if exists hgd_admin_audit_read on public.admin_audit_logs;
create policy hgd_admin_audit_read on public.admin_audit_logs for select to authenticated using (private.hgd_is_admin());

create or replace function private.hgd_write_audit(
  p_action text, p_target_type text, p_target_id text, p_reason text default '', p_details jsonb default '{}'::jsonb
) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.admin_audit_logs(actor_id,action,target_type,target_id,reason,details)
  values (auth.uid(),left(p_action,100),left(p_target_type,60),left(p_target_id,300),left(coalesce(p_reason,''),1200),coalesce(p_details,'{}'::jsonb));
end;
$$;
revoke all on function private.hgd_write_audit(text,text,text,text,jsonb) from public, anon, authenticated;

-- ---------------------------
-- تنظیمات قابلیت‌ها و اعلان عمومی
-- ---------------------------
create table if not exists public.app_settings (
  setting_key text primary key check (setting_key ~ '^[a-z][a-z0-9_.-]{1,100}$'),
  setting_value jsonb not null default '{}'::jsonb check (pg_catalog.octet_length(setting_value::text) <= 20000),
  public_read boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;
grant insert(setting_key,setting_value,public_read,updated_by) on public.app_settings to authenticated;
grant update(setting_value,public_read,updated_by) on public.app_settings to authenticated;
drop policy if exists hgd_settings_read on public.app_settings;
create policy hgd_settings_read on public.app_settings for select to authenticated using (public_read or private.hgd_is_admin());
drop policy if exists hgd_settings_admin_insert on public.app_settings;
create policy hgd_settings_admin_insert on public.app_settings for insert to authenticated with check (private.hgd_is_admin() and updated_by = (select auth.uid()));
drop policy if exists hgd_settings_admin_update on public.app_settings;
create policy hgd_settings_admin_update on public.app_settings for update to authenticated using (private.hgd_is_admin()) with check (private.hgd_is_admin() and updated_by = (select auth.uid()));

insert into public.app_settings(setting_key,setting_value,public_read) values
 ('features', '{"debates":true,"community_chat":true,"private_chat":true,"groups":true,"channels":true,"special_themes":true,"personal_books":true,"quizzes":true,"rankings":true,"support":true,"ai_assistant":true}'::jsonb, true),
 ('community_policy', '{"max_debate_group_members":3,"chat_attachment_limit_bytes":52428800,"personal_book_limit_bytes":104857600,"default_slow_mode_seconds":0}'::jsonb,true)
on conflict(setting_key) do nothing;

create table if not exists public.app_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 6000),
  audience text not null default 'all' check (audience in ('all','group','channel','users')),
  audience_ids uuid[] not null default '{}',
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  is_published boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (cardinality(audience_ids) <= 1000)
);
create index if not exists app_announcements_live_idx on public.app_announcements(is_published,starts_at desc);
alter table public.app_announcements enable row level security;
revoke all on public.app_announcements from anon, authenticated;
grant select,insert,update,delete on public.app_announcements to authenticated;
drop policy if exists hgd_announcements_read on public.app_announcements;
create policy hgd_announcements_read on public.app_announcements for select to authenticated
using (private.hgd_is_admin() or (is_published and starts_at <= now() and (ends_at is null or ends_at > now()) and (audience='all' or (audience='users' and (select auth.uid()) = any(audience_ids)))));
drop policy if exists hgd_announcements_admin_manage on public.app_announcements;
create policy hgd_announcements_admin_manage on public.app_announcements for all to authenticated using (private.hgd_is_admin()) with check (private.hgd_is_admin() and created_by=(select auth.uid()));

create table if not exists public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 3000),
  kind text not null default 'info' check (kind in ('info','success','warning','support','chat','system')),
  action_url text check (action_url is null or (action_url like '/%' and action_url not like '//%')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists in_app_notifications_user_created_idx on public.in_app_notifications(user_id,created_at desc);
alter table public.in_app_notifications enable row level security;
revoke all on public.in_app_notifications from anon, authenticated;
grant select,update(read_at) on public.in_app_notifications to authenticated;
drop policy if exists hgd_notifications_own_read on public.in_app_notifications;
create policy hgd_notifications_own_read on public.in_app_notifications for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists hgd_notifications_own_update on public.in_app_notifications;
create policy hgd_notifications_own_update on public.in_app_notifications for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
drop policy if exists hgd_notifications_admin_insert on public.in_app_notifications;
create policy hgd_notifications_admin_insert on public.in_app_notifications for insert to authenticated with check (private.hgd_is_admin());
grant insert(user_id,title,body,kind,action_url) on public.in_app_notifications to authenticated;

-- ---------------------------
-- تم‌های روز/شب و مناسبت‌های مذهبی
-- ---------------------------
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  color_mode text not null default 'system' check (color_mode in ('system','light','dark')),
  reduce_motion boolean not null default false,
  sound_enabled boolean not null default false,
  disable_occasion_themes boolean not null default false,
  font_scale numeric(3,2) not null default 1.00 check (font_scale between 0.85 and 1.35),
  updated_at timestamptz not null default now()
);
alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from anon, authenticated;
grant select,insert,update(color_mode,reduce_motion,sound_enabled,disable_occasion_themes,font_scale) on public.user_preferences to authenticated;
drop policy if exists hgd_preferences_own on public.user_preferences;
create policy hgd_preferences_own on public.user_preferences for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists hgd_preferences_insert_own on public.user_preferences;
create policy hgd_preferences_insert_own on public.user_preferences for insert to authenticated with check (user_id=(select auth.uid()));
drop policy if exists hgd_preferences_update_own on public.user_preferences;
create policy hgd_preferences_update_own on public.user_preferences for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));

create table if not exists public.occasion_themes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  title text not null check (char_length(btrim(title)) between 2 and 120),
  occasion_type text not null check (occasion_type in ('birth','martyrdom','religious','national','custom')),
  description text not null default '' check (char_length(description) <= 1200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'Asia/Tehran' check (char_length(timezone) between 3 and 80),
  accent_color text not null default '#168574' check (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  background_color text not null default '#f4f6f0' check (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  glow_enabled boolean not null default true,
  sound_key text check (sound_key is null or sound_key in ('soft-chime','quiet-bell','none')),
  enabled boolean not null default false,
  priority integer not null default 10 check (priority between 0 and 100),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index if not exists occasion_themes_active_window_idx on public.occasion_themes(enabled,starts_at,ends_at,priority desc);
alter table public.occasion_themes enable row level security;
revoke all on public.occasion_themes from anon, authenticated;
grant select,insert,update,delete on public.occasion_themes to authenticated;
drop policy if exists hgd_occasion_read_active on public.occasion_themes;
create policy hgd_occasion_read_active on public.occasion_themes for select to authenticated
using (private.hgd_is_admin() or (enabled and starts_at <= now() and ends_at > now()));
drop policy if exists hgd_occasion_admin_manage on public.occasion_themes;
create policy hgd_occasion_admin_manage on public.occasion_themes for all to authenticated using (private.hgd_is_admin()) with check (private.hgd_is_admin());

-- ---------------------------
-- محدودیت‌های کاربر؛ اجرای واقعی در backend/RLS و trigger
-- ---------------------------
create table if not exists public.user_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('global','community','chat','debate','group','channel')),
  action text not null check (action in ('warning','mute','ban','kick')),
  reason text not null check (char_length(btrim(reason)) between 2 and 1200),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index if not exists user_moderation_active_idx on public.user_moderation_actions(user_id,scope,starts_at,ends_at) where revoked_at is null;
alter table public.user_moderation_actions enable row level security;
revoke all on public.user_moderation_actions from anon, authenticated;
grant select on public.user_moderation_actions to authenticated;
drop policy if exists hgd_moderation_admin_read on public.user_moderation_actions;
create policy hgd_moderation_admin_read on public.user_moderation_actions for select to authenticated using (private.hgd_is_moderator());

create or replace function private.hgd_assert_can_post(p_scope text default 'community')
returns void language plpgsql stable security definer set search_path = '' as $$
declare v_action text; v_reason text;
begin
  if auth.uid() is null then raise exception 'ابتدا وارد حساب شو' using errcode='42501'; end if;
  select action,reason into v_action,v_reason from public.user_moderation_actions
   where user_id=auth.uid() and revoked_at is null and starts_at<=now() and (ends_at is null or ends_at>now())
     and scope in ('global',p_scope,'community') and action in ('mute','ban','kick')
   order by case scope when 'global' then 1 when p_scope then 2 else 3 end,created_at desc limit 1;
  if v_action is not null then raise exception 'اجازهٔ ارسال در این بخش موقتاً محدود شده است: %', v_reason using errcode='42501'; end if;
end; $$;
revoke all on function private.hgd_assert_can_post(text) from public, anon, authenticated;

-- ---------------------------
-- مباحثهٔ موضوع‌محور و گروه‌های سه‌نفره با مسئول بحث
-- ---------------------------
create table if not exists public.debate_topics (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 4 and 180),
  question text not null check (char_length(btrim(question)) between 1 and 4000),
  category text not null default 'عمومی' check (char_length(category) between 1 and 80),
  state text not null default 'open' check (state in ('open','concluded','archived','hidden')),
  is_pinned boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  moderated_by uuid references auth.users(id) on delete set null,
  moderation_note text not null default '' check (char_length(moderation_note) <= 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists debate_topics_state_created_idx on public.debate_topics(state,is_pinned desc,created_at desc);
alter table public.debate_topics enable row level security;
revoke all on public.debate_topics from anon, authenticated;
grant select,insert,update on public.debate_topics to authenticated;
drop policy if exists hgd_debate_topics_read on public.debate_topics;
create policy hgd_debate_topics_read on public.debate_topics for select to authenticated using (state <> 'hidden' or private.hgd_is_moderator());
drop policy if exists hgd_debate_topics_insert on public.debate_topics;
create policy hgd_debate_topics_insert on public.debate_topics for insert to authenticated with check (created_by=(select auth.uid()) and state='open' and is_pinned=false and moderated_by is null);
drop policy if exists hgd_debate_topics_update_own on public.debate_topics;
create policy hgd_debate_topics_update_own on public.debate_topics for update to authenticated
using (created_by=(select auth.uid()) and created_at > now()-interval '30 minutes' and state='open')
with check (created_by=(select auth.uid()) and state in ('open','concluded') and is_pinned=false and moderated_by is null);
drop policy if exists hgd_debate_topics_moderator_update on public.debate_topics;
create policy hgd_debate_topics_moderator_update on public.debate_topics for update to authenticated using (private.hgd_is_moderator()) with check (private.hgd_is_moderator());

create table if not exists public.debate_posts (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.debate_topics(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete restrict,
  argument_type text not null default 'argument' check (argument_type in ('support','oppose','question','argument','rebuttal','summary','source')),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  reply_to uuid references public.debate_posts(id) on delete set null,
  source_title text check (source_title is null or char_length(source_title) <= 240),
  source_url text check (source_url is null or (source_url like 'https://%' and char_length(source_url) <= 1200)),
  edited_at timestamptz,
  deleted_at timestamptz,
  moderated_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  check (reply_to is null or reply_to <> id)
);
create index if not exists debate_posts_topic_created_idx on public.debate_posts(topic_id,created_at asc);
create index if not exists debate_posts_author_idx on public.debate_posts(author_id,created_at desc);
alter table public.debate_posts enable row level security;
revoke all on public.debate_posts from anon, authenticated;
grant select,insert,update on public.debate_posts to authenticated;
drop policy if exists hgd_debate_posts_read on public.debate_posts;
create policy hgd_debate_posts_read on public.debate_posts for select to authenticated
using ((not moderated_hidden and deleted_at is null and exists(select 1 from public.debate_topics t where t.id=topic_id and t.state <> 'hidden')) or private.hgd_is_moderator());
drop policy if exists hgd_debate_posts_insert on public.debate_posts;
create policy hgd_debate_posts_insert on public.debate_posts for insert to authenticated with check (
 author_id=(select auth.uid()) and moderated_hidden=false and deleted_at is null
 and exists(select 1 from public.debate_topics t where t.id=topic_id and t.state='open')
);
drop policy if exists hgd_debate_posts_update_own on public.debate_posts;
create policy hgd_debate_posts_update_own on public.debate_posts for update to authenticated
using (author_id=(select auth.uid()) and created_at>now()-interval '10 minutes' and deleted_at is null)
with check (author_id=(select auth.uid()) and moderated_hidden=false and deleted_at is null);
drop policy if exists hgd_debate_posts_moderator_update on public.debate_posts;
create policy hgd_debate_posts_moderator_update on public.debate_posts for update to authenticated using (private.hgd_is_moderator()) with check (private.hgd_is_moderator());

create or replace function private.hgd_check_debate_rate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.hgd_assert_can_post('debate');
  if (select count(*) from public.debate_posts p where p.author_id=new.author_id and p.created_at>now()-interval '10 seconds') >= 5 then
    raise exception 'برای جلوگیری از هرزنامه، آهسته‌تر پیام بفرست.' using errcode='P0001';
  end if;
  return new;
end; $$;
revoke all on function private.hgd_check_debate_rate() from public,anon,authenticated;
drop trigger if exists hgd_debate_rate_limit on public.debate_posts;
create trigger hgd_debate_rate_limit before insert on public.debate_posts for each row execute function private.hgd_check_debate_rate();

create table if not exists public.discussion_groups (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 3 and 100),
  topic text not null default '' check (char_length(topic) <= 600),
  created_by uuid not null references auth.users(id) on delete restrict,
  max_members smallint not null default 3 check (max_members=3),
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists discussion_groups_open_idx on public.discussion_groups(is_open,created_at desc);
create table if not exists public.discussion_group_members (
  group_id uuid not null references public.discussion_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'member' check (member_role in ('owner','member','discussion_leader')),
  joined_at timestamptz not null default now(),
  primary key(group_id,user_id)
);
create unique index if not exists one_discussion_leader_per_group on public.discussion_group_members(group_id) where member_role='discussion_leader';
create index if not exists discussion_group_members_user_idx on public.discussion_group_members(user_id,group_id);
alter table public.discussion_groups enable row level security;
alter table public.discussion_group_members enable row level security;
revoke all on public.discussion_groups from anon,authenticated;
revoke all on public.discussion_group_members from anon,authenticated;
grant select on public.discussion_groups to authenticated;
grant update(title,topic,is_open) on public.discussion_groups to authenticated;
grant select on public.discussion_group_members to authenticated;
drop policy if exists hgd_discussion_groups_read on public.discussion_groups;
create policy hgd_discussion_groups_read on public.discussion_groups for select to authenticated using (is_open or created_by=(select auth.uid()) or private.hgd_is_moderator());
drop policy if exists hgd_discussion_groups_insert on public.discussion_groups;
create policy hgd_discussion_groups_insert on public.discussion_groups for insert to authenticated with check (created_by=(select auth.uid()) and max_members=3 and is_open=true);
drop policy if exists hgd_discussion_groups_update on public.discussion_groups;
create policy hgd_discussion_groups_update on public.discussion_groups for update to authenticated using (created_by=(select auth.uid()) or private.hgd_is_admin()) with check (created_by=(select auth.uid()) or private.hgd_is_admin());
drop policy if exists hgd_discussion_members_read on public.discussion_group_members;
create or replace function private.hgd_is_discussion_member(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.discussion_group_members m where m.group_id=p_group_id and m.user_id=auth.uid());
$$;
revoke all on function private.hgd_is_discussion_member(uuid) from public,anon;
grant execute on function private.hgd_is_discussion_member(uuid) to authenticated;
create policy hgd_discussion_members_read on public.discussion_group_members for select to authenticated using (user_id=(select auth.uid()) or private.hgd_is_moderator() or private.hgd_is_discussion_member(group_id));

create or replace function public.create_discussion_group(p_title text,p_topic text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_group_id uuid;
begin
  perform private.hgd_assert_can_post('group');
  if auth.uid() is null then raise exception 'ابتدا وارد حساب شو' using errcode='42501'; end if;
  insert into public.discussion_groups(title,topic,created_by,max_members,is_open)
  values(left(btrim(p_title),100),left(coalesce(p_topic,''),600),auth.uid(),3,true) returning id into v_group_id;
  insert into public.discussion_group_members(group_id,user_id,member_role) values(v_group_id,auth.uid(),'owner');
  perform private.hgd_write_audit('discussion_group_created','discussion_group',v_group_id::text,'',jsonb_build_object('title',left(p_title,100)));
  return v_group_id;
end; $$;

create or replace function public.join_discussion_group(p_group_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_group public.discussion_groups%rowtype; v_count integer;
begin
  perform private.hgd_assert_can_post('group');
  select * into v_group from public.discussion_groups where id=p_group_id for update;
  if not found or not v_group.is_open then raise exception 'این گروه در دسترس نیست'; end if;
  if exists(select 1 from public.discussion_group_members where group_id=p_group_id and user_id=auth.uid()) then return true; end if;
  select count(*) into v_count from public.discussion_group_members where group_id=p_group_id;
  if v_count>=3 then raise exception 'ظرفیت گروه سه نفر است و تکمیل شده'; end if;
  insert into public.discussion_group_members(group_id,user_id,member_role) values(p_group_id,auth.uid(),'member');
  perform private.hgd_write_audit('discussion_group_joined','discussion_group',p_group_id::text,'','{}'::jsonb);
  return true;
end; $$;

create or replace function public.assign_discussion_leader(p_group_id uuid,p_user_id uuid,p_assign boolean default true) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if auth.uid() is null then raise exception 'ابتدا وارد حساب شو' using errcode='42501'; end if;
  select created_by into v_owner from public.discussion_groups where id=p_group_id for update;
  if not found then raise exception 'گروه پیدا نشد'; end if;
  if v_owner <> auth.uid() and not private.hgd_is_admin() then raise exception 'اجازهٔ تغییر مسئول بحث را نداری' using errcode='42501'; end if;
  if p_assign and not exists(select 1 from public.discussion_group_members where group_id=p_group_id and user_id=p_user_id) then raise exception 'مسئول باید عضو همین گروه باشد'; end if;
  if p_assign then
    update public.discussion_group_members set member_role='member' where group_id=p_group_id and member_role='discussion_leader';
    update public.discussion_group_members set member_role='discussion_leader' where group_id=p_group_id and user_id=p_user_id;
  else
    update public.discussion_group_members set member_role='member' where group_id=p_group_id and user_id=p_user_id and member_role='discussion_leader';
  end if;
  perform private.hgd_write_audit(case when p_assign then 'discussion_leader_assigned' else 'discussion_leader_revoked' end,'discussion_group',p_group_id::text,'',jsonb_build_object('user_id',p_user_id));
  return true;
end; $$;

revoke all on function public.create_discussion_group(text,text) from public,anon;
revoke all on function public.join_discussion_group(uuid) from public,anon;
revoke all on function public.assign_discussion_leader(uuid,uuid,boolean) from public,anon;
grant execute on function public.create_discussion_group(text,text) to authenticated;
grant execute on function public.join_discussion_group(uuid) to authenticated;
grant execute on function public.assign_discussion_leader(uuid,uuid,boolean) to authenticated;

-- ---------------------------
-- چت خصوصی، گروه، کانال، دعوت، واکنش، سنجاق و نظرسنجی
-- ---------------------------
create table if not exists public.chat_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id,blocked_id),
  check(blocker_id <> blocked_id)
);
alter table public.chat_blocks enable row level security;
revoke all on public.chat_blocks from anon,authenticated;
grant select,insert,delete on public.chat_blocks to authenticated;
drop policy if exists hgd_blocks_own on public.chat_blocks;
create policy hgd_blocks_own on public.chat_blocks for select to authenticated using (blocker_id=(select auth.uid()));
drop policy if exists hgd_blocks_insert_own on public.chat_blocks;
create policy hgd_blocks_insert_own on public.chat_blocks for insert to authenticated with check (blocker_id=(select auth.uid()) and not exists(select 1 from public.chat_blocks reciprocal where reciprocal.blocker_id=blocked_id and reciprocal.blocked_id=blocker_id));
drop policy if exists hgd_blocks_delete_own on public.chat_blocks;
create policy hgd_blocks_delete_own on public.chat_blocks for delete to authenticated using (blocker_id=(select auth.uid()));

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct','group','channel')),
  visibility text not null default 'private' check (visibility in ('private','public')),
  title text not null default '' check (char_length(title) <= 120),
  description text not null default '' check (char_length(description) <= 1200),
  direct_key text unique,
  is_active boolean not null default true,
  slow_mode_seconds integer not null default 0 check (slow_mode_seconds between 0 and 3600),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check ((kind='direct' and direct_key is not null and visibility='private') or kind<>'direct')
);
create index if not exists chat_conversations_discovery_idx on public.chat_conversations(kind,visibility,is_active,last_message_at desc);
create table if not exists public.chat_members (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'member' check(member_role in ('owner','admin','moderator','member','subscriber')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  muted_until timestamptz,
  primary key(conversation_id,user_id)
);
create index if not exists chat_members_user_idx on public.chat_members(user_id,conversation_id);
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  reply_to uuid references public.chat_messages(id) on delete set null,
  forwarded_from uuid references public.chat_messages(id) on delete set null,
  pinned_at timestamptz,
  pinned_by uuid references auth.users(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check(reply_to is null or reply_to <> id)
);
create index if not exists chat_messages_conversation_created_idx on public.chat_messages(conversation_id,created_at desc);
create index if not exists chat_messages_sender_created_idx on public.chat_messages(sender_id,created_at desc);
create table if not exists public.chat_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check(emoji in ('👍','❤️','😂','🤝','🙏','💡','🎉','💯')),
  created_at timestamptz not null default now(),
  primary key(message_id,user_id,emoji)
);
create table if not exists public.chat_invites (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  invite_code text not null unique default replace(gen_random_uuid()::text,'-','') check(invite_code ~ '^[a-f0-9]{32}$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz,
  max_uses integer not null default 20 check(max_uses between 1 and 5000),
  use_count integer not null default 0 check(use_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check(expires_at is null or expires_at > created_at)
);
create index if not exists chat_invites_conversation_idx on public.chat_invites(conversation_id,created_at desc);
create table if not exists public.chat_polls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.chat_messages(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  question text not null check(char_length(btrim(question)) between 2 and 240),
  multiple_choice boolean not null default false,
  ends_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table if not exists public.chat_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.chat_polls(id) on delete cascade,
  option_text text not null check(char_length(btrim(option_text)) between 1 and 160),
  position smallint not null check(position between 0 and 9),
  unique(poll_id,position)
);
create table if not exists public.chat_poll_votes (
  poll_id uuid not null references public.chat_polls(id) on delete cascade,
  option_id uuid not null references public.chat_poll_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(poll_id,option_id,user_id)
);

alter table public.chat_conversations enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reactions enable row level security;
alter table public.chat_invites enable row level security;
alter table public.chat_polls enable row level security;
alter table public.chat_poll_options enable row level security;
alter table public.chat_poll_votes enable row level security;
-- Helper functions for chat RLS are created after membership schema.
create or replace function private.hgd_can_read_chat(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.chat_conversations c where c.id=p_conversation_id and c.is_active and ((c.kind='channel' and c.visibility='public') or exists(select 1 from public.chat_members m where m.conversation_id=c.id and m.user_id=auth.uid()))) or private.hgd_is_chat_moderator();
$$;
create or replace function private.hgd_can_manage_chat(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select private.hgd_is_admin() or exists(select 1 from public.chat_members m where m.conversation_id=p_conversation_id and m.user_id=auth.uid() and m.member_role in ('owner','admin','moderator'));
$$;
create or replace function private.hgd_can_send_chat(p_conversation_id uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_kind text; v_visibility text; v_slow integer; v_muted timestamptz;
begin
 if auth.uid() is null then return false; end if;
 select kind,visibility,slow_mode_seconds into v_kind,v_visibility,v_slow from public.chat_conversations where id=p_conversation_id and is_active;
 if not found then return false; end if;
 if exists(select 1 from public.chat_blocks b where (b.blocker_id=auth.uid() and b.blocked_id in (select m.user_id from public.chat_members m where m.conversation_id=p_conversation_id)) or (b.blocked_id=auth.uid() and b.blocker_id in (select m.user_id from public.chat_members m where m.conversation_id=p_conversation_id))) then return false; end if;
 if v_kind='channel' then
   if not private.hgd_can_manage_chat(p_conversation_id) then return false; end if;
 elsif not exists(select 1 from public.chat_members m where m.conversation_id=p_conversation_id and m.user_id=auth.uid()) then
   return false;
 end if;
 select muted_until into v_muted from public.chat_members where conversation_id=p_conversation_id and user_id=auth.uid();
 if v_muted is not null and v_muted>now() then return false; end if;
 if exists(select 1 from public.user_moderation_actions a where a.user_id=auth.uid() and a.revoked_at is null and a.starts_at<=now() and (a.ends_at is null or a.ends_at>now()) and a.action in ('mute','ban','kick') and a.scope in ('global','chat','community','channel','group')) then return false; end if;
 if v_slow>0 and exists(select 1 from public.chat_messages m where m.conversation_id=p_conversation_id and m.sender_id=auth.uid() and m.created_at>now()-make_interval(secs=>v_slow)) then return false; end if;
 return true;
end; $$;
revoke all on function private.hgd_can_read_chat(uuid) from public,anon;
revoke all on function private.hgd_can_manage_chat(uuid) from public,anon;
revoke all on function private.hgd_can_send_chat(uuid) from public,anon;
grant execute on function private.hgd_can_read_chat(uuid) to authenticated;
grant execute on function private.hgd_can_manage_chat(uuid) to authenticated;
grant execute on function private.hgd_can_send_chat(uuid) to authenticated;

create or replace function private.hgd_is_chat_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.chat_members m where m.conversation_id=p_conversation_id and m.user_id=auth.uid());
$$;
create or replace function private.hgd_is_discussion_member(p_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.discussion_group_members m where m.group_id=p_group_id and m.user_id=auth.uid());
$$;
revoke all on function private.hgd_is_chat_member(uuid) from public,anon;
revoke all on function private.hgd_is_discussion_member(uuid) from public,anon;
grant execute on function private.hgd_is_chat_member(uuid) to authenticated;
grant execute on function private.hgd_is_discussion_member(uuid) to authenticated;

create or replace function private.hgd_prepare_chat_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'ابتدا وارد حساب شو' using errcode='42501'; end if;
 if new.sender_id is not null and new.sender_id is distinct from auth.uid() then raise exception 'sender_id does not match current user' using errcode='42501'; end if;
 new.sender_id := auth.uid();
 if char_length(btrim(new.body))=0 then raise exception 'متن پیام خالی است'; end if;
 if (select count(*) from public.chat_messages m where m.sender_id=auth.uid() and m.created_at>now()-interval '10 seconds') >= 8 then
   raise exception 'برای جلوگیری از هرزنامه، آهسته‌تر پیام بفرست.' using errcode='P0001';
 end if;
 return new;
end; $$;
revoke all on function private.hgd_prepare_chat_message() from public,anon,authenticated;
drop trigger if exists hgd_chat_message_prepare on public.chat_messages;
create trigger hgd_chat_message_prepare before insert on public.chat_messages for each row execute function private.hgd_prepare_chat_message();
create or replace function private.hgd_stamp_chat_message_update()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.body is distinct from old.body then new.edited_at := pg_catalog.now(); end if;
 if old.deleted_at is null and new.deleted_at is not null then new.body := 'این پیام حذف شد.'; new.edited_at := pg_catalog.now(); end if;
 return new;
end; $$;
revoke all on function private.hgd_stamp_chat_message_update() from public,anon,authenticated;
drop trigger if exists hgd_chat_message_stamp_update on public.chat_messages;
create trigger hgd_chat_message_stamp_update before update of body,deleted_at on public.chat_messages for each row execute function private.hgd_stamp_chat_message_update();
revoke all on public.chat_conversations,public.chat_members,public.chat_messages,public.chat_reactions,public.chat_invites,public.chat_polls,public.chat_poll_options,public.chat_poll_votes from anon,authenticated;
grant select on public.chat_conversations,public.chat_members,public.chat_messages,public.chat_reactions,public.chat_invites,public.chat_polls,public.chat_poll_options,public.chat_poll_votes to authenticated;
-- Conversation creation is available only through the security-definer RPCs below.
grant insert(conversation_id,user_id,body,reply_to,forwarded_from) on public.chat_messages to authenticated;
grant update(body,edited_at,deleted_at) on public.chat_messages to authenticated;
grant insert(message_id,user_id,emoji) on public.chat_reactions to authenticated;
grant delete on public.chat_reactions to authenticated;
grant insert(message_id,conversation_id,question,multiple_choice,ends_at,created_by) on public.chat_polls to authenticated;
grant insert(poll_id,option_text,position) on public.chat_poll_options to authenticated;
grant insert(poll_id,option_id,user_id) on public.chat_poll_votes to authenticated;
grant update(last_read_at,muted_until) on public.chat_members to authenticated;

drop policy if exists hgd_chat_conversations_read on public.chat_conversations;
create policy hgd_chat_conversations_read on public.chat_conversations for select to authenticated using (
 (visibility='public' and kind='channel' and is_active) or exists(select 1 from public.chat_members m where m.conversation_id=id and m.user_id=(select auth.uid())) or private.hgd_is_chat_moderator()
);
drop policy if exists hgd_chat_conversations_create on public.chat_conversations;
create policy hgd_chat_conversations_create on public.chat_conversations for insert to authenticated with check (created_by=(select auth.uid()) and kind in ('group','channel') and (visibility='private' or (kind='channel' and visibility='public')) and direct_key is null);
drop policy if exists hgd_chat_members_read on public.chat_members;
create policy hgd_chat_members_read on public.chat_members for select to authenticated using (user_id=(select auth.uid()) or private.hgd_is_chat_member(conversation_id) or private.hgd_is_chat_moderator());
drop policy if exists hgd_chat_members_update_own on public.chat_members;
create policy hgd_chat_members_update_own on public.chat_members for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
drop policy if exists hgd_chat_messages_read on public.chat_messages;
create policy hgd_chat_messages_read on public.chat_messages for select to authenticated using (
 exists(select 1 from public.chat_conversations c where c.id=conversation_id and c.is_active and (private.hgd_is_chat_moderator() or (c.visibility='public' and c.kind='channel') or exists(select 1 from public.chat_members m where m.conversation_id=c.id and m.user_id=(select auth.uid()))))
 and (deleted_at is null or sender_id=(select auth.uid()) or private.hgd_is_chat_moderator())
);
drop policy if exists hgd_chat_messages_insert on public.chat_messages;
create policy hgd_chat_messages_insert on public.chat_messages for insert to authenticated with check (
 sender_id=(select auth.uid()) and deleted_at is null and pinned_at is null and pinned_by is null
 and private.hgd_can_send_chat(conversation_id)
 and (reply_to is null or exists(select 1 from public.chat_messages parent where parent.id=reply_to and parent.conversation_id=conversation_id and parent.deleted_at is null))
);
drop policy if exists hgd_chat_messages_update_own on public.chat_messages;
create policy hgd_chat_messages_update_own on public.chat_messages for update to authenticated using (sender_id=(select auth.uid()) and created_at>now()-interval '10 minutes' and deleted_at is null) with check (sender_id=(select auth.uid()) and pinned_at is null and pinned_by is null);
drop policy if exists hgd_chat_messages_moderator_update on public.chat_messages;
create policy hgd_chat_messages_moderator_update on public.chat_messages for update to authenticated using (private.hgd_is_chat_moderator() or private.hgd_can_manage_chat(conversation_id)) with check (private.hgd_is_chat_moderator() or private.hgd_can_manage_chat(conversation_id));
drop policy if exists hgd_chat_reactions_read on public.chat_reactions;
create policy hgd_chat_reactions_read on public.chat_reactions for select to authenticated using (exists(select 1 from public.chat_messages m where m.id=message_id and private.hgd_can_read_chat(m.conversation_id)));
drop policy if exists hgd_chat_reactions_insert on public.chat_reactions;
create policy hgd_chat_reactions_insert on public.chat_reactions for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.chat_messages m where m.id=message_id and m.deleted_at is null and private.hgd_can_send_chat(m.conversation_id)));
drop policy if exists hgd_chat_reactions_delete on public.chat_reactions;
create policy hgd_chat_reactions_delete on public.chat_reactions for delete to authenticated using(user_id=(select auth.uid()));
drop policy if exists hgd_chat_invites_read on public.chat_invites;
create policy hgd_chat_invites_read on public.chat_invites for select to authenticated using(created_by=(select auth.uid()) or private.hgd_can_manage_chat(conversation_id));
drop policy if exists hgd_chat_polls_read on public.chat_polls;
create policy hgd_chat_polls_read on public.chat_polls for select to authenticated using(private.hgd_can_read_chat(conversation_id));
drop policy if exists hgd_chat_polls_insert on public.chat_polls;
create policy hgd_chat_polls_insert on public.chat_polls for insert to authenticated with check(created_by=(select auth.uid()) and private.hgd_can_send_chat(conversation_id) and exists(select 1 from public.chat_messages m where m.id=message_id and m.conversation_id=chat_polls.conversation_id and m.sender_id=(select auth.uid())));
drop policy if exists hgd_chat_poll_options_read on public.chat_poll_options;
create policy hgd_chat_poll_options_read on public.chat_poll_options for select to authenticated using(exists(select 1 from public.chat_polls p where p.id=poll_id and private.hgd_can_read_chat(p.conversation_id)));
drop policy if exists hgd_chat_poll_options_insert on public.chat_poll_options;
create policy hgd_chat_poll_options_insert on public.chat_poll_options for insert to authenticated with check(exists(select 1 from public.chat_polls p where p.id=poll_id and p.created_by=(select auth.uid()) and private.hgd_can_send_chat(p.conversation_id)));
drop policy if exists hgd_chat_poll_votes_read on public.chat_poll_votes;
create policy hgd_chat_poll_votes_read on public.chat_poll_votes for select to authenticated using(user_id=(select auth.uid()) or exists(select 1 from public.chat_polls p where p.id=poll_id and private.hgd_can_read_chat(p.conversation_id)));
drop policy if exists hgd_chat_poll_votes_insert on public.chat_poll_votes;
create policy hgd_chat_poll_votes_insert on public.chat_poll_votes for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.chat_polls p where p.id=poll_id and (p.ends_at is null or p.ends_at>now()) and private.hgd_can_send_chat(p.conversation_id)) and exists(select 1 from public.chat_poll_options o where o.id=option_id and o.poll_id=poll_id));

create or replace function public.create_chat_conversation(p_kind text,p_title text,p_visibility text default 'private',p_description text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
 if auth.uid() is null then raise exception 'ابتدا وارد حساب شو' using errcode='42501'; end if;
 if p_kind not in ('group','channel') or p_visibility not in ('private','public') or (p_visibility='public' and p_kind<>'channel') then raise exception 'نوع گفتگو یا حریم خصوصی نامعتبر است'; end if;
 perform private.hgd_assert_can_post(case when p_kind='channel' then 'channel' else 'group' end);
 insert into public.chat_conversations(kind,visibility,title,description,created_by)
 values(p_kind,p_visibility,left(btrim(p_title),120),left(coalesce(p_description,''),1200),auth.uid()) returning id into v_id;
 insert into public.chat_members(conversation_id,user_id,member_role) values(v_id,auth.uid(),'owner');
 perform private.hgd_write_audit('chat_conversation_created',p_kind,v_id::text,'',jsonb_build_object('visibility',p_visibility));
 return v_id;
end; $$;

create or replace function public.create_direct_chat(p_other_user_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_key text;
begin
 if auth.uid() is null or p_other_user_id is null or p_other_user_id=auth.uid() then raise exception 'کاربر مقصد نامعتبر است'; end if;
 if exists(select 1 from public.chat_blocks b where (b.blocker_id=auth.uid() and b.blocked_id=p_other_user_id) or (b.blocker_id=p_other_user_id and b.blocked_id=auth.uid())) then raise exception 'گفت‌وگوی خصوصی به دلیل تنظیم حریم خصوصی ممکن نیست' using errcode='42501'; end if;
 v_key := least(auth.uid()::text,p_other_user_id::text)||':'||greatest(auth.uid()::text,p_other_user_id::text);
 insert into public.chat_conversations(kind,visibility,title,direct_key,created_by) values('direct','private','گفت‌وگوی خصوصی',v_key,auth.uid()) on conflict(direct_key) do update set direct_key=excluded.direct_key returning id into v_id;
 insert into public.chat_members(conversation_id,user_id,member_role) values(v_id,auth.uid(),'member'),(v_id,p_other_user_id,'member') on conflict do nothing;
 return v_id;
end; $$;

create or replace function public.join_chat_conversation(p_conversation_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v public.chat_conversations%rowtype;
begin
 select * into v from public.chat_conversations where id=p_conversation_id for update;
 if not found or not v.is_active then raise exception 'گفتگو در دسترس نیست'; end if;
 if v.kind='direct' then raise exception 'گفت‌وگوی خصوصی فقط با دعوت مستقیم ایجاد می‌شود' using errcode='42501'; end if;
 if v.visibility<>'public' then raise exception 'برای عضویت به لینک دعوت معتبر نیاز است' using errcode='42501'; end if;
 insert into public.chat_members(conversation_id,user_id,member_role) values(v.id,auth.uid(),case when v.kind='channel' then 'subscriber' else 'member' end) on conflict do nothing;
 return true;
end; $$;

create or replace function public.create_chat_invite(p_conversation_id uuid,p_expires_at timestamptz default null,p_max_uses integer default 20) returns text
language plpgsql security definer set search_path = '' as $$
declare v_code text;
begin
 if not private.hgd_can_manage_chat(p_conversation_id) then raise exception 'فقط مدیر گفتگو می‌تواند لینک دعوت بسازد' using errcode='42501'; end if;
 if p_max_uses<1 or p_max_uses>5000 or (p_expires_at is not null and (p_expires_at<=now() or p_expires_at>now()+interval '365 days')) then raise exception 'محدودیت لینک دعوت نامعتبر است'; end if;
 insert into public.chat_invites(conversation_id,created_by,expires_at,max_uses) values(p_conversation_id,auth.uid(),p_expires_at,p_max_uses) returning invite_code into v_code;
 perform private.hgd_write_audit('chat_invite_created','chat_conversation',p_conversation_id::text,'',jsonb_build_object('max_uses',p_max_uses,'expires_at',p_expires_at));
 return v_code;
end; $$;

create or replace function public.join_chat_invite(p_invite_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v public.chat_invites%rowtype; c public.chat_conversations%rowtype;
begin
 if auth.uid() is null then raise exception 'ابتدا وارد حساب شو' using errcode='42501'; end if;
 select * into v from public.chat_invites where invite_code=p_invite_code for update;
 if not found or v.revoked_at is not null or (v.expires_at is not null and v.expires_at<=now()) or v.use_count>=v.max_uses then raise exception 'لینک دعوت منقضی، لغو یا تکمیل شده است'; end if;
 select * into c from public.chat_conversations where id=v.conversation_id and is_active for update;
 if not found or c.kind='direct' then raise exception 'گفتگو در دسترس نیست'; end if;
 if exists(select 1 from public.chat_blocks b join public.chat_members m on m.conversation_id=c.id and (m.user_id=b.blocker_id or m.user_id=b.blocked_id) where (b.blocker_id=auth.uid() and b.blocked_id=m.user_id) or (b.blocked_id=auth.uid() and b.blocker_id=m.user_id)) then raise exception 'عضویت به دلیل تنظیم حریم خصوصی ممکن نیست' using errcode='42501'; end if;
 insert into public.chat_members(conversation_id,user_id,member_role) values(c.id,auth.uid(),case when c.kind='channel' then 'subscriber' else 'member' end) on conflict do nothing;
 if not exists(select 1 from public.chat_members where conversation_id=c.id and user_id=auth.uid()) then raise exception 'عضویت انجام نشد'; end if;
 update public.chat_invites set use_count=use_count+1 where id=v.id;
 return c.id;
end; $$;

create or replace function public.pin_chat_message(p_message_id uuid,p_pin boolean,p_reason text default '') returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_conv uuid;
begin
 select conversation_id into v_conv from public.chat_messages where id=p_message_id;
 if not found or not private.hgd_can_manage_chat(v_conv) then raise exception 'اجازهٔ سنجاق‌کردن این پیام را نداری' using errcode='42501'; end if;
 update public.chat_messages set pinned_at=case when p_pin then now() else null end,pinned_by=case when p_pin then auth.uid() else null end where id=p_message_id;
 perform private.hgd_write_audit(case when p_pin then 'chat_message_pinned' else 'chat_message_unpinned' end,'chat_message',p_message_id::text,p_reason,'{}'::jsonb);
 return true;
end; $$;

create or replace function public.create_chat_poll(p_conversation_id uuid,p_question text,p_options text[],p_multiple_choice boolean default false,p_ends_at timestamptz default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_message_id uuid; v_poll_id uuid; v_option text; v_pos integer := 0; v_count integer;
begin
 if auth.uid() is null then raise exception 'ابتدا وارد حساب شو' using errcode='42501'; end if;
 perform private.hgd_assert_can_post('chat');
 if not private.hgd_can_send_chat(p_conversation_id) then raise exception 'اجازهٔ ایجاد نظرسنجی در این گفتگو را نداری' using errcode='42501'; end if;
 if char_length(btrim(coalesce(p_question,''))) not between 2 and 240 then raise exception 'پرسش نظرسنجی نامعتبر است'; end if;
 if p_options is null or cardinality(p_options) < 2 or cardinality(p_options) > 10 then raise exception 'نظرسنجی باید بین ۲ تا ۱۰ گزینه داشته باشد'; end if;
 if p_ends_at is not null and p_ends_at <= now() then raise exception 'زمان پایان باید در آینده باشد'; end if;
 select count(*) into v_count from (select distinct left(btrim(x),160) as option_text from unnest(p_options) x where char_length(btrim(x)) between 1 and 160) o;
 if v_count < 2 or v_count <> cardinality(p_options) then raise exception 'گزینه‌ها نباید خالی یا تکراری باشند'; end if;
 insert into public.chat_messages(conversation_id,body) values(p_conversation_id,'نظرسنجی: '||left(btrim(p_question),240)) returning id into v_message_id;
 insert into public.chat_polls(message_id,conversation_id,question,multiple_choice,ends_at,created_by) values(v_message_id,p_conversation_id,left(btrim(p_question),240),coalesce(p_multiple_choice,false),p_ends_at,auth.uid()) returning id into v_poll_id;
 foreach v_option in array p_options loop
   v_pos := v_pos + 1;
   insert into public.chat_poll_options(poll_id,option_text,position) values(v_poll_id,left(btrim(v_option),160),v_pos);
 end loop;
 perform private.hgd_write_audit('chat_poll_created','chat_poll',v_poll_id::text,'',jsonb_build_object('conversation_id',p_conversation_id,'options_count',cardinality(p_options)));
 return v_poll_id;
end; $$;

create or replace function public.vote_chat_poll(p_poll_id uuid,p_option_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_poll public.chat_polls%rowtype;
begin
 if auth.uid() is null then raise exception 'ابتدا وارد حساب شو' using errcode='42501'; end if;
 select * into v_poll from public.chat_polls where id=p_poll_id for update;
 if not found or (v_poll.ends_at is not null and v_poll.ends_at<=now()) then raise exception 'نظرسنجی پیدا نشد یا پایان یافته است'; end if;
 if not private.hgd_can_read_chat(v_poll.conversation_id) or not private.hgd_can_send_chat(v_poll.conversation_id) then raise exception 'اجازهٔ رأی‌دادن در این نظرسنجی را نداری' using errcode='42501'; end if;
 if not exists(select 1 from public.chat_poll_options where id=p_option_id and poll_id=p_poll_id) then raise exception 'گزینهٔ این نظرسنجی معتبر نیست'; end if;
 if not v_poll.multiple_choice and exists(select 1 from public.chat_poll_votes where poll_id=p_poll_id and user_id=auth.uid()) then raise exception 'قبلاً در این نظرسنجی رأی داده‌ای'; end if;
 insert into public.chat_poll_votes(poll_id,option_id,user_id) values(p_poll_id,p_option_id,auth.uid()) on conflict do nothing;
 return true;
end; $$;

revoke all on function public.create_chat_conversation(text,text,text,text) from public,anon;
revoke all on function public.create_direct_chat(uuid) from public,anon;
revoke all on function public.join_chat_conversation(uuid) from public,anon;
revoke all on function public.create_chat_invite(uuid,timestamptz,integer) from public,anon;
revoke all on function public.join_chat_invite(text) from public,anon;
revoke all on function public.pin_chat_message(uuid,boolean,text) from public,anon;
revoke all on function public.create_chat_poll(uuid,text,text[],boolean,timestamptz) from public,anon;
revoke all on function public.vote_chat_poll(uuid,uuid) from public,anon;
grant execute on function public.create_chat_conversation(text,text,text,text) to authenticated;
grant execute on function public.create_direct_chat(uuid) to authenticated;
grant execute on function public.join_chat_conversation(uuid) to authenticated;
grant execute on function public.create_chat_invite(uuid,timestamptz,integer) to authenticated;
grant execute on function public.join_chat_invite(text) to authenticated;
grant execute on function public.pin_chat_message(uuid,boolean,text) to authenticated;
grant execute on function public.create_chat_poll(uuid,text,text[],boolean,timestamptz) to authenticated;
grant execute on function public.vote_chat_poll(uuid,uuid) to authenticated;

-- ---------------------------
-- گزارش تخلف واحد برای چت، مباحثه، کانال و حساب‌ها
-- ---------------------------
create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete restrict,
  target_type text not null check(target_type in ('chat_message','debate_post','debate_topic','discussion_group','chat_conversation','user','book','announcement')),
  target_id text not null check(char_length(target_id) between 1 and 160),
  reason text not null check(reason in ('insult','harassment','off_topic','spam','scam','impersonation','privacy','inappropriate','hate','malicious_file','group_abuse','copyright','other')),
  description text not null default '' check(char_length(description)<=2000),
  status text not null default 'new' check(status in ('new','reviewing','need_info','rejected','resolved','appealed')),
  internal_note text not null default '' check(char_length(internal_note)<=4000),
  resolution text not null default '' check(char_length(resolution)<=2000),
  assigned_to uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(reporter_id,target_type,target_id,reason)
);
create index if not exists community_reports_status_created_idx on public.community_reports(status,created_at desc);
create index if not exists community_reports_target_idx on public.community_reports(target_type,target_id);
alter table public.community_reports enable row level security;
revoke all on public.community_reports from anon,authenticated;
grant select,insert,update on public.community_reports to authenticated;
drop policy if exists hgd_reports_insert_own on public.community_reports;
create policy hgd_reports_insert_own on public.community_reports for insert to authenticated with check(reporter_id=(select auth.uid()) and status='new' and internal_note='' and resolution='' and assigned_to is null and resolved_by is null and resolved_at is null);
drop policy if exists hgd_reports_read_own_or_moderator on public.community_reports;
create policy hgd_reports_read_own_or_moderator on public.community_reports for select to authenticated using(reporter_id=(select auth.uid()) or private.hgd_is_moderator());
drop policy if exists hgd_reports_moderator_update on public.community_reports;
create policy hgd_reports_moderator_update on public.community_reports for update to authenticated using(private.hgd_is_moderator()) with check(private.hgd_is_moderator());

-- ---------------------------
-- میز مطالعه: یک کتاب شخصی تا سقف 100 MiB، یادداشت و پیشرفت همگام
-- ---------------------------
create table if not exists public.personal_books (
  user_id uuid primary key references auth.users(id) on delete cascade,
  title text not null check(char_length(btrim(title)) between 1 and 200),
  description text not null default '' check(char_length(description)<=2000),
  bucket_id text not null default 'hamghadam-personal-books' check(bucket_id='hamghadam-personal-books'),
  object_path text not null unique check(char_length(object_path)<=700),
  file_name text not null check(char_length(btrim(file_name)) between 1 and 255),
  mime_type text not null check(char_length(mime_type)<=160),
  size_bytes bigint not null check(size_bytes between 1 and 104857600),
  page_count integer check(page_count is null or page_count between 1 and 200000),
  progress_page integer not null default 0 check(progress_page>=0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.personal_books enable row level security;
revoke all on public.personal_books from anon,authenticated;
grant select,insert,update,delete on public.personal_books to authenticated;
drop policy if exists hgd_personal_books_own on public.personal_books;
create policy hgd_personal_books_own on public.personal_books for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists hgd_personal_books_insert_own on public.personal_books;
create policy hgd_personal_books_insert_own on public.personal_books for insert to authenticated with check(user_id=(select auth.uid()) and bucket_id='hamghadam-personal-books' and object_path like (select auth.uid())::text||'/%');
drop policy if exists hgd_personal_books_update_own on public.personal_books;
create policy hgd_personal_books_update_own on public.personal_books for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and object_path like (select auth.uid())::text||'/%' and size_bytes<=104857600);
drop policy if exists hgd_personal_books_delete_own on public.personal_books;
create policy hgd_personal_books_delete_own on public.personal_books for delete to authenticated using(user_id=(select auth.uid()));

create table if not exists public.study_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(char_length(btrim(title)) between 1 and 200),
  body text not null default '' check(char_length(body)<=30000),
  reference text not null default '' check(char_length(reference)<=500),
  is_private boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists study_notes_user_updated_idx on public.study_notes(user_id,updated_at desc);
alter table public.study_notes enable row level security;
revoke all on public.study_notes from anon,authenticated;
grant select,insert,update,delete on public.study_notes to authenticated;
drop policy if exists hgd_study_notes_own on public.study_notes;
create policy hgd_study_notes_own on public.study_notes for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create table if not exists public.study_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_key text not null check(char_length(lesson_key) between 1 and 240),
  page_number integer not null default 0 check(page_number>=0),
  progress_percent numeric(5,2) not null default 0 check(progress_percent between 0 and 100),
  last_studied_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(user_id,lesson_key)
);
alter table public.study_progress enable row level security;
revoke all on public.study_progress from anon,authenticated;
grant select,insert,update,delete on public.study_progress to authenticated;
drop policy if exists hgd_study_progress_own on public.study_progress;
create policy hgd_study_progress_own on public.study_progress for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  front text not null check(char_length(btrim(front)) between 1 and 2000),
  back text not null check(char_length(btrim(back)) between 1 and 4000),
  deck text not null default 'عمومی' check(char_length(deck) between 1 and 120),
  source_reference text not null default '' check(char_length(source_reference)<=500),
  ease_factor numeric(4,2) not null default 2.50 check(ease_factor between 1.30 and 4.00),
  interval_days integer not null default 0 check(interval_days between 0 and 3650),
  due_at timestamptz not null default now(),
  repetitions integer not null default 0 check(repetitions>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists flashcards_review_idx on public.flashcards(user_id,due_at);
alter table public.flashcards enable row level security;
revoke all on public.flashcards from anon,authenticated;
grant select,insert,update,delete on public.flashcards to authenticated;
drop policy if exists hgd_flashcards_own on public.flashcards;
create policy hgd_flashcards_own on public.flashcards for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

create table if not exists public.flashcard_reviews (
  id uuid primary key default gen_random_uuid(),
  flashcard_id uuid not null references public.flashcards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  quality smallint not null check(quality between 0 and 5),
  previous_interval_days integer not null default 0 check(previous_interval_days>=0),
  next_interval_days integer not null check(next_interval_days>=0),
  reviewed_at timestamptz not null default now()
);
create index if not exists flashcard_reviews_user_date_idx on public.flashcard_reviews(user_id,reviewed_at desc);
alter table public.flashcard_reviews enable row level security;
revoke all on public.flashcard_reviews from anon,authenticated;
grant select,insert on public.flashcard_reviews to authenticated;
drop policy if exists hgd_flashcard_reviews_own on public.flashcard_reviews;
create policy hgd_flashcard_reviews_own on public.flashcard_reviews for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists hgd_flashcard_reviews_insert_own on public.flashcard_reviews;
create policy hgd_flashcard_reviews_insert_own on public.flashcard_reviews for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.flashcards f where f.id=flashcard_id and f.user_id=(select auth.uid())));

-- ---------------------------
-- آزمون، ثبت پاسخ سمت سرور و امتیاز مجازی غیرقابل جعل از کلاینت
-- ---------------------------
create table if not exists public.hamghadam_quizzes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check(slug ~ '^[a-z0-9-]{2,80}$'),
  title text not null check(char_length(btrim(title)) between 2 and 200),
  description text not null default '' check(char_length(description)<=3000),
  category text not null default 'عمومی' check(char_length(category) between 1 and 100),
  difficulty text not null default 'medium' check(difficulty in ('easy','medium','hard')),
  status text not null default 'draft' check(status in ('draft','published','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(ends_at is null or starts_at is null or ends_at>starts_at)
);
create index if not exists hamghadam_quizzes_published_idx on public.hamghadam_quizzes(status,starts_at,ends_at);
create table if not exists public.hamghadam_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.hamghadam_quizzes(id) on delete cascade,
  prompt text not null check(char_length(btrim(prompt)) between 1 and 3000),
  options jsonb not null check(jsonb_typeof(options)='array' and jsonb_array_length(options) between 2 and 6 and pg_catalog.octet_length(options::text)<=12000),
  correct_index smallint not null check(correct_index between 0 and 5),
  explanation text not null default '' check(char_length(explanation)<=3000),
  points integer not null default 10 check(points between 0 and 1000),
  position integer not null default 0 check(position between 0 and 10000),
  created_at timestamptz not null default now(),
  unique(quiz_id,position)
);
create index if not exists quiz_questions_quiz_pos_idx on public.hamghadam_quiz_questions(quiz_id,position);
create table if not exists public.hamghadam_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.hamghadam_quizzes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'in_progress' check(status in ('in_progress','submitted','abandoned')),
  score integer not null default 0 check(score>=0),
  total_points integer not null default 0 check(total_points>=0),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique(id,user_id)
);
create index if not exists quiz_attempts_user_started_idx on public.hamghadam_quiz_attempts(user_id,started_at desc);
create table if not exists public.hamghadam_quiz_answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.hamghadam_quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.hamghadam_quiz_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  answer_index smallint not null check(answer_index between 0 and 5),
  is_correct boolean not null,
  points_awarded integer not null default 0 check(points_awarded between 0 and 1000),
  answered_at timestamptz not null default now(),
  unique(attempt_id,question_id)
);
create table if not exists public.hamghadam_point_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null check(delta between -100000 and 100000),
  reason text not null check(char_length(reason) between 1 and 240),
  event_key text not null check(char_length(event_key) between 1 and 240),
  reference_id text,
  created_at timestamptz not null default now(),
  unique(user_id,event_key)
);
create index if not exists point_ledger_user_created_idx on public.hamghadam_point_ledger(user_id,created_at desc);
alter table public.hamghadam_quizzes enable row level security;
alter table public.hamghadam_quiz_questions enable row level security;
alter table public.hamghadam_quiz_attempts enable row level security;
alter table public.hamghadam_quiz_answers enable row level security;
alter table public.hamghadam_point_ledger enable row level security;
revoke all on public.hamghadam_quizzes,public.hamghadam_quiz_questions,public.hamghadam_quiz_attempts,public.hamghadam_quiz_answers,public.hamghadam_point_ledger from anon,authenticated;
grant select,insert,update,delete on public.hamghadam_quizzes to authenticated;
grant select,insert,update,delete on public.hamghadam_quiz_questions to authenticated;
grant select on public.hamghadam_quiz_attempts,public.hamghadam_quiz_answers,public.hamghadam_point_ledger to authenticated;
drop policy if exists hgd_quiz_public_list on public.hamghadam_quizzes;
create policy hgd_quiz_public_list on public.hamghadam_quizzes for select to authenticated using(status='published' or private.hgd_is_admin());
drop policy if exists hgd_quiz_admin_manage on public.hamghadam_quizzes;
create policy hgd_quiz_admin_manage on public.hamghadam_quizzes for all to authenticated using(private.hgd_is_admin()) with check(private.hgd_is_admin() and created_by=(select auth.uid()));
-- Questions and correct answer index are hidden from ordinary client SELECT; get_public_quiz returns safe question objects.
drop policy if exists hgd_quiz_questions_admin_only on public.hamghadam_quiz_questions;
create policy hgd_quiz_questions_admin_only on public.hamghadam_quiz_questions for all to authenticated using(private.hgd_is_admin()) with check(private.hgd_is_admin());
drop policy if exists hgd_quiz_attempts_own_read on public.hamghadam_quiz_attempts;
create policy hgd_quiz_attempts_own_read on public.hamghadam_quiz_attempts for select to authenticated using(user_id=(select auth.uid()) or private.hgd_is_admin());
drop policy if exists hgd_quiz_answers_own_read on public.hamghadam_quiz_answers;
create policy hgd_quiz_answers_own_read on public.hamghadam_quiz_answers for select to authenticated using(user_id=(select auth.uid()) or private.hgd_is_admin());
drop policy if exists hgd_point_ledger_own_read on public.hamghadam_point_ledger;
create policy hgd_point_ledger_own_read on public.hamghadam_point_ledger for select to authenticated using(user_id=(select auth.uid()) or private.hgd_is_admin());

create or replace function public.get_public_quiz(p_quiz_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_quiz public.hamghadam_quizzes%rowtype; v_questions jsonb;
begin
 select * into v_quiz from public.hamghadam_quizzes q where q.id=p_quiz_id and (private.hgd_is_admin() or (q.status='published' and (q.starts_at is null or q.starts_at<=now()) and (q.ends_at is null or q.ends_at>now())));
 if not found then raise exception 'آزمون پیدا نشد یا در دسترس نیست'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'prompt',prompt,'options',options,'points',points,'position',position) order by position),'[]'::jsonb) into v_questions from public.hamghadam_quiz_questions where quiz_id=p_quiz_id;
 return jsonb_build_object('id',v_quiz.id,'title',v_quiz.title,'description',v_quiz.description,'category',v_quiz.category,'difficulty',v_quiz.difficulty,'questions',v_questions);
end; $$;

create or replace function public.submit_hamghadam_quiz_answer(p_quiz_id uuid,p_question_id uuid,p_answer_index smallint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid:=auth.uid(); v_correct integer; v_points integer; v_explanation text; v_options jsonb; v_attempt public.hamghadam_quiz_attempts%rowtype; v_is_correct boolean; v_answer_id uuid; v_score integer;
begin
 if v_user is null then raise exception 'ابتدا وارد حساب شو' using errcode='42501'; end if;
 if p_answer_index<0 or p_answer_index>5 then raise exception 'گزینهٔ پاسخ نامعتبر است'; end if;
 perform private.hgd_assert_can_post('community');
 if not exists(select 1 from public.hamghadam_quizzes q where q.id=p_quiz_id and q.status='published' and (q.starts_at is null or q.starts_at<=now()) and (q.ends_at is null or q.ends_at>now())) then raise exception 'آزمون در دسترس نیست'; end if;
 select correct_index,points,explanation,options into v_correct,v_points,v_explanation,v_options from public.hamghadam_quiz_questions where id=p_question_id and quiz_id=p_quiz_id;
 if not found then raise exception 'سؤال به این آزمون تعلق ندارد'; end if;
 if p_answer_index >= jsonb_array_length(v_options) then raise exception 'گزینهٔ پاسخ در این سؤال وجود ندارد'; end if;
 select * into v_attempt from public.hamghadam_quiz_attempts where quiz_id=p_quiz_id and user_id=v_user and status='in_progress' order by started_at desc limit 1 for update;
 if not found then insert into public.hamghadam_quiz_attempts(quiz_id,user_id) values(p_quiz_id,v_user) returning * into v_attempt; end if;
 v_is_correct := p_answer_index=v_correct;
 insert into public.hamghadam_quiz_answers(attempt_id,question_id,user_id,answer_index,is_correct,points_awarded)
 values(v_attempt.id,p_question_id,v_user,p_answer_index,v_is_correct,case when v_is_correct then v_points else 0 end) returning id into v_answer_id;
 if v_is_correct and v_points>0 then
   insert into public.hamghadam_point_ledger(user_id,delta,reason,event_key,reference_id)
   values(v_user,v_points,'پاسخ درست آزمون','quiz:'||v_attempt.id::text||':'||p_question_id::text,v_answer_id::text)
   on conflict(user_id,event_key) do nothing;
 end if;
 update public.hamghadam_quiz_attempts set score=score+case when v_is_correct then v_points else 0 end,total_points=total_points+v_points where id=v_attempt.id returning score into v_score;
 return jsonb_build_object('correct',v_is_correct,'points_awarded',case when v_is_correct then v_points else 0 end,'score',v_score,'explanation',v_explanation,'attempt_id',v_attempt.id);
exception when unique_violation then
 raise exception 'پاسخ این سؤال قبلاً در این نوبت ثبت شده است' using errcode='23505';
end; $$;
revoke all on function public.get_public_quiz(uuid) from public,anon;
revoke all on function public.submit_hamghadam_quiz_answer(uuid,uuid,smallint) from public,anon;
grant execute on function public.get_public_quiz(uuid) to authenticated;
grant execute on function public.submit_hamghadam_quiz_answer(uuid,uuid,smallint) to authenticated;

-- ---------------------------
-- پیوست پیام در چت خصوصی/گروه/کانال تا سقف 50 MiB
-- ---------------------------
create table if not exists public.chat_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.chat_messages(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null default 'hamghadam-conversation-files' check(bucket_id='hamghadam-conversation-files'),
  object_path text not null unique check(char_length(object_path)<=700),
  file_name text not null check(char_length(btrim(file_name)) between 1 and 255),
  mime_type text not null check(char_length(mime_type) between 1 and 160),
  size_bytes bigint not null check(size_bytes between 1 and 52428800),
  created_at timestamptz not null default now()
);
create index if not exists chat_attachments_conversation_created_idx on public.chat_attachments(conversation_id,created_at desc);
alter table public.chat_attachments enable row level security;
revoke all on public.chat_attachments from anon,authenticated;
grant select,insert,delete on public.chat_attachments to authenticated;
drop policy if exists hgd_chat_attachments_read on public.chat_attachments;
create policy hgd_chat_attachments_read on public.chat_attachments for select to authenticated using(private.hgd_can_read_chat(conversation_id));
drop policy if exists hgd_chat_attachments_insert on public.chat_attachments;
create policy hgd_chat_attachments_insert on public.chat_attachments for insert to authenticated with check(
 uploaded_by=(select auth.uid()) and object_path like conversation_id::text||'/'||(select auth.uid())::text||'/%'
 and private.hgd_can_send_chat(conversation_id)
 and exists(select 1 from public.chat_messages m where m.id=message_id and m.conversation_id=chat_attachments.conversation_id and m.sender_id=(select auth.uid()))
);
drop policy if exists hgd_chat_attachments_delete_own on public.chat_attachments;
create policy hgd_chat_attachments_delete_own on public.chat_attachments for delete to authenticated using(uploaded_by=(select auth.uid()) or private.hgd_can_manage_chat(conversation_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hamghadam-conversation-files','hamghadam-conversation-files',false,52428800,array[
 'application/pdf','image/png','image/jpeg','image/webp','image/gif','text/plain','text/csv','application/csv',
 'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
 'application/zip','application/x-zip-compressed','application/x-7z-compressed','audio/mpeg','audio/mp4','video/mp4'
]) on conflict(id) do update set name=excluded.name,public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists hgd_chat_files_read on storage.objects;
create policy hgd_chat_files_read on storage.objects for select to authenticated using(bucket_id='hamghadam-conversation-files' and private.hgd_can_read_chat(((storage.foldername(name))[1])::uuid));
drop policy if exists hgd_chat_files_insert on storage.objects;
create policy hgd_chat_files_insert on storage.objects for insert to authenticated with check(bucket_id='hamghadam-conversation-files' and (storage.foldername(name))[2]=(select auth.uid())::text and private.hgd_can_send_chat(((storage.foldername(name))[1])::uuid));
drop policy if exists hgd_chat_files_update on storage.objects;
create policy hgd_chat_files_update on storage.objects for update to authenticated using(bucket_id='hamghadam-conversation-files' and (storage.foldername(name))[2]=(select auth.uid())::text) with check(bucket_id='hamghadam-conversation-files' and (storage.foldername(name))[2]=(select auth.uid())::text);
drop policy if exists hgd_chat_files_delete on storage.objects;
create policy hgd_chat_files_delete on storage.objects for delete to authenticated using(bucket_id='hamghadam-conversation-files' and ((storage.foldername(name))[2]=(select auth.uid())::text or private.hgd_can_manage_chat(((storage.foldername(name))[1])::uuid)));

-- ---------------------------
-- Storage خصوصی: کتاب شخصی 100 MiB؛ فقط مالک شیء خود را می‌خواند/ویرایش می‌کند
-- ---------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hamghadam-personal-books','hamghadam-personal-books',false,104857600,array[
 'application/pdf','text/plain','application/epub+zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword'
])
on conflict(id) do update set name=excluded.name,public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists hgd_personal_books_storage_read_owner on storage.objects;
create policy hgd_personal_books_storage_read_owner on storage.objects for select to authenticated
using(bucket_id='hamghadam-personal-books' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists hgd_personal_books_storage_insert_owner on storage.objects;
create policy hgd_personal_books_storage_insert_owner on storage.objects for insert to authenticated
with check(bucket_id='hamghadam-personal-books' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists hgd_personal_books_storage_update_owner on storage.objects;
create policy hgd_personal_books_storage_update_owner on storage.objects for update to authenticated
using(bucket_id='hamghadam-personal-books' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check(bucket_id='hamghadam-personal-books' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists hgd_personal_books_storage_delete_owner on storage.objects;
create policy hgd_personal_books_storage_delete_owner on storage.objects for delete to authenticated
using(bucket_id='hamghadam-personal-books' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- ---------------------------
-- Referral links tracked by server, not by client-supplied balances
-- ---------------------------
create table if not exists public.referral_codes (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique default substr(replace(gen_random_uuid()::text,'-',''),1,16) check(code ~ '^[a-f0-9]{16}$'),
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);
create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.referral_codes(code) on delete restrict,
  invited_user_id uuid not null unique references auth.users(id) on delete cascade,
  state text not null default 'registered' check(state in ('registered','qualified','reversed')),
  created_at timestamptz not null default now(),
  qualified_at timestamptz
);
alter table public.referral_codes enable row level security;
alter table public.referral_events enable row level security;
revoke all on public.referral_codes,public.referral_events from anon,authenticated;
grant select,insert on public.referral_codes to authenticated;
grant select on public.referral_events to authenticated;
drop policy if exists hgd_referral_own_read on public.referral_codes;
create policy hgd_referral_own_read on public.referral_codes for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists hgd_referral_own_insert on public.referral_codes;
create policy hgd_referral_own_insert on public.referral_codes for insert to authenticated with check(owner_id=(select auth.uid()));
drop policy if exists hgd_referral_events_read on public.referral_events;
create policy hgd_referral_events_read on public.referral_events for select to authenticated using(invited_user_id=(select auth.uid()) or exists(select 1 from public.referral_codes c where c.owner_id=(select auth.uid()) and c.code=referral_events.code) or private.hgd_is_admin());

-- ---------------------------
-- Support admin can view/reply in existing support inbox; all other roles unchanged
-- ---------------------------
drop policy if exists hgd_admin_support_conversations_read on public.support_conversations;
create policy hgd_admin_support_conversations_read on public.support_conversations for select to authenticated using(private.hgd_is_admin());
drop policy if exists hgd_admin_support_conversations_update on public.support_conversations;
create policy hgd_admin_support_conversations_update on public.support_conversations for update to authenticated using(private.hgd_is_admin()) with check(private.hgd_is_admin());
drop policy if exists hgd_admin_support_messages_read on public.support_messages;
create policy hgd_admin_support_messages_read on public.support_messages for select to authenticated using(private.hgd_is_admin());
drop policy if exists hgd_admin_support_messages_insert on public.support_messages;
create policy hgd_admin_support_messages_insert on public.support_messages for insert to authenticated with check(private.hgd_is_admin() and sender_id=(select auth.uid()) and sender_role='support' and exists(select 1 from public.support_conversations c where c.id=conversation_id));

grant select on public.support_conversations,public.support_messages to authenticated;
grant insert(conversation_id,sender_id,sender_role,body) on public.support_messages to authenticated;

-- Generic audit events for moderator actions are logged by the admin edge function and RPCs.
-- No table in this migration grants authenticated users the ability to promote themselves to admin.


-- Audit mutating actions on core management tables without recording message contents or tokens.
create or replace function private.hgd_audit_admin_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_row jsonb; v_id text; v_action text; v_details jsonb;
begin
 v_row := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 v_id := coalesce(v_row->>'id',v_row->>'setting_key',v_row->>'slug',v_row->>'user_id','unknown');
 v_action := lower(tg_table_name)||'_'||lower(tg_op);
 v_details := jsonb_strip_nulls(jsonb_build_object(
   'status',v_row->>'status','state',v_row->>'state','enabled',v_row->>'enabled',
   'is_active',v_row->>'is_active','is_published',v_row->>'is_published','is_pinned',v_row->>'is_pinned',
   'audience',v_row->>'audience','kind',v_row->>'kind','slow_mode_seconds',v_row->>'slow_mode_seconds'
 ));
 if private.hgd_is_admin() then
   insert into public.admin_audit_logs(actor_id,action,target_type,target_id,reason,details)
   values(auth.uid(),left(v_action,100),left(tg_table_name,60),left(v_id,300),'ثبت خودکار تغییر مدیریتی',v_details);
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end; $$;
revoke all on function private.hgd_audit_admin_mutation() from public,anon,authenticated;

 drop trigger if exists hgd_audit_app_settings on public.app_settings;
 create trigger hgd_audit_app_settings after insert or update or delete on public.app_settings for each row execute function private.hgd_audit_admin_mutation();
 drop trigger if exists hgd_audit_occasion_themes on public.occasion_themes;
 create trigger hgd_audit_occasion_themes after insert or update or delete on public.occasion_themes for each row execute function private.hgd_audit_admin_mutation();
 drop trigger if exists hgd_audit_app_announcements on public.app_announcements;
 create trigger hgd_audit_app_announcements after insert or update or delete on public.app_announcements for each row execute function private.hgd_audit_admin_mutation();
 drop trigger if exists hgd_audit_community_reports on public.community_reports;
 create trigger hgd_audit_community_reports after insert or update or delete on public.community_reports for each row execute function private.hgd_audit_admin_mutation();
 drop trigger if exists hgd_audit_debate_topics on public.debate_topics;
 create trigger hgd_audit_debate_topics after insert or update or delete on public.debate_topics for each row execute function private.hgd_audit_admin_mutation();
 drop trigger if exists hgd_audit_discussion_groups on public.discussion_groups;
 create trigger hgd_audit_discussion_groups after insert or update or delete on public.discussion_groups for each row execute function private.hgd_audit_admin_mutation();
 drop trigger if exists hgd_audit_chat_conversations on public.chat_conversations;
 create trigger hgd_audit_chat_conversations after insert or update or delete on public.chat_conversations for each row execute function private.hgd_audit_admin_mutation();
 drop trigger if exists hgd_audit_quizzes on public.hamghadam_quizzes;
 create trigger hgd_audit_quizzes after insert or update or delete on public.hamghadam_quizzes for each row execute function private.hgd_audit_admin_mutation();
