export const STUDY_STYLES = Object.freeze([
  'خواندن',
  'خلاصه‌نویسی',
  'پرسش‌وپاسخ',
  'مباحثه',
  'حل تمرین',
  'ترکیبی',
]);

export function normalizeDisplayName(value, fallback = '') {
  const clean = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ');
  return (clean || String(fallback ?? '').trim()).slice(0, 60);
}

export function normalizeStage(value, fallback = 'پایه یک') {
  const clean = String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ');
  return (clean || fallback).slice(0, 60);
}

export function normalizeFreeMinutes(value, fallback = 60) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(1440, Math.round(n))) : fallback;
}

export function normalizeStudyStyle(value, fallback = 'ترکیبی') {
  return STUDY_STYLES.includes(value) ? value : fallback;
}

export function profilePayload(formData, fallback = {}) {
  return {
    display_name: normalizeDisplayName(formData.get('name'), fallback.display_name || ''),
    stage: normalizeStage(formData.get('stage'), fallback.stage || 'پایه یک'),
    free_minutes: normalizeFreeMinutes(formData.get('freeMinutes'), fallback.free_minutes ?? 60),
    study_style: normalizeStudyStyle(formData.get('studyStyle'), fallback.study_style || 'ترکیبی'),
  };
}

export function greetingName(profile, user) {
  return normalizeDisplayName(profile?.display_name, String(user?.email || '').split('@')[0] || 'همراه');
}

export function trustedRole(user) {
  const role = user?.app_metadata?.role;
  return ['owner', 'super_admin', 'admin', 'moderator', 'support'].includes(role) ? role : 'user';
}

export function roleLabel(role) {
  return ({
    owner: 'مالک',
    super_admin: 'مدیر ارشد',
    admin: 'مدیر',
    moderator: 'ناظر',
    support: 'پشتیبانی',
    user: 'عضو',
  })[role] || 'عضو';
}
