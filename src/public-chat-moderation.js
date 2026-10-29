import { supabase, isSupabaseConfigured } from './supabase-client.js';

const MODERATOR_ROLES = new Set(['admin', 'super_admin', 'chat_moderator', 'content_moderator', 'support']);
const REPORT_REASONS = [
  'توهین و بی‌احترامی',
  'هرزنامه یا تبلیغات',
  'محتوای نامرتبط',
  'تهدید یا آزار',
  'محتوای نامناسب',
  'سایر',
];
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

let currentUser = null;
let overlay = null;
let queueLoading = false;
let activeMessageId = null;
let observer = null;
let actionNotice = null;
let lastNoticeUserId = null;
let dismissedNoticeUserId = null;

function isModerator(user = currentUser) {
  const metadata = user?.app_metadata || {};
  const roles = Array.isArray(metadata.roles) ? metadata.roles : [];
  return MODERATOR_ROLES.has(String(metadata.role || '')) || roles.some((role) => MODERATOR_ROLES.has(String(role)));
}

function notify(message, type = 'info') {
  const notice = document.querySelector('#hc-notice');
  if (notice) {
    notice.hidden = false;
    notice.className = `hc-notice ${type}`;
    notice.textContent = message;
    return;
  }
  window.alert(message);
}

function addStyles() {
  if (document.getElementById('hg-pcr-style')) return;
  const style = document.createElement('style');
  style.id = 'hg-pcr-style';
  style.textContent = `
    .hg-pcr-action{margin-inline-start:5px;padding:2px 5px;border:1px solid #d8e5df;border-radius:7px;background:#fff;color:#476d62;font:inherit;font-size:11px;cursor:pointer}
    .hg-pcr-action:hover{background:#e8f4ed;border-color:#95c9b6}
    .hg-pcr-action.hg-pcr-danger{color:#9b3b40;border-color:#f0d1d1}
    .hg-pcr-top-button{border:1px solid #ffffff52;background:#ffffff14;color:#f5fffc;border-radius:11px;padding:7px 11px;min-height:38px;font:inherit;font-size:12px;cursor:pointer}
    .hg-pcr-overlay{position:fixed;inset:0;z-index:100100;background:#061c1bc9;display:grid;place-items:center;padding:14px;backdrop-filter:blur(7px)}
    .hg-pcr-overlay[hidden]{display:none!important}
    .hg-pcr-modal{width:min(650px,100%);max-height:min(84dvh,780px);overflow:auto;background:#f8fbf8;color:#193e37;border:1px solid #d6e8df;border-radius:20px;box-shadow:0 28px 100px #00191670;direction:rtl}
    .hg-pcr-header{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 18px;background:linear-gradient(120deg,#103f3d,#17695d);color:#fff}
    .hg-pcr-header h2{margin:0;font-size:17px}.hg-pcr-header p{margin:4px 0 0;color:#d0e7df;font-size:12px}
    .hg-pcr-close{border:1px solid #ffffff45;background:#ffffff12;color:#fff;border-radius:10px;width:36px;height:36px;font-size:22px;cursor:pointer}
    .hg-pcr-content{padding:16px;display:grid;gap:12px}
    .hg-pcr-field{display:grid;gap:7px;font-size:13px;font-weight:700}
    .hg-pcr-field select,.hg-pcr-field textarea{width:100%;box-sizing:border-box;border:1px solid #cbded5;background:#fff;color:#183e36;border-radius:11px;padding:11px;font:inherit;font-weight:400;min-width:0}
    .hg-pcr-field textarea{min-height:95px;resize:vertical}
    .hg-pcr-footer{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-start;padding:0 16px 16px}
    .hg-pcr-primary,.hg-pcr-secondary,.hg-pcr-status{border-radius:10px;padding:9px 13px;font:inherit;font-size:12px;cursor:pointer;border:1px solid #cfe0d6}
    .hg-pcr-primary{background:#17695d;color:#fff;border-color:#17695d}.hg-pcr-secondary,.hg-pcr-status{background:#fff;color:#315b50}
    .hg-pcr-report{border:1px solid #e1e8e3;background:white;border-radius:13px;padding:12px;display:grid;gap:8px;overflow-wrap:anywhere}
    .hg-pcr-report h3{font-size:13px;margin:0;color:#164d43}.hg-pcr-report p{font-size:12px;line-height:1.8;white-space:pre-wrap;margin:0;color:#425f56}
    .hg-pcr-meta{font-size:10px;color:#71877e;direction:ltr;text-align:right;overflow-wrap:anywhere}
    .hg-pcr-actions{display:flex;flex-wrap:wrap;gap:7px}
    .hg-pcr-empty{padding:28px 12px;text-align:center;color:#58776b;background:#edf5ef;border-radius:12px;font-size:13px}
    .hg-pcr-user-notice{position:fixed;z-index:99980;inset-inline:12px;bottom:12px;width:min(760px,calc(100% - 24px));margin-inline:auto;display:flex;align-items:flex-start;gap:12px;padding:12px 14px;border:1px solid #e1c77e;border-radius:14px;background:#fff8df;color:#5d4712;box-shadow:0 14px 50px #0002;direction:rtl;font:13px/1.9 Tahoma,"Segoe UI",sans-serif}
    .hg-pcr-user-notice[hidden]{display:none!important}.hg-pcr-user-notice b{display:block;margin-bottom:3px}.hg-pcr-user-notice p{margin:0;overflow-wrap:anywhere}.hg-pcr-user-notice .hg-pcr-notice-close{flex:0 0 auto;border:1px solid #d8c783;background:#fffdf3;border-radius:8px;padding:3px 9px;color:inherit;font:inherit;cursor:pointer}
    .hg-pcr-user-notice[data-kind=ban]{background:#fff0f0;color:#7b2528;border-color:#e6b5b5}.hg-pcr-user-notice[data-kind=mute],.hg-pcr-user-notice[data-kind=kick]{background:#fff3e8;color:#7a421b;border-color:#edc5a2}
    @media(max-width:480px){.hg-pcr-top-button{padding:6px 8px;font-size:10px;min-height:34px}.hg-pcr-content{padding:11px}.hg-pcr-header{padding:12px}.hg-pcr-modal{max-height:88dvh;border-radius:15px}}
  `;
  document.head.append(style);
}

