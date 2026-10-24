import { createClient } from '@supabase/supabase-js';

const projectUrl = import.meta.env.VITE_SUPABASE_URL || '';
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export const isSupabaseConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(projectUrl) &&
  /^sb_publishable_[a-zA-Z0-9_-]{20,}$/.test(publishableKey);

// A single client means the app shell and support inbox share one authenticated session.
export const supabase = isSupabaseConfigured
  ? createClient(projectUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
