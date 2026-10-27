import { createClient } from '@supabase/supabase-js';
import { createTimedFetch, supabaseRequestTimeout } from './timed-fetch.mjs';

const projectUrl = import.meta.env.VITE_SUPABASE_URL || '';
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export const isSupabaseConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(projectUrl) &&
  /^sb_publishable_[a-zA-Z0-9_-]{20,}$/.test(publishableKey);

// Abort slow HTTP requests so a lost connection cannot leave auth controls locked forever.
const timedFetch = createTimedFetch({ timeoutFor: supabaseRequestTimeout });

// A single client means the app shell and support inbox share one authenticated session.
export const supabase = isSupabaseConfigured
  ? createClient(projectUrl, publishableKey, {
      global: { fetch: timedFetch },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
