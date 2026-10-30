-- Backgrounds are public assets, while only trusted administrators may upload
-- or remove them. The setting itself is read by authenticated clients.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hamghadam-app-backgrounds','hamghadam-app-backgrounds',true,5242880,
  array['image/jpeg','image/png','image/webp','image/avif'])
on conflict(id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists hgd_background_admin_insert on storage.objects;
create policy hgd_background_admin_insert on storage.objects for insert to authenticated
with check(bucket_id='hamghadam-app-backgrounds' and (storage.foldername(name))[1]='pages' and private.hgd_is_admin());
drop policy if exists hgd_background_admin_update on storage.objects;
create policy hgd_background_admin_update on storage.objects for update to authenticated
using(bucket_id='hamghadam-app-backgrounds' and (storage.foldername(name))[1]='pages' and private.hgd_is_admin())
with check(bucket_id='hamghadam-app-backgrounds' and (storage.foldername(name))[1]='pages' and private.hgd_is_admin());
drop policy if exists hgd_background_admin_delete on storage.objects;
create policy hgd_background_admin_delete on storage.objects for delete to authenticated
using(bucket_id='hamghadam-app-backgrounds' and (storage.foldername(name))[1]='pages' and private.hgd_is_admin());

insert into public.app_settings(setting_key,setting_value,public_read)
values('page_backgrounds','{}'::jsonb,true)
on conflict(setting_key) do update set public_read=true;

-- Secret ballots live in the non-exposed private schema. Neither candidate
-- choice nor intermediate tallies are readable by group members.
create table if not exists private.discussion_group_leader_elections(
  group_id uuid primary key references public.discussion_groups(id) on delete cascade,
  status text not null default 'open' check(status in ('open','pending_approval','approved')),
  candidate_id uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_by uuid references auth.users(id) on delete set null
);
create table if not exists private.discussion_group_leader_ballots(
  group_id uuid not null references private.discussion_group_leader_elections(group_id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(group_id,voter_id)
);
revoke all on all tables in schema private from public,anon,authenticated;
alter table private.discussion_group_leader_elections enable row level security;
alter table private.discussion_group_leader_ballots enable row level security;

create or replace function private.hgd_start_discussion_group_election()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  select count(*) into v_count from public.discussion_group_members where group_id=new.group_id;
  if v_count=3 then
    insert into private.discussion_group_leader_elections(group_id,status,candidate_id,approved_by,started_at,updated_at)
    values(new.group_id,'open',null,null,now(),now())
    on conflict(group_id) do update set status='open',candidate_id=null,approved_by=null,started_at=now(),updated_at=now();
    insert into public.in_app_notifications(user_id,title,body,kind,action_url,accent_color,icon)
    select m.user_id,'انتخاب مسئول مباحثه آغاز شد','گروه شما به ظرفیت سه نفر رسید. از صفحهٔ گروه‌ها به‌صورت محرمانه رأی بده.','system','/index.html?open=groups','#176b67','🗳️'
    from public.discussion_group_members m where m.group_id=new.group_id;
  end if;
  return new;
end;
$$;
revoke all on function private.hgd_start_discussion_group_election() from public,anon,authenticated;
drop trigger if exists hgd_start_discussion_group_election on public.discussion_group_members;
create trigger hgd_start_discussion_group_election after insert on public.discussion_group_members
for each row execute function private.hgd_start_discussion_group_election();

-- Backfill groups that were already full before this migration.
insert into private.discussion_group_leader_elections(group_id,status)
select m.group_id,'open' from public.discussion_group_members m
group by m.group_id having count(*)=3
on conflict(group_id) do nothing;

create or replace function public.list_my_discussion_group_elections()
returns table(group_id uuid,group_title text,election_status text,candidate_id uuid,candidate_name text,has_voted boolean,members jsonb)
language sql stable security definer set search_path='' as $$
  select g.id,g.title,e.status,e.candidate_id,coalesce(nullif(p.display_name,''),'هم‌قدم'),
    exists(select 1 from private.discussion_group_leader_ballots b where b.group_id=g.id and b.voter_id=(select auth.uid())),
    coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(nullif(mp.display_name,''),'عضو هم‌قدم'),'is_me',m.user_id=(select auth.uid())) order by m.joined_at)
      from public.discussion_group_members m left join public.profiles mp on mp.id=m.user_id where m.group_id=g.id),'[]'::jsonb)
  from public.discussion_group_members mine
  join public.discussion_groups g on g.id=mine.group_id
  left join private.discussion_group_leader_elections e on e.group_id=g.id
  left join public.profiles p on p.id=e.candidate_id
  where mine.user_id=(select auth.uid())
