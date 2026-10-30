// Hamghadam privileged admin endpoints. Deploy as a Supabase Edge Function.
// SUPABASE_SERVICE_ROLE_KEY is read only here; never expose it to Vite/client bundles.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const allowedRoles = new Set(['admin', 'support', 'chat_moderator', 'content_moderator', 'quiz_moderator']);
const scopes = new Set(['global', 'community', 'chat', 'debate', 'group', 'channel']);
const moderation = new Set(['warning', 'mute', 'ban', 'kick']);
const safe = (value: unknown, max = 1200) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, max);

type RoleMeta = { role?: string; roles?: string[] };
function hasRole(meta: RoleMeta, roles: string[]) {
  const all = new Set([...(Array.isArray(meta.roles) ? meta.roles : []), ...(meta.role ? [meta.role] : [])]);
  return roles.some((role) => all.has(role));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'فقط درخواست POST مجاز است.' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceKey) return json({ error: 'تنظیم محرمانهٔ تابع مدیریت ناقص است.' }, 500);

  const authorization = req.headers.get('Authorization') || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: 'نشست معتبر لازم است.' }, 401);
  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await authClient.auth.getUser(token);
  if (authError || !auth.user) return json({ error: 'نشست کاربر معتبر نیست.' }, 401);
  const actor = auth.user;
  const actorMeta = (actor.app_metadata || {}) as RoleMeta;
  const isAdmin = hasRole(actorMeta, ['admin', 'super_admin']);
  const isSuperAdmin = hasRole(actorMeta, ['super_admin']);
  if (!isAdmin) return json({ error: 'دسترسی مدیریت تأیید نشد.' }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'بدنهٔ درخواست JSON معتبر نیست.' }, 400); }
  const action = safe(body.action, 80);
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const audit = async (name: string, targetType: string, targetId: string, reason: string, details: Record<string, unknown> = {}) => {
    const { error } = await db.from('admin_audit_logs').insert({ actor_id: actor.id, action: name, target_type: targetType, target_id: targetId, reason: safe(reason, 1200), details });
    if (error) throw error;
  };

  try {
    if (action === 'list_users') {
      const page = Math.max(1, Math.min(10000, Number(body.page) || 1));
      const perPage = Math.max(1, Math.min(100, Number(body.per_page) || 50));
      const { data, error } = await db.auth.admin.listUsers({ page, perPage });
      if (error) throw error;
      const users = (data.users || []).map((u) => {
        const m = (u.app_metadata || {}) as RoleMeta;
        return {
          id: u.id, email: u.email || '', display_name: safe(u.user_metadata?.display_name || u.user_metadata?.name || '', 100),
          roles: [...new Set([...(Array.isArray(m.roles) ? m.roles : []), ...(m.role ? [m.role] : [])])],
          created_at: u.created_at, last_sign_in_at: u.last_sign_in_at || null, banned_until: u.banned_until || null,
        };
      });
      return json({ users, page, per_page: perPage, total: data.users?.length || 0 });
    }

    if (action === 'moderate_user') {
      const targetId = safe(body.user_id, 36);
      const scope = safe(body.scope, 30);
      const kind = safe(body.moderation_action, 30);
      const reason = safe(body.reason, 1200);
      const hours = Number(body.duration_hours ?? 24);
      if (!/^[0-9a-f-]{36}$/i.test(targetId) || !scopes.has(scope) || !moderation.has(kind) || reason.length < 2 || !Number.isInteger(hours) || hours < 0 || hours > 8760) return json({ error: 'مقادیر اقدام مدیریتی نامعتبرند.' }, 400);
      if (targetId === actor.id && ['mute', 'ban', 'kick'].includes(kind)) return json({ error: 'مدیر نمی‌تواند از این مسیر خودش را محدود کند.' }, 400);
      const { data: target, error: targetError } = await db.auth.admin.getUserById(targetId);
      if (targetError || !target.user) return json({ error: 'کاربر مقصد پیدا نشد.' }, 404);
      if (hasRole((target.user.app_metadata || {}) as RoleMeta, ['super_admin']) && !isSuperAdmin) return json({ error: 'این اقدام فقط برای مدیر ارشد مجاز است.' }, 403);
      const starts = new Date();
      const ends = hours === 0 ? null : new Date(starts.getTime() + hours * 3600000).toISOString();
      const { data: row, error } = await db.from('user_moderation_actions').insert({ user_id: targetId, scope, action: kind, reason, starts_at: starts.toISOString(), ends_at: ends, created_by: actor.id }).select('id,user_id,scope,action,reason,starts_at,ends_at').single();
      if (error) throw error;
      await audit('moderation_action_created', 'user', targetId, reason, { moderation_id: row.id, scope, moderation_action: kind, ends_at: ends });
      const duration = ends ? ` تا ${new Date(ends).toLocaleString('fa-IR')}` : ' بدون تاریخ پایان';
      const { error: noticeError } = await db.from('in_app_notifications').insert({ user_id: targetId, title: 'اقدام مدیریتی دربارهٔ حساب شما', body: `نوع: ${kind} | محدوده: ${scope} | دلیل: ${reason}${duration}`, kind: 'warning', action_url: '/index.html?open=announcements', accent_color: '#b45309', icon: '⚠️' });
      if (noticeError) throw noticeError;
      return json({ ok: true, moderation: row });
    }

    if (action === 'set_roles') {
      if (!isSuperAdmin) return json({ error: 'تغییر نقش فقط برای مدیر ارشد مجاز است.' }, 403);
      const targetId = safe(body.user_id, 36);
      const reason = safe(body.reason, 1200) || 'تغییر نقش از پنل مدیریت';
      if (!/^[0-9a-f-]{36}$/i.test(targetId)) return json({ error: 'شناسهٔ کاربر معتبر نیست.' }, 400);
      if (targetId === actor.id) return json({ error: 'مدیر ارشد نباید نقش خودش را از این پنل تغییر دهد.' }, 400);
      const requested = Array.isArray(body.roles) ? body.roles.map((r) => safe(r, 50)).filter(Boolean) : [];
      if (requested.some((r) => !allowedRoles.has(r))) return json({ error: 'یک نقش درخواست‌شده مجاز نیست؛ super_admin فقط از مسیر امن خارج از پنل تنظیم می‌شود.' }, 400);
      const { data: target, error: targetError } = await db.auth.admin.getUserById(targetId);
      if (targetError || !target.user) return json({ error: 'کاربر مقصد پیدا نشد.' }, 404);
      const oldMeta = (target.user.app_metadata || {}) as RoleMeta;
      if (hasRole(oldMeta, ['super_admin'])) return json({ error: 'نقش مدیر ارشد از این پنل تغییر نمی‌کند.' }, 403);
      const nextMeta = { ...(target.user.app_metadata || {}), roles: [...new Set(requested)], role: requested.includes('admin') ? 'admin' : (requested[0] || 'user') };
      delete (nextMeta as Record<string, unknown>).super_admin;
      const { error } = await db.auth.admin.updateUserById(targetId, { app_metadata: nextMeta });
      if (error) throw error;
      await audit('user_roles_updated', 'user', targetId, reason, { before: oldMeta.roles || (oldMeta.role ? [oldMeta.role] : []), after: requested });
      return json({ ok: true, roles: [...new Set(requested)] });
    }

    if (action === 'set_auth_ban') {
      if (!isSuperAdmin) return json({ error: 'مدیریت محرومیت ورود فقط برای مدیر ارشد مجاز است.' }, 403);
      const targetId = safe(body.user_id, 36);
      const ban = body.ban === true;
      const hours = Number(body.duration_hours ?? 24);
      const reason = safe(body.reason, 1200) || 'اقدام از پنل مدیریت';
      if (!/^[0-9a-f-]{36}$/i.test(targetId) || (ban && (!Number.isInteger(hours) || hours < 1 || hours > 8760))) return json({ error: 'شناسه یا مدت بن معتبر نیست.' }, 400);
      if (targetId === actor.id) return json({ error: 'مدیر ارشد نمی‌تواند از این پنل ورود خودش را مسدود کند.' }, 400);
      const { data: target, error: getError } = await db.auth.admin.getUserById(targetId);
      if (getError || !target.user) return json({ error: 'کاربر مقصد پیدا نشد.' }, 404);
      if (hasRole((target.user.app_metadata || {}) as RoleMeta, ['super_admin'])) return json({ error: 'بن مدیر ارشد از این پنل مجاز نیست.' }, 403);
      const ban_duration = ban ? `${hours}h` : 'none';
      const { error } = await db.auth.admin.updateUserById(targetId, { ban_duration });
      if (error) throw error;
      await audit(ban ? 'auth_user_banned' : 'auth_user_unbanned', 'user', targetId, reason, { duration_hours: ban ? hours : 0 });
      const { error: noticeError } = await db.from('in_app_notifications').insert({ user_id: targetId, title: ban ? 'ورود به حساب موقتاً مسدود شد' : 'محدودیت ورود برداشته شد', body: `${reason}${ban ? ` (مدت: ${hours} ساعت)` : ''}`, kind: ban ? 'warning' : 'system', action_url: '/index.html?open=announcements', accent_color: ban ? '#b45309' : '#176b67', icon: ban ? '⛔' : '✅' });
      if (noticeError) throw noticeError;
      return json({ ok: true, banned: ban });
    }

    if (action === 'set_conversation_active' || action === 'set_slow_mode') {
      if (!isSuperAdmin && !hasRole(actorMeta, ['chat_moderator'])) return json({ error: 'برای مدیریت گروه و کانال، نقش ناظر چت لازم است.' }, 403);
      const conversationId = safe(body.conversation_id, 36);
      if (!/^[0-9a-f-]{36}$/i.test(conversationId)) return json({ error: 'شناسهٔ گفتگو معتبر نیست.' }, 400);
      let update: Record<string, unknown>;
      let auditName: string;
      if (action === 'set_conversation_active') {
        if (typeof body.active !== 'boolean') return json({ error: 'وضعیت فعال باید true یا false باشد.' }, 400);
        update = { is_active: body.active }; auditName = body.active ? 'chat_conversation_activated' : 'chat_conversation_deactivated';
      } else {
        const seconds = Number(body.seconds);
        if (!Number.isInteger(seconds) || seconds < 0 || seconds > 3600) return json({ error: 'Slow mode باید بین صفر تا ۳۶۰۰ ثانیه باشد.' }, 400);
        update = { slow_mode_seconds: seconds }; auditName = 'chat_slow_mode_updated';
      }
      const { data: row, error } = await db.from('chat_conversations').update(update).eq('id', conversationId).select('id,is_active,slow_mode_seconds').maybeSingle();
      if (error) throw error;
      if (!row) return json({ error: 'گفتگو پیدا نشد.' }, 404);
      await audit(auditName, 'chat_conversation', conversationId, safe(body.reason, 1200), update);
      return json({ ok: true, conversation: row });
    }

    return json({ error: 'عملیات مدیریت ناشناخته است.' }, 400);
  } catch (error) {
    const message = safe((error as Error)?.message || 'خطای داخلی سرویس مدیریت', 500);
    // Avoid returning provider internals or tokens to clients.
    console.error('hamghadam-admin operation failed:', action, message);
    return json({ error: 'عملیات انجام نشد. وضعیت سرور و مجوزها را بررسی کن.', detail: message }, 500);
  }
});
