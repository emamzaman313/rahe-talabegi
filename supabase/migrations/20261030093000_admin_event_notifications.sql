CREATE OR REPLACE FUNCTION private.hgd_notify_admin_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_title text;
  v_body text;
  v_action text;
  v_icon text;
  v_color text;
BEGIN
  IF TG_TABLE_NAME = 'community_reports' THEN
    v_title := 'گزارش تازه برای بررسی';
    v_body := left('دلیل: ' || coalesce(NEW.reason,'نامشخص') || E'\n' || coalesce(NEW.description,''), 3000);
    v_action := '/admin.html';
    v_icon := '⚑';
    v_color := '#b45309';
  ELSIF TG_TABLE_NAME = 'chat_conversations' AND NEW.kind IN ('group','channel') AND NEW.is_active THEN
    v_title := CASE WHEN NEW.kind='channel' THEN 'کانال تازه ساخته شد' ELSE 'گروه تازه ساخته شد' END;
    v_body := coalesce(nullif(NEW.title,''),'بدون عنوان') || ' · سازنده: ' || NEW.created_by::text;
    v_action := '/index.html?open=chats';
    v_icon := CASE WHEN NEW.kind='channel' THEN '▤' ELSE '👥' END;
    v_color := '#176b67';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.in_app_notifications(user_id,title,body,kind,action_url,accent_color,icon)
  SELECT u.id,v_title,v_body,'system',v_action,v_color,v_icon
  FROM auth.users u
  WHERE coalesce(u.raw_app_meta_data->>'role','') IN ('admin','super_admin')
     OR coalesce(u.raw_app_meta_data->'roles','[]'::jsonb) ? 'admin'
     OR coalesce(u.raw_app_meta_data->'roles','[]'::jsonb) ? 'super_admin';
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.hgd_notify_admin_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hgd_admin_report_notification ON public.community_reports;
CREATE TRIGGER hgd_admin_report_notification
  AFTER INSERT ON public.community_reports
  FOR EACH ROW EXECUTE FUNCTION private.hgd_notify_admin_event();

DROP TRIGGER IF EXISTS hgd_admin_chat_creation_notification ON public.chat_conversations;
CREATE TRIGGER hgd_admin_chat_creation_notification
  AFTER INSERT ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION private.hgd_notify_admin_event();
