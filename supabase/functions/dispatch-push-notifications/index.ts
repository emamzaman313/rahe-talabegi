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
async function sendToDevice(apiKey: string, token: string, job: PushJob) {
  const message = String(job.body || '').slice(0, 500);
  const response = await fetch(`https://api.pushy.me/push?api_key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: token,
      data: { message, title: String(job.title || 'اعلان تازه از هم‌قدم').slice(0, 120), notification_id: job.notification_id, action_url: job.action_url || '' },
      time_to_live: 60 * 60 * 24 * 30,
    }),
  });
  const result = await response.json().catch(() => ({}));
  const invalid = Array.isArray(result?.info?.failed) && result.info.failed.includes(token);
  return { ok: response.ok && result?.success === true && !invalid, code: invalid ? 'INVALID_TOKEN' : result?.code || result?.error || 'Pushy API error' };
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

  const pushyApiKey = Deno.env.get('PUSHY_SECRET_API_KEY');
  if (!pushyApiKey) return json({ error: 'PUSHY_SECRET_API_KEY is not configured' }, 503);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: jobs, error: claimError } = await admin.rpc('claim_push_delivery_jobs', { p_limit: 50 });
  if (claimError) return json({ error: 'Could not claim pending push jobs' }, 500);
  if (!Array.isArray(jobs) || jobs.length === 0) return json({ sent: 0, retried: 0 });

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
        const result = await sendToDevice(pushyApiKey, device.token, job);
        if (result.ok) delivered++;
        else if (['INVALID_TOKEN', 'NO_RECIPIENTS'].includes(result.code)) invalidTokens.push(device.token);
        else transientError = result.code;
      } catch (error) { transientError = String(error).slice(0, 300); }
    }
    if (invalidTokens.length) await admin.from('push_device_tokens').delete().in('token', invalidTokens);
    const finished = delivered > 0 || (devices.length === invalidTokens.length);
    await admin.rpc('finish_push_delivery_job', {
      p_notification_id: job.notification_id,
      p_success: finished,
      p_error: transientError || (invalidTokens.length ? 'Pushy registration token expired' : 'Pushy did not accept the message'),
    });
    if (finished) sent++; else retried++;
  }
  return json({ sent, retried });
});