$$;
revoke all on function public.list_my_discussion_group_elections() from public,anon;
grant execute on function public.list_my_discussion_group_elections() to authenticated;

create or replace function public.cast_discussion_group_leader_vote(p_group_id uuid,p_candidate_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare v_voter uuid:=auth.uid();v_count integer;v_rank uuid[];v_tallies integer[];v_group_title text;v_winner_name text;v_status text;
begin
  if v_voter is null then raise exception 'ابتدا وارد حساب شو' using errcode='42501'; end if;
  if not exists(select 1 from public.discussion_group_members where group_id=p_group_id and user_id=v_voter) then raise exception 'فقط اعضای گروه می‌توانند رأی دهند' using errcode='42501'; end if;
  if p_candidate_id=v_voter then raise exception 'رأی به خودت امکان‌پذیر نیست'; end if;
  if not exists(select 1 from public.discussion_group_members where group_id=p_group_id and user_id=p_candidate_id) then raise exception 'نامزد باید عضو همین گروه باشد'; end if;
  select status into v_status from private.discussion_group_leader_elections where group_id=p_group_id for update;
  if v_status is distinct from 'open' then raise exception 'رأی‌گیری برای این گروه باز نیست'; end if;
  insert into private.discussion_group_leader_ballots(group_id,voter_id,candidate_id) values(p_group_id,v_voter,p_candidate_id)
  on conflict(group_id,voter_id) do update set candidate_id=excluded.candidate_id,created_at=now();
  select count(*) into v_count from private.discussion_group_leader_ballots where group_id=p_group_id;
  if v_count<3 then return 'open'; end if;
  select array_agg(x.candidate_id order by x.votes desc,x.candidate_id),array_agg(x.votes order by x.votes desc,x.candidate_id)
    into v_rank,v_tallies from (select b.candidate_id,count(*)::integer votes from private.discussion_group_leader_ballots b where b.group_id=p_group_id group by b.candidate_id) x;
  if coalesce(v_tallies[1],0)=coalesce(v_tallies[2],0) then
    delete from private.discussion_group_leader_ballots where group_id=p_group_id;
    update private.discussion_group_leader_elections set updated_at=now() where group_id=p_group_id;
    insert into public.in_app_notifications(user_id,title,body,kind,action_url,accent_color,icon)
      select m.user_id,'رأی‌گیری نیاز به تکرار دارد','آرای برابر شد؛ رأی‌گیری محرمانه از نو آغاز شد.','system','/index.html?open=groups','#9a6a12','🔄'
      from public.discussion_group_members m where m.group_id=p_group_id;
    return 'open';
  end if;
  update private.discussion_group_leader_elections set status='pending_approval',candidate_id=v_rank[1],updated_at=now() where group_id=p_group_id;
  select g.title,coalesce(nullif(p.display_name,''),'عضو هم‌قدم') into v_group_title,v_winner_name from public.discussion_groups g join public.profiles p on p.id=v_rank[1] where g.id=p_group_id;
  insert into public.in_app_notifications(user_id,title,body,kind,action_url,accent_color,icon)
    select u.id,'نامزد مسئول مباحثه منتظر تأیید مدیر است',v_group_title||' · نامزد انتخاب‌شده: '||v_winner_name,'system','/admin.html','#176b67','🗳️'
    from auth.users u where coalesce(u.raw_app_meta_data->>'role','') in ('admin','super_admin') or coalesce(u.raw_app_meta_data->'roles','[]'::jsonb) ?| array['admin','super_admin'];
  return 'pending_approval';
end;
$$;
revoke all on function public.cast_discussion_group_leader_vote(uuid,uuid) from public,anon;
grant execute on function public.cast_discussion_group_leader_vote(uuid,uuid) to authenticated;

create or replace function public.admin_list_pending_discussion_group_elections()
returns table(group_id uuid,group_title text,candidate_id uuid,candidate_name text,vote_count bigint)
language sql stable security definer set search_path='' as $$
  select g.id,g.title,e.candidate_id,coalesce(nullif(p.display_name,''),'عضو هم‌قدم'),
    (select count(*) from private.discussion_group_leader_ballots b where b.group_id=g.id)
  from private.discussion_group_leader_elections e join public.discussion_groups g on g.id=e.group_id
  left join public.profiles p on p.id=e.candidate_id
  where private.hgd_is_admin() and e.status='pending_approval' order by e.updated_at
$$;
revoke all on function public.admin_list_pending_discussion_group_elections() from public,anon;
grant execute on function public.admin_list_pending_discussion_group_elections() to authenticated;

create or replace function public.admin_decide_discussion_group_leader(p_group_id uuid,p_approve boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_candidate uuid;v_title text;v_name text;
begin
  if not private.hgd_is_admin() then raise exception 'دسترسی مدیر لازم است' using errcode='42501'; end if;
  select candidate_id into v_candidate from private.discussion_group_leader_elections where group_id=p_group_id and status='pending_approval' for update;
  if not found or v_candidate is null then raise exception 'درخواست تأیید پیدا نشد'; end if;
  select title into v_title from public.discussion_groups where id=p_group_id;
  select coalesce(nullif(display_name,''),'هم‌قدم') into v_name from public.profiles where id=v_candidate;
  if p_approve then
    update public.discussion_group_members set member_role='member' where group_id=p_group_id and member_role='discussion_leader';
    update public.discussion_group_members set member_role='discussion_leader' where group_id=p_group_id and user_id=v_candidate;
    update private.discussion_group_leader_elections set status='approved',approved_by=auth.uid(),updated_at=now() where group_id=p_group_id;
    insert into public.in_app_notifications(user_id,title,body,kind,action_url,accent_color,icon)
      values(v_candidate,'مسئول مباحثه شدی','مدیر انتخاب تو را برای مسئولیت «'||coalesce(v_title,'گروه مباحثه')||'» تأیید کرد.','success','/index.html?open=groups','#168574','🏅');
    perform private.hgd_write_audit('discussion_leader_approved','discussion_group',p_group_id::text,'',jsonb_build_object('candidate_id',v_candidate));
  else
    delete from private.discussion_group_leader_ballots where group_id=p_group_id;
    update private.discussion_group_leader_elections set status='open',candidate_id=null,approved_by=auth.uid(),started_at=now(),updated_at=now() where group_id=p_group_id;
    insert into public.in_app_notifications(user_id,title,body,kind,action_url,accent_color,icon)
      select m.user_id,'درخواست مسئولیت تأیید نشد','مدیر درخواست «'||coalesce(v_name,'نامزد انتخاب‌شده')||'» را نپذیرفت؛ رأی‌گیری محرمانه از نو انجام می‌شود.','warning','/index.html?open=groups','#a85d29','🔄'
      from public.discussion_group_members m where m.group_id=p_group_id;
    perform private.hgd_write_audit('discussion_leader_rejected','discussion_group',p_group_id::text,'','{}'::jsonb);
  end if;
  return true;
end;
$$;
revoke all on function public.admin_decide_discussion_group_leader(uuid,boolean) from public,anon;
grant execute on function public.admin_decide_discussion_group_leader(uuid,boolean) to authenticated;

-- Keep the old helper admin-only; end users must use the private election.
create or replace function public.assign_discussion_leader(p_group_id uuid,p_user_id uuid,p_assign boolean default true)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not private.hgd_is_admin() then raise exception 'مسئول گروه از راه رأی‌گیری محرمانه تعیین می‌شود' using errcode='42501'; end if;
  if p_assign and not exists(select 1 from public.discussion_group_members where group_id=p_group_id and user_id=p_user_id) then raise exception 'مسئول باید عضو همین گروه باشد'; end if;
  update public.discussion_group_members set member_role='member' where group_id=p_group_id and member_role='discussion_leader';
  if p_assign then update public.discussion_group_members set member_role='discussion_leader' where group_id=p_group_id and user_id=p_user_id; end if;
  return true;
end;
$$;
revoke all on function public.assign_discussion_leader(uuid,uuid,boolean) from public,anon;
grant execute on function public.assign_discussion_leader(uuid,uuid,boolean) to authenticated;
