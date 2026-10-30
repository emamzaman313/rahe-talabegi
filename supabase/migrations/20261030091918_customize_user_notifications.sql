ALTER TABLE public.in_app_notifications
  ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '#168574'
    CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT '🔔'
    CHECK (char_length(icon) <= 12);

GRANT INSERT(user_id,title,body,kind,action_url,accent_color,icon)
  ON public.in_app_notifications TO authenticated;
