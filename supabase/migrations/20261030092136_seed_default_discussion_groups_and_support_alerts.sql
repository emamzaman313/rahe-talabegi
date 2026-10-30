CREATE UNIQUE INDEX IF NOT EXISTS discussion_groups_default_title_unique
  ON public.discussion_groups(title)
  WHERE title IN (
    'شهید مطهری','شهید بهشتی','شهید مفتح','شهید صدر','شهید چمران',
    'شهید قدوسی','شهید باهنر','شهید رجایی','شهید سلیمانی','شهدای طلبه'
  );

INSERT INTO public.discussion_groups(title, topic, created_by, max_members, is_open)
SELECT seed.title, seed.topic, p.id, 3, true
FROM (VALUES
  ('شهید مطهری','اندیشه و مباحثهٔ علمی'),
  ('شهید بهشتی','گفت‌وگوی منطقی و اخلاقی'),
  ('شهید مفتح','گفت‌وگوی حوزه و دانشگاه'),
  ('شهید صدر','استدلال و فهم متن'),
  ('شهید چمران','پرسش و پژوهش'),
  ('شهید قدوسی','مباحثهٔ آموزشی'),
  ('شهید باهنر','مسیر یادگیری پایه'),
  ('شهید رجایی','تمرین و پشتکار'),
  ('شهید سلیمانی','مسئولیت و همیاری'),
  ('شهدای طلبه','گروه هم‌پایه‌ها')
) AS seed(title,topic)
CROSS JOIN LATERAL (SELECT id FROM public.profiles ORDER BY created_at LIMIT 1) p
ON CONFLICT (title) WHERE title IN (
  'شهید مطهری','شهید بهشتی','شهید مفتح','شهید صدر','شهید چمران',
  'شهید قدوسی','شهید باهنر','شهید رجایی','شهید سلیمانی','شهدای طلبه'
) DO NOTHING;

CREATE OR REPLACE FUNCTION private.hgd_notify_support_reply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user uuid;
BEGIN
  IF NEW.sender_role = 'support' THEN
    SELECT user_id INTO v_user FROM public.support_conversations WHERE id=NEW.conversation_id;
    IF v_user IS NOT NULL THEN
      INSERT INTO public.in_app_notifications(user_id,title,body,kind,action_url)
      VALUES(v_user,'پاسخ تازه از پشتیبانی',left(NEW.body,3000),'support','/index.html?open=support');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS hgd_support_reply_notification ON public.support_messages;
CREATE TRIGGER hgd_support_reply_notification
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION private.hgd_notify_support_reply();
