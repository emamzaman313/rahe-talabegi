import './support-chat.css';
import './ai-assistant.js';
import { supabase as sharedSupabase, isSupabaseConfigured } from './supabase-client.js';
import { escapeHtml, formatTimestamp, isSupportAgent, normalizeMessage, statusLabel } from './support-utils.mjs';

const CONFIGURED = isSupabaseConfigured;
const db = sharedSupabase;

let activeRoot = null;
let currentUser = null;
let currentConversation = null;
let selectedConversationId = null;
let conversations = [];
let messages = [];
let authReady = false;
let busy = false;
let startFresh = false;
let notice = '';
let authStep = 'request';
let authPendingEmail = '';
let realtimeChannel = null;
let refreshSerial = 0;
let clearDraftOnNextRender = false;

const $ = (selector, root = activeRoot) => root?.querySelector(selector) || null;
const statusMarkup = (text, type = 'info') => text ? `<div class="rt-support-alert ${type}" role="status">${escapeHtml(text)}</div>` : '';
const userIsSupport = () => isSupportAgent(currentUser);
const normalizeOtp = (value) => String(value ?? '').replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632)).trim();

function renderMessages(items) {
  if (!items.length) return '<div class="rt-support-empty"><span>✦</span><b>شروع یک گفت‌وگوی آرام و روشن</b><p>پیام را بنویس؛ پاسخ پشتیبانی در همین بخش نمایش داده می‌شود.</p></div>';
  return `<div class="rt-support-messages" aria-live="polite">${items.map((message) => {
    const mine = message.sender_id === currentUser?.id;
    const sender = message.sender_role === 'support' ? 'پشتیبانی' : (mine ? 'شما' : 'کاربر');
    return `<article class="rt-support-message ${mine ? 'mine' : 'theirs'}"><div class="rt-support-message-meta"><b>${escapeHtml(sender)}</b><time>${escapeHtml(formatTimestamp(message.created_at))}</time></div><p>${escapeHtml(message.body).replace(/\n/g, '<br>')}</p></article>`;
  }).join('')}</div>`;
}

function renderSetup() {
  return `<section class="rt-support-setup"><div class="rt-support-icon">⚙</div><h3>اتصال سرور هنوز تنظیم نشده</h3><p>رابط گفت‌وگو آماده است، اما برای ارسال واقعی پیام باید پروژهٔ Supabase ساخته شود و نشانی پروژه و کلید عمومی آن در فایل <code>.env.local</code> قرار بگیرد.</p><ol><li>از <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">پنل Supabase</a> یک پروژه بساز.</li><li>فایل <code>.env.example</code> را به <code>.env.local</code> کپی و دو مقدار خواسته‌شده را جایگزین کن.</li><li>اسکریپت <code>supabase/migrations/20261022000000_support_chat.sql</code> را در SQL Editor اجرا کن.</li><li>بعد از تنظیم، پروژه را دوباره build کن.</li></ol><div class="rt-support-alert warn">کلید <code>service_role</code> یا کلید مخفی را هرگز در اپ قرار نده؛ فقط کلید publishable برای کلاینت مجاز است.</div></section>`;
}

function renderAuth() {
  return `<section class="rt-support-auth"><div class="rt-support-heading"><div class="rt-support-icon">🔐</div><div><h3>${authStep === 'verify' ? 'تأیید ایمیل' : 'ورود به پشتیبانی'}</h3><p>${authStep === 'verify' ? `ایمیل ${escapeHtml(authPendingEmail)} را بررسی کن؛ کد را وارد کن یا روی پیوندش بزن تا به برنامه برگردی.` : 'برای نگه‌داری خصوصی گفتگو باید وارد حساب کاربری شوی.'}</p></div></div>${statusMarkup(notice, notice.toLowerCase().includes('خطا') || notice.toLowerCase().includes('ناموفق') ? 'error' : 'info')}<form id="rtSupportAuthForm" class="rt-support-form">${authStep === 'verify' ? `<input type="hidden" name="email" value="${escapeHtml(authPendingEmail)}"><label>کد تأیید<input name="token" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9٠-٩۰-۹]{6,10}" minlength="6" maxlength="10" required dir="ltr" placeholder="12345678"></label><div class="rt-support-actions"><button class="rt-support-primary" type="submit" data-mode="verify" ${busy ? 'disabled' : ''}>تأیید و ادامه</button><button class="rt-support-secondary" type="submit" data-mode="resend" ${busy ? 'disabled' : ''}>ارسال دوباره</button></div><button class="rt-support-textbutton" type="submit" data-mode="change" ${busy ? 'disabled' : ''}>تغییر ایمیل</button>` : `<label>ایمیل<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"></label><div class="rt-support-actions"><button class="rt-support-primary" type="submit" data-mode="login" ${busy ? 'disabled' : ''}>ارسال ایمیل ورود</button><button class="rt-support-secondary" type="submit" data-mode="signup" ${busy ? 'disabled' : ''}>ساخت حساب</button></div>`}</form><p class="rt-support-small">ورود فقط پس از تأیید ایمیل انجام می‌شود؛ رمز عبور از تو درخواست نمی‌شود.</p></section>`;
}

