-- Restore SQL privileges required by admin-only app_settings RLS policies.
-- RLS continues to limit actual inserts/updates to trusted administrators.
GRANT INSERT, UPDATE ON TABLE public.app_settings TO authenticated;
