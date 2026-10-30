ALTER TABLE public.discussion_groups
  ADD COLUMN IF NOT EXISTS stage text CHECK (stage IS NULL OR char_length(stage) BETWEEN 1 AND 60);

CREATE OR REPLACE FUNCTION private.hgd_set_discussion_group_stage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.stage IS NULL AND NOT private.hgd_is_admin() THEN
    SELECT p.stage INTO NEW.stage FROM public.profiles p WHERE p.id=NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.hgd_set_discussion_group_stage() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hgd_discussion_group_stage_default ON public.discussion_groups;
CREATE TRIGGER hgd_discussion_group_stage_default
  BEFORE INSERT ON public.discussion_groups
  FOR EACH ROW EXECUTE FUNCTION private.hgd_set_discussion_group_stage();

CREATE OR REPLACE FUNCTION public.list_discussion_group_options()
RETURNS TABLE(group_id uuid,title text,topic text,max_members smallint,current_members bigint,stage text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT g.id,g.title,g.topic,g.max_members,count(m.user_id),g.stage
  FROM public.discussion_groups g
  LEFT JOIN public.discussion_group_members m ON m.group_id=g.id
  WHERE g.is_open
    AND (g.stage IS NULL OR g.stage=(SELECT p.stage FROM public.profiles p WHERE p.id=auth.uid()))
  GROUP BY g.id
  ORDER BY count(m.user_id),g.created_at,g.title
$$;
REVOKE ALL ON FUNCTION public.list_discussion_group_options() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_discussion_group_options() TO authenticated;

CREATE OR REPLACE FUNCTION public.select_discussion_group(p_group_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_group public.discussion_groups%rowtype;
  v_stage text;
  v_count integer;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'ورود لازم است' USING errcode='42501'; END IF;
  SELECT p.stage INTO v_stage FROM public.profiles p WHERE p.id=v_user;
  SELECT * INTO v_group FROM public.discussion_groups WHERE id=p_group_id AND is_open FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'گروه در دسترس نیست'; END IF;
  IF v_group.stage IS NOT NULL AND v_stage IS DISTINCT FROM v_group.stage THEN
    RAISE EXCEPTION 'این گروه برای پایهٔ دیگری است';
  END IF;
  SELECT count(*) INTO v_count FROM public.discussion_group_members WHERE group_id=p_group_id;
  IF v_count>=v_group.max_members AND NOT EXISTS (
    SELECT 1 FROM public.discussion_group_members WHERE group_id=p_group_id AND user_id=v_user
  ) THEN RAISE EXCEPTION 'ظرفیت این گروه تکمیل است'; END IF;
  UPDATE public.discussion_groups SET stage=coalesce(stage,v_stage) WHERE id=p_group_id;
  INSERT INTO public.discussion_group_members(group_id,user_id,member_role)
    VALUES(p_group_id,v_user,'member') ON CONFLICT(group_id,user_id) DO NOTHING;
  UPDATE public.profiles SET selected_discussion_group_id=p_group_id WHERE id=v_user;
  RETURN p_group_id;
END;
$$;
REVOKE ALL ON FUNCTION public.select_discussion_group(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.select_discussion_group(uuid) TO authenticated;
