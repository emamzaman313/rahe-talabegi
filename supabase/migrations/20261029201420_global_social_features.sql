BEGIN;

CREATE OR REPLACE FUNCTION public.hgd_direct_chat_peers(p_conversation_ids uuid[])
RETURNS TABLE(conversation_id uuid, display_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id, COALESCE(NULLIF(btrim(p.display_name), ''), 'کاربر هم‌قدم')
  FROM public.chat_conversations AS c
  JOIN public.chat_members AS mine ON mine.conversation_id = c.id AND mine.user_id = auth.uid()
  JOIN public.chat_members AS peer ON peer.conversation_id = c.id AND peer.user_id <> auth.uid()
  LEFT JOIN public.profiles AS p ON p.id = peer.user_id
  WHERE c.kind = 'direct'
    AND c.is_active
    AND c.id = ANY(COALESCE(p_conversation_ids, ARRAY[]::uuid[]))
  ORDER BY c.id
  LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.hgd_direct_chat_peers(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hgd_direct_chat_peers(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_app_content(p_query text, p_limit integer DEFAULT 40)
RETURNS TABLE(entity_id uuid, target_tab text, title text, snippet text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_query text := lower(btrim(COALESCE(p_query, '')));
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 60);
BEGIN
  IF char_length(v_query) < 2 OR char_length(v_query) > 120 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT hits.entity_id, hits.target_tab, hits.title, hits.snippet
  FROM (
    SELECT c.id AS entity_id, 'chats'::text AS target_tab,
      COALESCE(NULLIF(c.title, ''), CASE c.kind WHEN 'direct' THEN 'گفت‌وگوی خصوصی' WHEN 'group' THEN 'گروه' ELSE 'کانال' END) AS title,
      left(COALESCE(c.description, ''), 240) AS snippet, c.last_message_at AS sort_at
    FROM public.chat_conversations c
    WHERE c.is_active AND (strpos(lower(COALESCE(c.title, '')), v_query) > 0 OR strpos(lower(COALESCE(c.description, '')), v_query) > 0)
    UNION ALL
    SELECT c.id, 'chats'::text, COALESCE(NULLIF(c.title, ''), 'گفت‌وگو'), left(m.body, 240), m.created_at
    FROM public.chat_messages m JOIN public.chat_conversations c ON c.id = m.conversation_id
    WHERE m.deleted_at IS NULL AND strpos(lower(m.body), v_query) > 0
    UNION ALL
    SELECT t.id, 'debates'::text, t.title, left(t.question, 240), t.updated_at
    FROM public.debate_topics t WHERE t.state <> 'hidden' AND (strpos(lower(t.title), v_query) > 0 OR strpos(lower(t.question), v_query) > 0 OR strpos(lower(t.category), v_query) > 0)
    UNION ALL
    SELECT p.topic_id, 'debates'::text, t.title, left(p.body, 240), p.created_at
    FROM public.debate_posts p JOIN public.debate_topics t ON t.id = p.topic_id
    WHERE p.deleted_at IS NULL AND NOT p.moderated_hidden AND t.state <> 'hidden' AND strpos(lower(p.body), v_query) > 0
    UNION ALL
    SELECT a.id, 'announcements'::text, a.title, left(a.body, 240), a.starts_at
    FROM public.app_announcements a WHERE a.is_published AND a.starts_at <= now() AND (a.ends_at IS NULL OR a.ends_at > now()) AND (strpos(lower(a.title), v_query) > 0 OR strpos(lower(a.body), v_query) > 0)
    UNION ALL
    SELECT q.id, 'quizzes'::text, q.title, left(COALESCE(q.description, ''), 240), q.created_at
    FROM public.hamghadam_quizzes q WHERE q.status = 'published' AND (strpos(lower(q.title), v_query) > 0 OR strpos(lower(COALESCE(q.description, '')), v_query) > 0 OR strpos(lower(q.category), v_query) > 0)
    UNION ALL
    SELECT n.id, 'study'::text, n.title, left(COALESCE(n.body, ''), 240), n.updated_at
    FROM public.study_notes n WHERE strpos(lower(n.title || ' ' || COALESCE(n.body, '') || ' ' || COALESCE(n.reference, '')), v_query) > 0
    UNION ALL
    SELECT f.id, 'flashcards'::text, f.front, left(f.back, 240), f.updated_at
    FROM public.flashcards f WHERE strpos(lower(f.front || ' ' || f.back || ' ' || COALESCE(f.deck, '')), v_query) > 0
    UNION ALL
    SELECT b.user_id, 'study'::text, b.title, left(COALESCE(b.description, ''), 240), b.updated_at
    FROM public.personal_books b WHERE strpos(lower(b.title || ' ' || COALESCE(b.description, '')), v_query) > 0
  ) AS hits
  ORDER BY hits.sort_at DESC NULLS LAST
  LIMIT v_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.search_app_content(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_app_content(text, integer) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('hamghadam-global-audio', 'hamghadam-global-audio', true, 20971520,
  ARRAY['audio/mpeg','audio/mp4','audio/aac','audio/ogg','audio/wav','audio/webm','audio/x-wav','audio/x-m4a'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS hgd_global_audio_admin_insert ON storage.objects;
CREATE POLICY hgd_global_audio_admin_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'hamghadam-global-audio' AND (storage.foldername(name))[1] = 'global' AND private.hgd_is_admin());
DROP POLICY IF EXISTS hgd_global_audio_admin_update ON storage.objects;
CREATE POLICY hgd_global_audio_admin_update ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'hamghadam-global-audio' AND (storage.foldername(name))[1] = 'global' AND private.hgd_is_admin())
WITH CHECK (bucket_id = 'hamghadam-global-audio' AND (storage.foldername(name))[1] = 'global' AND private.hgd_is_admin());
DROP POLICY IF EXISTS hgd_global_audio_admin_delete ON storage.objects;
CREATE POLICY hgd_global_audio_admin_delete ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'hamghadam-global-audio' AND (storage.foldername(name))[1] = 'global' AND private.hgd_is_admin());

COMMIT;
