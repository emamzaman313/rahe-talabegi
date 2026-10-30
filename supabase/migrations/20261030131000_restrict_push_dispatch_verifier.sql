begin;

-- This verifier is called by the trusted push-dispatch Edge Function only.
revoke all on function public.verify_push_dispatch_request(text,text) from public, anon, authenticated;
grant execute on function public.verify_push_dispatch_request(text,text) to service_role;

commit;
