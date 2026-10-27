export const HGD_FILE_LIMITS = Object.freeze({ chatBytes: 50 * 1024 * 1024, personalBookBytes: 100 * 1024 * 1024 });
export const HGD_REPORT_REASONS = Object.freeze([
  ['insult', 'فحاشی، توهین یا تحقیر'], ['harassment', 'مزاحمت، آزار یا تهدید'], ['off_topic', 'پیام نامرتبط'],
  ['spam', 'هرزنامه یا تبلیغ ناخواسته'], ['scam', 'کلاهبرداری یا فیشینگ'], ['impersonation', 'جعل هویت'],
  ['privacy', 'انتشار اطلاعات خصوصی'], ['inappropriate', 'محتوای نامناسب'], ['hate', 'نفرت‌پراکنی یا تبعیض'],
  ['malicious_file', 'فایل یا لینک مشکوک'], ['group_abuse', 'سوءاستفاده از گروه یا لینک دعوت'], ['copyright', 'نقض حقوق نشر'], ['other', 'سایر'],
]);
export const HGD_ARGUMENT_TYPES = Object.freeze([
  ['argument', 'استدلال'], ['support', 'موافق'], ['oppose', 'مخالف'], ['question', 'پرسش'], ['rebuttal', 'نقد و پاسخ'], ['summary', 'جمع‌بندی'], ['source', 'معرفی منبع'],
]);
export const HGD_FEATURE_LABELS = Object.freeze({
  debates: 'مباحثهٔ موضوع‌محور', community_chat: 'چت عمومی و گروهی', private_chat: 'چت خصوصی', groups: 'گروه‌ها', channels: 'کانال‌ها',
  special_themes: 'تم‌های شهادت و ولادت', personal_books: 'میز مطالعه و کتاب شخصی', quizzes: 'آزمون‌ها', rankings: 'رتبه‌بندی و امتیاز', support: 'پشتیبانی', ai_assistant: 'دستیار هوشمند',
});

export function normalizeText(value, maxLength = 3000) {
  return String(value ?? '').replace(/\u0000/g, '').trim().slice(0, Math.max(0, maxLength));
}

export function isAllowedHexColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value ?? ''));
}

export function validateOccasion(occasion) {
  const errors = [];
  const title = normalizeText(occasion?.title, 120);
  const startsAt = new Date(occasion?.starts_at);
  const endsAt = new Date(occasion?.ends_at);
  if (title.length < 2) errors.push('عنوان مناسبت باید دست‌کم دو نویسه داشته باشد.');
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) errors.push('زمان شروع و پایان معتبر نیست.');
  else if (endsAt <= startsAt) errors.push('زمان پایان باید بعد از شروع باشد.');
  if (!['birth', 'martyrdom', 'religious', 'national', 'custom'].includes(occasion?.occasion_type)) errors.push('نوع مناسبت معتبر نیست.');
  if (!isAllowedHexColor(occasion?.accent_color) || !isAllowedHexColor(occasion?.background_color)) errors.push('رنگ باید به قالب #RRGGBB باشد.');
  return { ok: errors.length === 0, errors, value: { ...occasion, title, starts_at: Number.isFinite(startsAt.getTime()) ? startsAt.toISOString() : null, ends_at: Number.isFinite(endsAt.getTime()) ? endsAt.toISOString() : null } };
}

export function selectActiveOccasion(occasions, now = new Date()) {
  const time = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(time) || !Array.isArray(occasions)) return null;
  return occasions
    .filter((item) => item?.enabled === true && Number.isFinite(Date.parse(item.starts_at)) && Number.isFinite(Date.parse(item.ends_at)) && Date.parse(item.starts_at) <= time && Date.parse(item.ends_at) > time)
    .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0) || Date.parse(b.starts_at) - Date.parse(a.starts_at))[0] ?? null;
}

export function nextReviewSchedule({ quality, intervalDays = 0, easeFactor = 2.5, repetitions = 0 }, now = new Date()) {
  const q = Math.max(0, Math.min(5, Math.trunc(Number(quality) || 0)));
  const previousInterval = Math.max(0, Math.trunc(Number(intervalDays) || 0));
  let ease = Number(easeFactor);
  if (!Number.isFinite(ease)) ease = 2.5;
  ease = Math.max(1.3, Math.min(4, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))));
  let interval;
  let nextRepetitions;
  if (q < 3) { interval = 1; nextRepetitions = 0; }
  else if (repetitions <= 0) { interval = 1; nextRepetitions = 1; }
  else if (repetitions === 1) { interval = 6; nextRepetitions = 2; }
  else { interval = Math.max(1, Math.round(Math.max(1, previousInterval) * ease)); nextRepetitions = repetitions + 1; }
  const due = new Date(now);
  due.setDate(due.getDate() + interval);
  return { intervalDays: interval, easeFactor: Math.round(ease * 100) / 100, repetitions: nextRepetitions, dueAt: due.toISOString() };
}

export function validateUpload(file, maxBytes, allowedMimeTypes) {
  if (!file || typeof file.size !== 'number') return { ok: false, error: 'فایل انتخاب نشده است.' };
  if (file.size < 1) return { ok: false, error: 'فایل خالی است.' };
  if (file.size > maxBytes) return { ok: false, error: `حجم فایل نباید بیشتر از ${(maxBytes / (1024 * 1024)).toLocaleString('fa-IR')} مگابایت باشد.` };
  if (Array.isArray(allowedMimeTypes) && allowedMimeTypes.length && !allowedMimeTypes.includes(file.type)) return { ok: false, error: 'نوع این فایل در فهرست فرمت‌های مجاز نیست.' };
  return { ok: true, error: '' };
}

export function safeLocalActionUrl(url) {
  const value = String(url ?? '').trim();
  return value.startsWith('/') && !value.startsWith('//') && !/[\r\n]/.test(value) ? value : null;
}
