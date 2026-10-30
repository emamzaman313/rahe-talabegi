ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS selected_discussion_group_id uuid
    REFERENCES public.discussion_groups(id) ON DELETE SET NULL;
GRANT UPDATE(selected_discussion_group_id) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.select_discussion_group(p_group_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_group public.discussion_groups%rowtype;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'ورود لازم است' USING errcode='42501'; END IF;
  SELECT * INTO v_group FROM public.discussion_groups
    WHERE id=p_group_id AND is_open FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'گروه در دسترس نیست'; END IF;
  IF (SELECT count(*) FROM public.discussion_group_members WHERE group_id=p_group_id)>=3
     AND NOT EXISTS (SELECT 1 FROM public.discussion_group_members WHERE group_id=p_group_id AND user_id=v_user)
  THEN RAISE EXCEPTION 'ظرفیت این گروه تکمیل است'; END IF;
  INSERT INTO public.discussion_group_members(group_id,user_id,member_role)
    VALUES(p_group_id,v_user,'member') ON CONFLICT(group_id,user_id) DO NOTHING;
  UPDATE public.profiles SET selected_discussion_group_id=p_group_id WHERE id=v_user;
  RETURN p_group_id;
END;
$$;
REVOKE ALL ON FUNCTION public.select_discussion_group(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.select_discussion_group(uuid) TO authenticated;
