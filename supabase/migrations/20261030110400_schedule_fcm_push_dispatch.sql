-- Apply only after dispatch-push-notifications has been deployed to this project.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function private.hgd_invoke_push_dispatcher()
returns void language plpgsql security definer set search_path = '' as $$
declare v_payload text; v_signature text; v_secret text;
begin
 select secret_hex into v_secret from private.push_dispatch_secret where singleton;
 v_payload := jsonb_build_object('type','dispatch','requested_at',clock_timestamp())::text;
 v_signature := encode(extensions.hmac(convert_to(v_payload,'UTF8'),decode(v_secret,'hex'),'sha256'),'hex');
 perform net.http_post(
   url:='https://gnbwcupxtbsjdgnncort.supabase.co/functions/v1/dispatch-push-notifications',
   headers:=jsonb_build_object('Content-Type','application/json'),
   body:=jsonb_build_object('payload',v_payload,'signature',v_signature),
   timeout_milliseconds:=10000
 );
end; $$;
revoke all on function private.hgd_invoke_push_dispatcher() from public,anon,authenticated;

do $$ declare v_job bigint; begin
 select jobid into v_job from cron.job where jobname='dispatch-push-notifications' limit 1;
 if v_job is not null then perform cron.unschedule(v_job); end if;
 perform cron.schedule('dispatch-push-notifications','* * * * *','select private.hgd_invoke_push_dispatcher();');
end $$;