function renderConversationList() {
  if (!conversations.length) return '<div class="rt-support-empty compact">گفت‌وگویی ثبت نشده است.</div>';
  return `<div class="rt-support-inbox-list">${conversations.map((c) => `<button class="rt-support-conversation ${c.id === selectedConversationId ? 'selected' : ''}" type="button" data-support-action="select" data-id="${escapeHtml(c.id)}"><span class="rt-support-conv-status ${escapeHtml(c.status)}"></span><span class="rt-support-conv-copy"><b>${escapeHtml(c.subject || 'درخواست پشتیبانی')}</b><small>${escapeHtml(c.user_email || c.user_id || '')}</small><small>${escapeHtml(formatTimestamp(c.last_message_at || c.updated_at || c.created_at))}</small></span><span class="rt-support-status-label">${escapeHtml(statusLabel(c.status))}</span></button>`).join('')}</div>`;
}

function renderAgent() {
  const selected = conversations.find((c) => c.id === selectedConversationId) || null;
  return `<section class="rt-support-agent"><div class="rt-support-heading"><div class="rt-support-icon">🛟</div><div><h3>صندوق پشتیبانی</h3><p>ورود تأیید شد: ${escapeHtml(currentUser?.email || '')}</p></div><button class="rt-support-secondary compact-button" type="button" data-support-action="refresh">تازه‌سازی</button><button class="rt-support-textbutton" type="button" data-support-action="logout">خروج</button></div>${statusMarkup(notice)}<div class="rt-support-agent-grid"><aside class="rt-support-inbox"><div class="rt-support-subhead"><b>گفت‌وگوها</b><span>${conversations.length.toLocaleString('fa-IR')}</span></div>${renderConversationList()}</aside><section class="rt-support-thread">${selected ? `<div class="rt-support-thread-head"><div><b>${escapeHtml(selected.subject || 'درخواست پشتیبانی')}</b><small>${escapeHtml(selected.user_id)}</small></div><label class="rt-support-status-select">وضعیت<select data-support-status="1" aria-label="وضعیت گفتگو"><option value="open" ${selected.status === 'open' ? 'selected' : ''}>باز</option><option value="answered" ${selected.status === 'answered' ? 'selected' : ''}>پاسخ داده شده</option><option value="closed" ${selected.status === 'closed' ? 'selected' : ''}>بسته</option></select></label></div>${renderMessages(messages)}<form id="rtSupportMessageForm" class="rt-support-send"><textarea name="body" required maxlength="5000" rows="2" placeholder="پاسخ پشتیبانی…" ${busy ? 'disabled' : ''}></textarea><button class="rt-support-primary" type="submit" ${busy ? 'disabled' : ''}>ارسال پاسخ</button></form>` : '<div class="rt-support-empty"><span>☷</span><b>یک گفت‌وگو را انتخاب کن</b><p>برای پاسخ‌گویی، گفت‌وگو را از فهرست سمت راست باز کن.</p></div>'}</section></div></section>`;
}

