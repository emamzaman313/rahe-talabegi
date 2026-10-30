import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
});

type PushJob = {
  notification_id: string;
  user_id: string;
  title: string;
  body: string | null;
  action_url: string | null;
  attempts: number;
};
type ServiceAccount = { project_id: string; client_email: string; private_key: string };

const base64url = (value: Uint8Array | string) => {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
};

async function googleAccessToken(account: ServiceAccount): Promise<string> {
  const pem = account.private_key.replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(JSON.stringify({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))}`;
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)));
  const assertion = `${unsigned}.${base64url(signature)}`;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error(`Google OAuth ${response.status}: ${result.error || 'token exchange failed'}`);
  return result.access_token as string;
}

async function sendToDevice(projectId: string, accessToken: string, token: string, job: PushJob) {
  const data: Record<string, string> = { notification_id: job.notification_id };
  if (job.action_url) data.action_url = job.action_url;
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: String(job.title || 'اعلان تازه از هم‌قدم').slice(0, 120), body: String(job.body || '').slice(0, 500) },
        data,
        android: { priority: 'HIGH', notification: { channel_id: 'default', sound: 'default' } },
      },
    }),
  });
  const result = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, code: result?.error?.details?.find?.((x: { errorCode?: string }) => x.errorCode)?.errorCode || result?.error?.status || result?.error?.message || 'FCM error' };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Supabase function environment is incomplete' }, 503);

  let envelope: { payload?: unknown; signature?: unknown };
  try { envelope = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string' || envelope.payload.length > 4096 || !/^[a-f0-9]{64}$/.test(envelope.signature)) {
    return json({ error: 'Invalid dispatch envelope' }, 400);
  }
  const verifier = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: valid, error: verifyError } = await verifier.rpc('verify_push_dispatch_request', {
    p_payload: envelope.payload,
    p_signature: envelope.signature,
  });
  if (verifyError || valid !== true) return json({ error: 'Invalid dispatch signature' }, 401);

  const accountText = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON');
  if (!accountText) return json({ error: 'FCM_SERVICE_ACCOUNT_JSON is not configured' }, 503);
  let account: ServiceAccount;
  try { account = JSON.parse(accountText); } catch { return json({ error: 'FCM service account secret is malformed' }, 503); }
  if (!account.project_id || !account.client_email || !account.private_key) return json({ error: 'FCM service account fields are incomplete' }, 503);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: jobs, error: claimError } = await admin.rpc('claim_push_delivery_jobs', { p_limit: 50 });
  if (claimError) return json({ error: 'Could not claim pending push jobs' }, 500);
  if (!Array.isArray(jobs) || jobs.length === 0) return json({ sent: 0, retried: 0 });

  let accessToken: string;
  try { accessToken = await googleAccessToken(account); }
  catch (error) {
    for (const job of jobs as PushJob[]) await admin.rpc('finish_push_delivery_job', {
      p_notification_id: job.notification_id, p_success: false, p_error: String(error).slice(0, 450),
    });
    return json({ error: 'FCM OAuth failed', retried: jobs.length }, 502);
  }

  let sent = 0;
  let retried = 0;
  for (const job of jobs as PushJob[]) {
    const { data: devices, error: deviceError } = await admin.from('push_device_tokens')
      .select('token').eq('user_id', job.user_id).eq('platform', 'android');
    if (deviceError) {
      await admin.rpc('finish_push_delivery_job', { p_notification_id: job.notification_id, p_success: false, p_error: 'Device lookup failed' });
      retried++;
      continue;
    }
    if (!devices?.length) {
      await admin.rpc('finish_push_delivery_job', { p_notification_id: job.notification_id, p_success: false, p_error: 'No registered Android device yet' });
      retried++;
      continue;
    }

    let delivered = 0;
    let transientError = '';
    const invalidTokens: string[] = [];
    for (const device of devices) {
      try {
        const result = await sendToDevice(account.project_id, accessToken, device.token, job);
        if (result.ok) delivered++;
        else if (['UNREGISTERED', 'INVALID_ARGUMENT', 'NOT_FOUND'].includes(result.code)) invalidTokens.push(device.token);
        else transientError = result.code;
      } catch (error) { transientError = String(error).slice(0, 300); }
    }
    if (invalidTokens.length) await admin.from('push_device_tokens').delete().in('token', invalidTokens);
    const finished = delivered > 0 || (devices.length === invalidTokens.length);
    await admin.rpc('finish_push_delivery_job', {
      p_notification_id: job.notification_id,
      p_success: finished,
      p_error: transientError || (invalidTokens.length ? 'FCM registration token expired' : 'FCM did not accept the message'),
    });
    if (finished) sent++; else retried++;
  }
  return json({ sent, retried });
});
