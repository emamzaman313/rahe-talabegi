-- Visitors may read settings explicitly marked public and stream the public global audio bucket.
GRANT SELECT ON TABLE public.app_settings TO anon, authenticated;
DROP POLICY IF EXISTS hgd_settings_read ON public.app_settings;
CREATE POLICY hgd_settings_read ON public.app_settings
  FOR SELECT TO anon, authenticated
  USING (public_read OR private.hgd_is_admin());

DROP POLICY IF EXISTS hgd_global_audio_public_read ON storage.objects;
CREATE POLICY hgd_global_audio_public_read ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'hamghadam-global-audio' AND (storage.foldername(name))[1] = 'global');