function renderUser() {
  const c = currentConversation;
  const closed = Boolean(c && c.status === 'closed');
  return `<section class="rt-support-user"><div class="rt-support-heading"><div class="rt-support-icon">💬</div><div><h3>پیام به پشتیبانی</h3><p>${escapeHtml(currentUser?.email || '')}</p></div><button class="rt-support-textbutton" type="button" data-support-action="logout">خروج از حساب</button></div>${statusMarkup(notice)}${c && !startFresh ? `<div class="rt-support-thread-head"><div><b>${escapeHtml(c.subject || 'درخواست پشتیبانی')}</b><small>شناسه: ${escapeHtml(c.id.slice(0, 8))}</small></div><span class="rt-support-status-pill ${escapeHtml(c.status)}">${escapeHtml(statusLabel(c.status))}</span></div>${renderMessages(messages)}` : `<div class="rt-support-empty"><span>✉</span><b>درخواست تازه</b><p>پیامت را بنویس؛ پس از ارسال، یک گفت‌وگوی خصوصی ساخته می‌شود.</p></div>`}${closed && !startFresh ? `<div class="rt-support-alert info">این گفت‌وگو بسته شده است. برای پیام تازه، گفت‌وگوی جدید بساز.</div><button class="rt-support-secondary" type="button" data-support-action="new">＋ گفت‌وگوی جدید</button>` : `<form id="rtSupportMessageForm" class="rt-support-send"><label class="sr-only" for="rtSupportMessageBody">متن پیام</label><textarea id="rtSupportMessageBody" name="body" required maxlength="5000" rows="3" placeholder="پیامت را اینجا بنویس…" ${busy ? 'disabled' : ''}></textarea><div class="rt-support-send-foot"><small>حداکثر ۵۰۰۰ نویسه؛ از ارسال رمز و اطلاعات حساس خودداری کن.</small><button class="rt-support-primary" type="submit" ${busy ? 'disabled' : ''}>ارسال پیام ←</button></div></form>`}<div class="rt-support-user-actions"><button class="rt-support-secondary" type="button" data-support-action="refresh">بررسی پاسخ تازه</button>${c && !closed ? '<button class="rt-support-textbutton" type="button" data-support-action="new">شروع گفت‌وگوی جداگانه</button>' : ''}</div></section>`;
}

function renderSurface() {
  if (!activeRoot || !activeRoot.isConnected) return;
  const oldDraft = clearDraftOnNextRender ? '' : ($('#rtSupportMessageBody')?.value || $('#rtSupportMessageForm textarea')?.value || '');
  if (!CONFIGURED) activeRoot.innerHTML = renderSetup();
  else if (!authReady) activeRoot.innerHTML = '<div class="rt-support-empty"><span>◌</span><b>در حال اتصال امن…</b></div>';
  else if (!currentUser) activeRoot.innerHTML = renderAuth();
  else if (userIsSupport()) activeRoot.innerHTML = renderAgent();
  else activeRoot.innerHTML = renderUser();
  const textarea = $('#rtSupportMessageBody') || $('#rtSupportMessageForm textarea');
  if (textarea && oldDraft) textarea.value = oldDraft;
  clearDraftOnNextRender = false;
}

async function removeRealtime() {
  if (db && realtimeChannel) {
    try { await db.removeChannel(realtimeChannel); } catch { /* best-effort cleanup */ }
  }
  realtimeChannel = null;
}

