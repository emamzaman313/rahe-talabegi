/** Pure helpers shared by the support UI and Node tests. */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
}

export function isValidSupabaseConfig(url, key) {
  if (typeof url !== 'string' || typeof key !== 'string') return false;
  const cleanUrl = url.trim();
  const cleanKey = key.trim();
  if (!cleanUrl || !cleanKey) return false;
  if (/YOUR[-_ ]|PLACEHOLDER|EXAMPLE|PASTE[-_ ]/i.test(cleanUrl + ' ' + cleanKey)) return false;
  try {
    const parsed = new URL(cleanUrl);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co') &&
      !parsed.hostname.startsWith('.') && cleanKey.length >= 12;
  } catch {
    return false;
  }
}

/** Returns a normalized message, or null if it is too long. Empty strings are valid but not sendable. */
export function normalizeMessage(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\r\n?/g, '\n').trim();
  if (text.length > 5000) return null;
  return text;
}

/** Roles used for UI affordances must come from app_metadata, never user_metadata. */
export function isSupportAgent(user) {
  const metadata = user?.app_metadata || {};
  const roles = Array.isArray(metadata.roles) ? metadata.roles : [];
  return Boolean(user && (metadata.role === 'support' || ['admin', 'super_admin'].includes(metadata.role) || roles.some((role) => ['support', 'admin', 'super_admin'].includes(role))));
}

export function statusLabel(status) {
  return ({ open: 'باز', answered: 'پاسخ داده شده', closed: 'بسته' })[status] || 'نامشخص';
}

export function formatTimestamp(value) {
  if (!value) return 'زمان نامشخص';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'زمان نامشخص';
  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
  } catch {
    return date.toLocaleString();
  }
}