function ensureOverlay() {
  if (overlay) return;
  addStyles();
  overlay = document.createElement('div');
  overlay.className = 'hg-pcr-overlay';
  overlay.id = 'hg-pcr-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <section class="hg-pcr-modal" role="dialog" aria-modal="true" aria-labelledby="hg-pcr-title">
      <header class="hg-pcr-header"><div><h2 id="hg-pcr-title">گزارش و نظارت چت</h2><p id="hg-pcr-subtitle">رسیدگی منصفانه و محرمانه به گزارش‌ها</p></div><button class="hg-pcr-close" type="button" data-hg-pcr-action="close" aria-label="بستن">×</button></header>
      <div class="hg-pcr-content" id="hg-pcr-content"></div>
      <footer class="hg-pcr-footer" id="hg-pcr-footer"></footer>
    </section>`;
  document.body.append(overlay);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeOverlay();
    const button = event.target.closest('[data-hg-pcr-action]');
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.hgPcrAction;
    if (action === 'close') closeOverlay();
    else if (action === 'submit-report') void submitReport();
    else if (action === 'reviewing' || action === 'resolve' || action === 'dismiss') void updateReport(button.dataset.id, action);
    else if (['warn', 'mute-60', 'mute-1440', 'kick-room', 'ban-global'].includes(action)) void applyUserModeration(button.dataset.id, action);
    else if (action === 'revoke-action') void revokeModerationAction(button.dataset.id);
    else if (action === 'reload') void openQueue();
  });
  overlay.addEventListener('submit', (event) => {
    if (event.target?.id === 'hg-pcr-report-form') {
      event.preventDefault();
      void submitReport();
    }
  });
}

function showOverlay(title, subtitle, content, footer = '') {
  ensureOverlay();
  document.getElementById('hg-pcr-title').textContent = title;
  document.getElementById('hg-pcr-subtitle').textContent = subtitle;
  document.getElementById('hg-pcr-content').innerHTML = content;
  document.getElementById('hg-pcr-footer').innerHTML = footer;
  overlay.hidden = false;
  document.querySelector('.hg-pcr-modal')?.focus?.();
}

function closeOverlay() {
  if (overlay) overlay.hidden = true;
  activeMessageId = null;
}

function addReviewButton() {
  const actions = document.querySelector('#hc-public-chat .hc-top-actions');
  if (!actions) return;
  let button = document.getElementById('hg-pcr-open-queue');
  if (!isModerator()) {
    button?.remove();
    return;
  }
  if (!button) {
    button = document.createElement('button');
    button.id = 'hg-pcr-open-queue';
    button.type = 'button';
    button.className = 'hg-pcr-top-button';
    button.dataset.hgPcrAction = 'open-queue';
    button.textContent = 'گزارش‌های تخلف';
    actions.insertBefore(button, actions.firstChild);
  }
}

function decorateMessages() {
  if (!document.querySelector('#hc-public-chat')) return;
  addReviewButton();
  const articles = document.querySelectorAll('#hc-message-list article.hc-message');
  for (const article of articles) {
    const actionBox = article.querySelector('.hc-message-actions');
    if (!actionBox) continue;
    if (!currentUser) { actionBox.querySelectorAll('[data-hg-pcr-action]').forEach((button) => button.remove()); continue; }
    const mine = article.classList.contains('mine');
    const removed = Boolean(article.querySelector('.hc-bubble.removed'));
    const messageId = article.id.startsWith('hc-msg-') ? article.id.slice(7) : '';
    if (!messageId) continue;
    if (mine || removed) {
      actionBox.querySelectorAll('[data-hg-pcr-action="report"],[data-hg-pcr-action="moderator-delete"]').forEach((button) => button.remove());
      continue;
    }
    if (![...actionBox.querySelectorAll('[data-hg-pcr-action="report"]')].some((button) => button.dataset.id === messageId)) {
      const report = document.createElement('button');
      report.type = 'button';
      report.className = 'hg-pcr-action';
      report.textContent = 'گزارش';
      report.title = 'گزارش پیام به ناظران';
      report.dataset.hgPcrAction = 'report';
      report.dataset.id = messageId;
      actionBox.append(report);
    }
    if (isModerator() && ![...actionBox.querySelectorAll('[data-hg-pcr-action="moderator-delete"]')].some((button) => button.dataset.id === messageId)) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'hg-pcr-action hg-pcr-danger';
      remove.textContent = 'حذف ناظر';
      remove.title = 'حذف نرم پیام به‌عنوان ناظر';
      remove.dataset.hgPcrAction = 'moderator-delete';
      remove.dataset.id = messageId;
      actionBox.append(remove);
    }
  }
}

function showReportForm(messageId) {
  if (!currentUser) {
    notify('برای ثبت گزارش ابتدا وارد حساب شو.', 'error');
    return;
  }
  activeMessageId = messageId;
  const options = REPORT_REASONS.map((reason) => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join('');
  showOverlay('گزارش پیام', 'گزارش‌ها فقط برای رسیدگی به ناظران ثبت می‌شوند.', `
    <form id="hg-pcr-report-form">
      <label class="hg-pcr-field">دلیل گزارش<select id="hg-pcr-reason" required>${options}</select></label>
      <label class="hg-pcr-field">توضیح تکمیلی (اختیاری)<textarea id="hg-pcr-description" maxlength="2000" placeholder="بدون اطلاعات شخصی غیرضروری توضیح بده…"></textarea></label>
      <p style="font-size:11px;line-height:1.8;color:#6a8077;margin:0">گزارش ساختگی یا تکراری نفرست؛ پیام گزارش‌شده برای بررسی ناظران نگه داشته می‌شود.</p>
    </form>`, `
      <button type="button" class="hg-pcr-primary" data-hg-pcr-action="submit-report">ثبت گزارش</button>
      <button type="button" class="hg-pcr-secondary" data-hg-pcr-action="close">انصراف</button>`);
}

async function submitReport() {
  if (!supabase || !currentUser || !activeMessageId) return;
  const reason = document.getElementById('hg-pcr-reason')?.value;
  const description = String(document.getElementById('hg-pcr-description')?.value || '').trim().slice(0, 2000);
  if (!REPORT_REASONS.includes(reason)) {
    notify('دلیل گزارش را انتخاب کن.', 'error');
    return;
  }
  try {
    const { data: message, error: messageError } = await supabase
      .from('public_chat_messages').select('id,sender_id,deleted_at').eq('id', activeMessageId).maybeSingle();
    if (messageError) throw messageError;
    if (!message) throw new Error('پیام پیدا نشد؛ شاید حذف شده باشد.');
    if (message.deleted_at) throw new Error('این پیام قبلاً حذف شده است.');
    if (message.sender_id === currentUser.id) throw new Error('گزارش پیام خودت مجاز نیست.');
    const { error } = await supabase.from('public_chat_reports').insert({
      reporter_id: currentUser.id,
      message_id: message.id,
      reported_user_id: message.sender_id,
      reason,
      description,
    });
    if (error) throw error;
    closeOverlay();
    notify('گزارش ثبت شد؛ ناظران می‌توانند آن را بررسی کنند.', 'success');
  } catch (error) {
    const rawMessage = String(error?.message || '');
    const message = /23505|duplicate key/i.test(rawMessage)
      ? 'این پیام را قبلاً گزارش کرده‌ای.'
      : /public_chat_reports|relation .* does not exist/i.test(rawMessage)
        ? 'ساختار گزارش تخلف هنوز روی Supabase نصب نشده است. ابتدا migration افزوده‌شده را با پشتیبان‌گیری و بازبینی اجرا کن.'
        : 'ثبت گزارش انجام نشد؛ اتصال و مجوزهای سرور را بررسی کن.';
    notify(message, 'error');
  }
}

async function moderatorDelete(messageId) {
  if (!supabase || !currentUser || !isModerator()) {
    notify('این کار فقط برای ناظر مجاز است.', 'error');
    return;
  }
  if (!window.confirm('پیام برای همه به «این پیام حذف شد» تبدیل شود؟ این کار حذف نرم است.')) return;
  try {
    const { data, error } = await supabase.from('public_chat_messages')
      .update({ body: 'این پیام حذف شد.', deleted_at: new Date().toISOString() })
      .eq('id', messageId).is('deleted_at', null).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('پیام حذف نشده؛ مجوز ناظر یا وضعیت پیام را بررسی کن.');
    notify('پیام با موفقیت برای همه حذف نرم شد.', 'success');
  } catch {
    notify('حذف مدیریتی انجام نشد. ابتدا migration و نقش امن ناظر را بررسی کن.', 'error');
  }
}

async function openQueue() {
  if (!supabase || !currentUser || !isModerator()) {
    notify('دسترسی ناظر برای دیدن گزارش‌ها لازم است.', 'error');
    return;
  }
  if (queueLoading) return;
  queueLoading = true;
  showOverlay('صف گزارش‌های تخلف', 'فقط گزارش‌های باز و درحال بررسی نمایش داده می‌شوند.', '<div class="hg-pcr-empty">در حال دریافت گزارش‌ها…</div>', '<button type="button" class="hg-pcr-secondary" data-hg-pcr-action="close">بستن</button>');
  try {
    const { data: reports, error } = await supabase.from('public_chat_reports')
      .select('id,reason,description,status,created_at,message_id,reported_user_id,reporter_id')
      .in('status', ['open', 'reviewing']).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    const rows = reports || [];
    let messagesById = new Map();
    const messageIds = [...new Set(rows.map((item) => item.message_id).filter(Boolean))];
    if (messageIds.length) {
      const { data: messageRows, error: messageError } = await supabase.from('public_chat_messages')
        .select('id,room_id,body,sender_name,deleted_at').in('id', messageIds);
      if (messageError) throw messageError;
      messagesById = new Map((messageRows || []).map((item) => [item.id, item]));
    }
    const html = rows.length ? rows.map((report) => {
      const message = messagesById.get(report.message_id);
      const date = new Date(report.created_at);
      const dateText = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('fa-IR');
      const body = message ? (message.deleted_at ? 'این پیام حذف شده است.' : message.body) : 'متن پیام در دسترس نیست.';
      return `<article class="hg-pcr-report"><h3>${escapeHtml(report.reason)} · ${report.status === 'reviewing' ? 'در حال بررسی' : 'باز'}</h3>
        <p>${escapeHtml(body)}</p>
        ${report.description ? `<p><b>توضیح گزارش‌دهنده:</b> ${escapeHtml(report.description)}</p>` : ''}
        <div class="hg-pcr-meta">${escapeHtml(dateText)} · گزارش: ${escapeHtml(String(report.id).slice(0, 8))} · کاربر گزارش‌شده: ${escapeHtml(String(report.reported_user_id || 'نامشخص').slice(0, 8))}</div>
        <div class="hg-pcr-actions"><button type="button" class="hg-pcr-status" data-hg-pcr-action="reviewing" data-id="${escapeHtml(report.id)}">در حال بررسی</button><button type="button" class="hg-pcr-status" data-hg-pcr-action="resolve" data-id="${escapeHtml(report.id)}">رسیدگی شد</button><button type="button" class="hg-pcr-status" data-hg-pcr-action="dismiss" data-id="${escapeHtml(report.id)}">رد گزارش</button></div>
        <div class="hg-pcr-actions"><button type="button" class="hg-pcr-status" data-hg-pcr-action="warn" data-id="${escapeHtml(report.id)}">هشدار</button><button type="button" class="hg-pcr-status" data-hg-pcr-action="mute-60" data-id="${escapeHtml(report.id)}">سکوت ۱ ساعت</button><button type="button" class="hg-pcr-status" data-hg-pcr-action="mute-1440" data-id="${escapeHtml(report.id)}">سکوت ۲۴ ساعت</button><button type="button" class="hg-pcr-status" data-hg-pcr-action="kick-room" data-id="${escapeHtml(report.id)}">اخراج از اتاق ۲۴ ساعت</button><button type="button" class="hg-pcr-status hg-pcr-danger" data-hg-pcr-action="ban-global" data-id="${escapeHtml(report.id)}">محرومیت از چت عمومی</button></div>
      </article>`;
    }).join('') : '<div class="hg-pcr-empty">گزارش بازی وجود ندارد. 🌿</div>';
    let moderationHistory = [];
    let actionsMigrationAvailable = false;
    try {
      const { data: actionRows, error: actionError } = await supabase.from('public_chat_user_moderation_actions')
        .select('id,user_id,action_type,room_id,reason,status,expires_at,created_at,revoked_at,revoked_by')
        .order('created_at', { ascending: false }).limit(40);
      if (actionError) throw actionError;
      moderationHistory = actionRows || [];
      actionsMigrationAvailable = true;
    } catch {
      // Report review remains usable when the moderation-actions migration has not yet been applied.
    }
    const typeLabel = { warn: 'هشدار', mute: 'سکوت', kick: 'اخراج موقت', ban: 'محرومیت' };
    const now = Date.now();
    const actionHtml = actionsMigrationAvailable ? `<h3 style="margin:10px 0 0">سوابق اقدامات نظارتی (۴۰ مورد اخیر)</h3>${moderationHistory.length ? moderationHistory.map((item) => {
      const expired = item.expires_at && new Date(item.expires_at).getTime() <= now;
      const effective = item.status === 'active' && !expired;
      const statusLabel = item.status === 'revoked' ? 'لغوشده' : expired ? 'منقضی‌شده' : item.status === 'active' ? 'فعال' : item.status;
      const expiry = item.expires_at ? new Date(item.expires_at).toLocaleString('fa-IR') : 'بدون تاریخ انقضا';
      return `<article class="hg-pcr-report"><h3>${escapeHtml(typeLabel[item.action_type] || item.action_type)} · ${escapeHtml(statusLabel)} · کاربر ${escapeHtml(String(item.user_id).slice(0, 8))}</h3><p>${escapeHtml(item.reason || 'بدون توضیح')}</p><div class="hg-pcr-meta">اتاق: ${escapeHtml(String(item.room_id || 'همهٔ اتاق‌ها').slice(0, 24))} · انقضا: ${escapeHtml(expiry)}${item.revoked_at ? ` · لغو: ${escapeHtml(new Date(item.revoked_at).toLocaleString('fa-IR'))}` : ''}</div>${effective ? `<button type="button" class="hg-pcr-status" data-hg-pcr-action="revoke-action" data-id="${escapeHtml(item.id)}">لغو اقدام فعال</button>` : ''}</article>`;
    }).join('') : '<div class="hg-pcr-empty">هنوز اقدامی ثبت نشده است.</div>'}` : '<div class="hg-pcr-empty">تاریخچهٔ اقدامات نمایش داده نشد؛ migration مربوط به اقدامات هنوز نصب نشده یا دسترسی آن آماده نیست.</div>';
    showOverlay('صف گزارش‌های تخلف', `${rows.length.toLocaleString('fa-IR')} گزارش باز یا درحال بررسی · سوابق اخیر اقدامات نیز نمایش داده می‌شوند`, `${html}${actionHtml}`,
      '<button type="button" class="hg-pcr-secondary" data-hg-pcr-action="reload">تازه‌سازی</button><button type="button" class="hg-pcr-secondary" data-hg-pcr-action="close">بستن</button>');
  } catch (error) {
    const text = /public_chat_reports|relation .* does not exist/i.test(String(error?.message || ''))
      ? 'جدول گزارش‌ها هنوز روی Supabase ساخته نشده است؛ migration جدید را پس از پشتیبان‌گیری اجرا کن.'
      : 'خواندن صف گزارش‌ها ناموفق بود؛ نقش ناظر و سیاست‌های RLS را بررسی کن.';
    showOverlay('صف گزارش‌های تخلف', 'نیازمند دسترسی سرور', `<div class="hg-pcr-empty">${escapeHtml(text)}</div>`, '<button type="button" class="hg-pcr-secondary" data-hg-pcr-action="close">بستن</button>');
  } finally {
    queueLoading = false;
  }
}

async function updateReport(id, action) {
  if (!supabase || !currentUser || !isModerator()) return;
  const status = action === 'resolve' ? 'resolved' : action === 'dismiss' ? 'dismissed' : 'reviewing';
  const final = status === 'resolved' || status === 'dismissed';
  try {
    const { data, error } = await supabase.from('public_chat_reports').update({
      status,
      moderator_id: currentUser.id,
      reviewed_at: final ? new Date().toISOString() : null,
    }).eq('id', id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('No row updated');
    await openQueue();
  } catch {
    notify('به‌روزرسانی گزارش ناموفق بود؛ مجوز ناظر در Supabase را بررسی کن.', 'error');
  }
}


async function applyUserModeration(reportId, action) {
  if (!supabase || !currentUser || !isModerator()) {
    notify('ثبت اقدام فقط برای ناظر دارای نقش امن مجاز است.', 'error');
    return;
  }
  const definition = {
    warn: { type: 'warn', minutes: 10080, roomScoped: false, label: 'هشدار ۷روزه' },
    'mute-60': { type: 'mute', minutes: 60, roomScoped: true, label: 'سکوت یک‌ساعته' },
    'mute-1440': { type: 'mute', minutes: 1440, roomScoped: true, label: 'سکوت ۲۴ ساعته' },
    'kick-room': { type: 'kick', minutes: 1440, roomScoped: true, label: 'اخراج موقت از اتاق' },
    'ban-global': { type: 'ban', minutes: null, roomScoped: false, label: 'محرومیت از چت عمومی بدون انقضا' },
  }[action];
  if (!definition) return;
  const confirmed = window.confirm(`اقدام «${definition.label}» برای این کاربر ثبت شود؟ این اقدام در سابقهٔ نظارتی ذخیره می‌شود.`);
  if (!confirmed) return;
  try {
    const { data: report, error: reportError } = await supabase.from('public_chat_reports')
      .select('id,reason,description,reported_user_id,message_id').eq('id', reportId).maybeSingle();
    if (reportError) throw reportError;
    if (!report?.reported_user_id) throw new Error('گزارش یا کاربر گزارش‌شده پیدا نشد.');
    let roomId = null;
    if (report.message_id) {
      const { data: message, error: messageError } = await supabase.from('public_chat_messages')
        .select('room_id').eq('id', report.message_id).maybeSingle();
      if (messageError) throw messageError;
      roomId = message?.room_id || null;
    }
    if (definition.roomScoped && !roomId) throw new Error('اتاق این گزارش پیدا نشد؛ اقدام اتاق‌محور انجام نشد.');
    const expiresAt = definition.minutes ? new Date(Date.now() + definition.minutes * 60_000).toISOString() : null;
    const reason = `${report.reason}${report.description ? ` — ${report.description}` : ''}`.slice(0, 1000);
    const { error } = await supabase.from('public_chat_user_moderation_actions').insert({
      user_id: report.reported_user_id,
      room_id: definition.roomScoped ? roomId : null,
      action_type: definition.type,
      reason,
      status: 'active',
      created_by: currentUser.id,
      expires_at: expiresAt,
    });
    if (error) throw error;
    notify(definition.type === 'warn'
      ? 'هشدار ثبت شد و در حساب کاربر نمایش داده می‌شود.'
      : `اقدام «${definition.label}» ثبت شد؛ محدودیت در سیاست‌های سرور نیز اعمال می‌شود.`, 'success');
    await openQueue();
  } catch (error) {
    const text = String(error?.message || '');
    notify(/public_chat_user_moderation_actions|relation .* does not exist/i.test(text)
      ? 'جدول اقدامات هنوز روی Supabase ساخته نشده است؛ migration افزوده‌شده را پس از تهیهٔ پشتیبان اجرا کن.'
      : 'ثبت اقدام انجام نشد؛ نقش ناظر، migration و سیاست‌های RLS را بررسی کن.', 'error');
  }
}

async function revokeModerationAction(actionId) {
  if (!supabase || !currentUser || !isModerator() || !actionId) return;
  if (!window.confirm('این اقدام نظارتی لغو شود؟ سابقه نگه داشته می‌شود.')) return;
  try {
    const { data, error } = await supabase.from('public_chat_user_moderation_actions').update({
      status: 'revoked', revoked_by: currentUser.id, revoked_at: new Date().toISOString(),
    }).eq('id', actionId).eq('status', 'active').select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('اقدام فعال پیدا نشد.');
    notify('اقدام لغو شد؛ سابقهٔ آن باقی ماند.', 'success');
    await openQueue();
  } catch {
    notify('لغو اقدام انجام نشد؛ migration و مجوز ناظر را بررسی کن.', 'error');
  }
}

function ensureUserNotice() {
  if (actionNotice?.isConnected) return actionNotice;
  actionNotice = document.getElementById('hg-pcr-user-notice');
  if (actionNotice) return actionNotice;
  actionNotice = document.createElement('section');
  actionNotice.id = 'hg-pcr-user-notice';
  actionNotice.className = 'hg-pcr-user-notice';
  actionNotice.hidden = true;
  actionNotice.setAttribute('role', 'status');
  actionNotice.setAttribute('aria-live', 'polite');
  actionNotice.innerHTML = '<div class="hg-pcr-notice-copy"></div><div style="display:flex;gap:6px;flex:0 0 auto"><button type="button" class="hg-pcr-notice-close" data-hg-pcr-action="refresh-user-notice">تازه‌سازی</button><button type="button" class="hg-pcr-notice-close" data-hg-pcr-action="dismiss-user-notice" aria-label="بستن اعلان">بستن</button></div>';
  document.body.append(actionNotice);
  return actionNotice;
}

async function renderCurrentUserActionNotice(force = false) {
  const existing = document.getElementById('hg-pcr-user-notice');
  if (!supabase || !currentUser) {
    existing?.remove();
    actionNotice = null;
    lastNoticeUserId = null;
    dismissedNoticeUserId = null;
    return;
  }
  if (lastNoticeUserId && lastNoticeUserId !== currentUser.id) dismissedNoticeUserId = null;
  if (dismissedNoticeUserId === currentUser.id) { existing?.remove(); actionNotice = null; return; }
  const box = ensureUserNotice();
  if (!force && lastNoticeUserId === currentUser.id && box.dataset.loaded === 'true') return;
  lastNoticeUserId = currentUser.id;
  try {
    const { data, error } = await supabase.from('public_chat_user_moderation_actions')
      .select('id,action_type,room_id,reason,expires_at,created_at')
      .eq('user_id', currentUser.id).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(20);
    if (error) throw error;
    const now = Date.now();
    const active = (data || []).filter((item) => !item.expires_at || new Date(item.expires_at).getTime() > now);
    box.dataset.loaded = 'true';
    if (!active.length) { box.hidden = true; box.querySelector('.hg-pcr-notice-copy').replaceChildren(); return; }
    const labels = { warn: 'هشدار نظارتی', mute: 'محدودیت ارسال پیام', kick: 'محدودیت دسترسی به اتاق', ban: 'محرومیت از گفت‌وگوی عمومی' };
    const priority = ['ban', 'kick', 'mute', 'warn'];
    box.dataset.kind = priority.find((type) => active.some((item) => item.action_type === type)) || active[0].action_type;
    const itemsHtml = active.slice(0, 5).map((item) => {
      const expiry = item.expires_at ? new Date(item.expires_at).toLocaleString('fa-IR') : 'بدون تاریخ انقضا';
      const roomText = item.room_id ? ` · اتاق ${String(item.room_id).slice(0, 8)}` : '';
      return `<p><b>${escapeHtml(labels[item.action_type] || 'اقدام نظارتی ثبت‌شده')}${escapeHtml(roomText)}</b><br>${escapeHtml(item.reason || 'بدون توضیح')}<br><small>پایان/بازبینی: ${escapeHtml(expiry)}</small></p>`;
    }).join('');
    box.querySelector('.hg-pcr-notice-copy').innerHTML = `<b>اقدام نظارتی فعال برای حساب تو (${active.length.toLocaleString('fa-IR')})</b>${itemsHtml}<p>برای اعتراض یا توضیح، با پشتیبانی برنامه تماس بگیر.</p>`;
    box.hidden = false;
  } catch {
    // The public-chat moderation migration may not yet be applied; do not block existing chat.
    box.hidden = true;
    box.dataset.loaded = 'true';
  }
}

async function syncUser(session = null) {
  if (session) currentUser = session.user || null;
  else {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!error) currentUser = data?.session?.user || null;
    } catch {
      currentUser = null;
    }
  }
  addReviewButton();
  decorateMessages();
  await renderCurrentUserActionNotice();
}

function init() {
  if (!supabase || !isSupabaseConfigured) return;
  ensureOverlay();
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-hg-pcr-action]');
    if (!button) return;
    const action = button.dataset.hgPcrAction;
    if (action === 'open-queue') void openQueue();
    else if (action === 'report') showReportForm(button.dataset.id);
    else if (action === 'moderator-delete') void moderatorDelete(button.dataset.id);
    else if (action === 'dismiss-user-notice') { dismissedNoticeUserId = currentUser?.id || null; actionNotice?.remove(); actionNotice = null; }
    else if (action === 'refresh-user-notice') { if (actionNotice) delete actionNotice.dataset.loaded; void renderCurrentUserActionNotice(true); }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && overlay && !overlay.hidden) closeOverlay();
  });
  if (observer) observer.disconnect();
  observer = new MutationObserver(() => decorateMessages());
  observer.observe(document.body, { childList: true, subtree: true });
  void syncUser();
  supabase.auth.onAuthStateChange((_event, session) => {
    queueMicrotask(() => void syncUser(session));
  });
}

init();