function setupRealtime() {
  if (!db || !currentUser) return;
  const previousChannel = realtimeChannel;
  realtimeChannel = null;
  if (previousChannel) void db.removeChannel(previousChannel);
  realtimeChannel = db.channel(`support-chat-${currentUser.id}-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages' }, () => { void refreshData(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'support_conversations' }, () => { void refreshData(); })
    .subscribe();
}

async function fetchMessages(conversationId) {
  if (!db || !conversationId) return [];
  const { data, error } = await db.from('support_messages')
    .select('id,conversation_id,sender_id,sender_role,body,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true }).limit(300);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function loadMessages(conversationId) {
  const forConversation = conversationId;
  const data = await fetchMessages(forConversation);
  if (!userIsSupport() && currentConversation?.id !== forConversation) return;
  if (userIsSupport() && selectedConversationId !== forConversation) return;
  messages = data;
}

async function refreshData() {
  if (!db || !currentUser || !activeRoot?.isConnected) return;
  const serial = ++refreshSerial;
  const userSnapshot = currentUser;
  const supportSnapshot = userIsSupport();
  let nextConversations = [];
  let nextConversation = null;
  let nextSelectedId = selectedConversationId;
  let nextMessages = [];
  let refreshFailed = false;
  notice = '';
  try {
    if (supportSnapshot) {
      const { data, error } = await db.from('support_conversations')
        .select('id,user_id,user_email,subject,status,created_at,updated_at,last_message_at')
        .order('last_message_at', { ascending: false }).limit(100);
      if (error) throw error;
      nextConversations = data || [];
      if (!nextSelectedId || !nextConversations.some((c) => c.id === nextSelectedId)) {
        nextSelectedId = nextConversations[0]?.id || null;
      }
      nextConversation = nextConversations.find((c) => c.id === nextSelectedId) || null;
      nextMessages = await fetchMessages(nextSelectedId);
    } else if (startFresh) {
      nextConversation = null;
      nextMessages = [];
    } else {
      const { data, error } = await db.from('support_conversations')
        .select('id,user_id,user_email,subject,status,created_at,updated_at,last_message_at')
        .eq('user_id', userSnapshot.id)
        .order('last_message_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      nextConversation = data || null;
      nextMessages = await fetchMessages(nextConversation?.id || null);
    }
  } catch (error) {
    refreshFailed = true;
    if (serial === refreshSerial && userSnapshot.id === currentUser?.id) {
      notice = `خطا در دریافت گفتگوها: ${error?.message || 'خطای نامشخص'}`;
    }
  }
  if (serial !== refreshSerial || userSnapshot.id !== currentUser?.id || supportSnapshot !== userIsSupport()) return;
  if (refreshFailed) { renderSurface(); return; }
  conversations = nextConversations;
  currentConversation = nextConversation;
  if (supportSnapshot) selectedConversationId = nextSelectedId;
  messages = nextMessages;
  renderSurface();
}

async function sendMessage(form) {
  if (!db || !currentUser || busy) return;
  const input = form.querySelector('textarea[name="body"]');
  const body = normalizeMessage(input?.value ?? '');
  if (body === null) { notice = 'پیام نمی‌تواند بیشتر از ۵۰۰۰ نویسه باشد.'; renderSurface(); return; }
  if (!body) { notice = 'متن پیام را بنویس.'; renderSurface(); return; }
  const support = userIsSupport();
  if (support && !selectedConversationId) { notice = 'ابتدا یک گفت‌وگو را انتخاب کن.'; renderSurface(); return; }
  if (!support && currentConversation?.status === 'closed' && !startFresh) { notice = 'این گفتگو بسته است؛ برای پیام جدید گفت‌وگوی تازه بساز.'; renderSurface(); return; }
  busy = true;
  notice = '';
  renderSurface();
  try {
    let conversationId = support ? selectedConversationId : currentConversation?.id;
    if (!conversationId) {
      const subject = body.replace(/\s+/g, ' ').slice(0, 90) || 'درخواست پشتیبانی';
      const { data, error } = await db.from('support_conversations')
        .insert({ user_id: currentUser.id, subject: subject })
        .select('id,user_id,user_email,subject,status,created_at,updated_at,last_message_at').single();
      if (error) throw error;
      currentConversation = data;
      conversationId = data.id;
      startFresh = false;
      selectedConversationId = data.id;
    }
    const { error: insertError } = await db.from('support_messages').insert({
      conversation_id: conversationId,
      sender_id: currentUser.id,
      sender_role: support ? 'support' : 'user',
      body
    });
    if (insertError) throw insertError;
    if (input) input.value = '';
    clearDraftOnNextRender = true;
    notice = 'پیام ارسال شد.';
    await refreshData();
  } catch (error) {
    notice = `پیام ارسال نشد: ${error?.message || 'اتصال سرور را بررسی کن.'}`;
  } finally {
    busy = false;
    renderSurface();
  }
}

async function handleAuth(form, mode) {
  if (!db || busy) return;
  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim();
  const token = normalizeOtp(formData.get('token'));
  if (mode === 'change') { authStep = 'request'; authPendingEmail = ''; notice = ''; renderSurface(); return; }
  if (mode === 'verify' && !/^\d{6,10}$/.test(token)) { notice = 'کد تأیید باید بین ۶ تا ۱۰ رقم باشد.'; renderSurface(); return; }
  if (mode !== 'verify' && mode !== 'resend' && !email) { notice = 'ایمیل را وارد کن.'; renderSurface(); return; }
  busy = true;
  notice = '';
  renderSurface();
  try {
    if (mode === 'signup' || mode === 'login' || mode === 'resend') {
      const targetEmail = mode === 'resend' ? authPendingEmail : email.trim().toLowerCase();
      if (!targetEmail) throw new Error('ایمیل را وارد کن.');
      const { error } = await db.auth.signInWithOtp({ email: targetEmail, options: { shouldCreateUser: mode === 'signup', emailRedirectTo: `${location.origin}${location.pathname}` } });
      if (error) throw error;
      authPendingEmail = targetEmail; authStep = 'verify';
      notice = mode === 'login' ? 'اگر این ایمیل حساب داشته باشد، ایمیل ورود ارسال شده است؛ کد را وارد کن یا روی پیوندش بزن.' : 'ایمیل تأیید ارسال شد؛ کد را وارد کن یا روی پیوندش بزن.';
    } else if (mode === 'verify') {
      const { data, error } = await db.auth.verifyOtp({ email: authPendingEmail, token, type: 'email' });
      if (error) throw error;
      currentUser = data.user; authReady = true; authStep = 'request'; authPendingEmail = '';
      setupRealtime(); await refreshData();
    }
  } catch (error) {
    notice = `خطا: ${error?.message || 'عملیات ورود ناموفق بود.'}`;
  } finally {
    busy = false;
    renderSurface();
  }
}

async function logout() {
  if (!db) return;
  busy = true;
  renderSurface();
  await removeRealtime();
  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;
    currentUser = null; currentConversation = null; selectedConversationId = null;
    conversations = []; messages = []; startFresh = false; notice = 'از حساب خارج شدی.';
  } catch (error) {
    notice = `خروج ناموفق بود: ${error?.message || 'خطای نامشخص'}`;
  } finally {
    busy = false;
    renderSurface();
  }
}

async function changeStatus(select) {
  if (!db || !userIsSupport() || !selectedConversationId) return;
  const status = select.value;
  const { error } = await db.from('support_conversations').update({ status }).eq('id', selectedConversationId);
  if (error) notice = `تغییر وضعیت انجام نشد: ${error.message}`;
  else notice = 'وضعیت گفتگو به‌روزرسانی شد.';
  await refreshData();
}

async function mountRoot(root) {
  if (!root || root === activeRoot) return;
  activeRoot = root;
  if (!CONFIGURED) { authReady = true; renderSurface(); return; }
  renderSurface();
  if (!authReady) {
    const { data, error } = await db.auth.getSession();
    if (error) notice = `خطا در خواندن نشست: ${error.message}`;
    currentUser = data?.session?.user || null;
    authReady = true;
    if (currentUser) {
      setupRealtime();
      await refreshData();
    }
  } else if (currentUser) {
    await refreshData();
  } else renderSurface();
}

const observer = new MutationObserver(() => {
  const root = document.querySelector('#rt-support-root, #support-chat-root');
  if (root && root !== activeRoot) void mountRoot(root);
  else if (!root && activeRoot && !activeRoot.isConnected) activeRoot = null;
});
observer.observe(document.documentElement, { childList: true, subtree: true });

if (db) {
  db.auth.onAuthStateChange((_event, session) => {
    const nextUser = session?.user || null;
    if (nextUser?.id === currentUser?.id && nextUser?.app_metadata?.role === currentUser?.app_metadata?.role) return;
    currentUser = nextUser;
    authReady = true;
    currentConversation = null; selectedConversationId = null; conversations = []; messages = []; startFresh = false;
    if (!currentUser) void removeRealtime();
    else setupRealtime();
    if (currentUser) void refreshData(); else renderSurface();
  });
}

// This module only handles the dedicated support screen. Other app forms keep their existing handlers.
document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.id === 'rtSupportAuthForm') {
    event.preventDefault();
    const mode = event.submitter?.dataset?.mode || 'login';
    void handleAuth(form, mode);
  } else if (form.id === 'rtSupportMessageForm') {
    event.preventDefault();
    void sendMessage(form);
  }
});

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-support-action]');
  if (!button || !activeRoot?.contains(button)) return;
  const action = button.dataset.supportAction;
  if (action === 'logout') void logout();
  else if (action === 'refresh') void refreshData();
  else if (action === 'new') {
    refreshSerial += 1;
    startFresh = true;
    currentConversation = null;
    messages = [];
    notice = '';
    renderSurface();
  } else if (action === 'select') {
    selectedConversationId = button.dataset.id;
    currentConversation = conversations.find((c) => c.id === selectedConversationId) || null;
    void loadMessages(selectedConversationId).then(renderSurface).catch((error) => { notice = error.message; renderSurface(); });
  }
});

document.addEventListener('change', (event) => {
  const select = event.target.closest('[data-support-status]');
  if (select && activeRoot?.contains(select)) void changeStatus(select);
});

// The standalone support inbox entry point has a static root. The app's support root is created on navigation.
const initialRoot = document.querySelector('#rt-support-root, #support-chat-root');
if (initialRoot) void mountRoot(initialRoot);

