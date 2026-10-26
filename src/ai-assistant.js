import { supabase, isSupabaseConfigured } from './supabase-client.js';

const PAGE_ID = 'hg-ai-page';
const NAV_ID = 'hg-ai-nav';
const MAX_INPUT = 6000;
let activeConversationId = null;
let conversations = [];
let messages = [];
let busy = false;
let loadToken = 0;
let lastError = '';

const readLegacyState = () => {
  try { return JSON.parse(localStorage.getItem('rahe-talabegi-v1') || 'null'); }
  catch { return null; }
};
const pageIsActive = () => readLegacyState()?.ui?.page === 'ai';
const shortTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('fa-IR', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
};

function addStyles() {
  if (document.getElementById('hg-ai-styles')) return;
  const style = document.createElement('style');
  style.id = 'hg-ai-styles';
  style.textContent = `
    .hg-ai-layout{display:grid;grid-template-columns:minmax(0,1fr) 250px;gap:14px;align-items:start}
    .hg-ai-chat,.hg-ai-history{background:var(--paper);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);min-width:0}
    .hg-ai-chat{overflow:hidden}.hg-ai-heading{padding:17px 18px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px}
    .hg-ai-mark{width:43px;height:43px;border-radius:14px;display:grid;place-items:center;background:linear-gradient(145deg,var(--teal),var(--navy));color:white;font-size:22px;flex:none}
    .hg-ai-heading h3{margin:0;font-size:16px}.hg-ai-heading p{margin:3px 0 0;color:var(--muted);font-size:11px}
    .hg-ai-list{padding:16px;display:grid;gap:11px;min-height:300px;max-height:58vh;overflow:auto;overscroll-behavior:contain}
    .hg-ai-message{white-space:pre-wrap;overflow-wrap:anywhere;max-width:94%;border:1px solid var(--line);border-radius:15px;padding:11px 13px;line-height:1.95;font-size:13px}
    .hg-ai-message.user{justify-self:start;background:var(--mint);border-color:#c8e4d7}.hg-ai-message.assistant{justify-self:stretch;background:var(--soft)}
    .hg-ai-message small{display:block;font-size:10px;color:var(--muted);margin-bottom:4px}
    .hg-ai-empty{align-self:center;text-align:center;color:var(--muted);padding:24px 8px;font-size:13px}.hg-ai-empty b{display:block;color:var(--ink);font-size:15px;margin-bottom:6px}
    .hg-ai-compose{border-top:1px solid var(--line);padding:13px;display:grid;gap:7px}.hg-ai-compose textarea{width:100%;resize:vertical;min-height:95px;max-height:260px;padding:11px;border:1px solid var(--line);border-radius:12px;background:var(--paper);color:var(--ink);font:inherit;font-size:13px}
    .hg-ai-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.hg-ai-actions button,.hg-ai-history button{font:inherit;cursor:pointer}
    .hg-ai-button{border:1px solid var(--line);background:var(--paper);color:var(--ink);border-radius:11px;padding:7px 11px;font-size:12px}.hg-ai-button.primary{background:var(--teal);border-color:var(--teal);color:white}.hg-ai-button:disabled{opacity:.5;cursor:not-allowed}
    .hg-ai-status{margin:0 13px 12px;padding:9px 11px;border-radius:10px;font-size:12px;background:var(--soft);color:var(--muted)}.hg-ai-status.error{background:#fff1f3;color:#883447}.dark .hg-ai-status.error{background:#3a2529;color:#f5c7cf}
    .hg-ai-history{padding:12px}.hg-ai-history h3{font-size:14px;margin:2px 0 10px}.hg-ai-history-list{display:grid;gap:6px}.hg-ai-history-item{display:flex;align-items:center;gap:5px;width:100%;text-align:right;border:1px solid transparent;border-radius:10px;padding:8px;background:transparent;color:var(--ink);font-size:11px;overflow-wrap:anywhere}.hg-ai-history-item.active{background:var(--mint);border-color:#c8e4d7}.hg-ai-history-item span{flex:1}.hg-ai-history-item small{display:block;color:var(--muted);font-size:9px}.hg-ai-history-empty{color:var(--muted);font-size:11px;padding:8px 2px}
    .hg-ai-private{font-size:11px;color:var(--muted);margin-top:10px}.hg-ai-chip{display:inline-block;border:1px solid var(--line);border-radius:9px;padding:3px 7px;font-size:10px;color:var(--muted);margin:3px 3px 0 0}
    @media(max-width:900px){.hg-ai-layout{grid-template-columns:1fr}.hg-ai-history{order:2}.hg-ai-history-list{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:560px){.hg-ai-list{max-height:55vh;padding:10px}.hg-ai-message{max-width:100%;font-size:12px}.hg-ai-history-list{grid-template-columns:1fr}.hg-ai-heading{padding:13px}}
  `;
  document.head.append(style);
}

function navButton() {
  const nav = document.getElementById('nav');
  if (!nav || document.getElementById(NAV_ID)) return;
  const b = document.createElement('button');
  b.id = NAV_ID;
  b.className = 'navitem';
  b.type = 'button';
  b.dataset.act = 'go';
  b.dataset.page = 'ai';
  b.innerHTML = '<span class="navicon" aria-hidden="true">✦</span><span>دستیار هوشمند</span>';
  nav.append(b);
}

function syncActiveNav() {
  const active = pageIsActive();
  const b = document.getElementById(NAV_ID);
  if (b) {
    b.classList.toggle('active', active);
    if (active) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
}

function pageMarkup() {
  return `
    <div class="pagehead"><div><h2>دستیار هوشمند هم‌قدم ✦</h2><p>برای یادگیری صرف و نحو، فهم درس‌ها، برنامه‌ریزی و بررسی پرسش‌های علمی. پاسخ هوش مصنوعی را پیش از استناد علمی بررسی کن.</p></div><span class="datechip">اتصال امن سرور · نیازمند ورود</span></div>
    <div class="hg-ai-layout">
      <section class="hg-ai-chat" aria-label="گفت‌وگوی دستیار هوشمند">
        <header class="hg-ai-heading"><div class="hg-ai-mark" aria-hidden="true">✦</div><div><h3>همفکری و یادگیری</h3><p>فارسی، عربی و برنامه‌ریزی درسی</p></div></header>
        <div id="hg-ai-transcript" class="hg-ai-list" aria-live="polite"><div class="hg-ai-empty"><b>یک پرسش روشن شروع خوبی است.</b>مثلاً: «فعل ذهب را در مضارع صرف کن و یک تمرین بده.»</div></div>
        <div id="hg-ai-status" class="hg-ai-status" role="status" aria-live="polite">گفت‌وگوها در حساب هم‌قدم ذخیره می‌شوند. فقط متن همین گفت‌وگو برای تولید پاسخ به سرویس مدل ارسال می‌شود.</div>
        <form id="hg-ai-form" class="hg-ai-compose"><label for="hg-ai-input" class="small muted">پرسش تو (حداکثر ۶۰۰۰ نویسه)</label><textarea id="hg-ai-input" name="message" maxlength="6000" required placeholder="سؤالت را اینجا بنویس… برای خط جدید از Shift + Enter استفاده کن."></textarea>
          <div class="hg-ai-actions"><span id="hg-ai-counter" class="tiny muted">۰ / ۶۰۰۰</span><button class="hg-ai-button primary" type="submit" id="hg-ai-send">ارسال پرسش ↗</button></div>
        </form>
      </section>
      <aside class="hg-ai-history"><div class="between"><h3>تاریخچهٔ من</h3><button class="hg-ai-button" type="button" data-hg-ai="new">گفت‌وگوی تازه +</button></div><div id="hg-ai-history" class="hg-ai-history-list"><div class="hg-ai-history-empty">در حال دریافت تاریخچه…</div></div>
        <p class="hg-ai-private">حریم خصوصی: داده‌های دیگر برنامه و فایل‌های دستگاه خودکار ارسال نمی‌شوند. برای استفاده از API مدل، مدیر باید کلید را در Secrets سرور تنظیم کند.</p>
        <span class="hg-ai-chip">سقف ۱۰ درخواست در دقیقه</span><span class="hg-ai-chip">تاریخچهٔ حساب</span><span class="hg-ai-chip">کلید فقط سمت سرور</span>
      </aside>
    </div>`;
}

function setStatus(message, type = '') {
  const el = document.getElementById('hg-ai-status');
  if (!el) return;
  el.textContent = message;
  el.className = `hg-ai-status${type ? ` ${type}` : ''}`;
}

function renderTranscript() {
  const list = document.getElementById('hg-ai-transcript');
  if (!list) return;
  list.replaceChildren();
  if (!messages.length) {
    const empty = document.createElement('div');
    empty.className = 'hg-ai-empty';
    const b = document.createElement('b');
    b.textContent = 'یک پرسش روشن شروع خوبی است.';
    const p = document.createElement('div');
    p.textContent = 'مثلاً: «فعل ذهب را در مضارع صرف کن و یک تمرین بده.»';
    empty.append(b, p);
    list.append(empty);
    return;
  }
  for (const msg of messages) {
    const item = document.createElement('article');
    item.className = `hg-ai-message ${msg.role === 'assistant' ? 'assistant' : 'user'}`;
    const label = document.createElement('small');
    label.textContent = `${msg.role === 'assistant' ? 'دستیار هم‌قدم' : 'شما'}${msg.created_at ? ` · ${shortTime(msg.created_at)}` : ''}`;
    const body = document.createElement('div');
    body.textContent = String(msg.content || '');
    item.append(label, body);
    list.append(item);
  }
  list.scrollTop = list.scrollHeight;
}

function renderConversationList() {
  const list = document.getElementById('hg-ai-history');
  if (!list) return;
  list.replaceChildren();
  if (!conversations.length) {
    const empty = document.createElement('div');
    empty.className = 'hg-ai-history-empty';
    empty.textContent = 'هنوز گفت‌وگویی ذخیره نشده است.';
    list.append(empty);
    return;
  }
  for (const convo of conversations) {
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.gap = '4px';
    wrap.style.alignItems = 'center';
    const select = document.createElement('button');
    select.type = 'button';
    select.className = `hg-ai-history-item${convo.id === activeConversationId ? ' active' : ''}`;
    select.dataset.hgAi = 'select';
    select.dataset.id = convo.id;
    const title = document.createElement('span');
    title.textContent = convo.title || 'گفت‌وگوی تازه';
    const time = document.createElement('small');
    time.textContent = shortTime(convo.updated_at);
    title.append(time);
    select.append(title);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'hg-ai-button';
    del.dataset.hgAi = 'delete';
    del.dataset.id = convo.id;
    del.setAttribute('aria-label', `حذف گفت‌وگو: ${convo.title || 'گفت‌وگو'}`);
    del.textContent = '×';
    wrap.append(select, del);
    list.append(wrap);
  }
}

async function loadConversations() {
  if (!supabase || !isSupabaseConfigured) return;
  const { data, error } = await supabase.from('ai_conversations')
    .select('id,title,updated_at').order('updated_at', { ascending: false }).limit(30);
  if (error) {
    lastError = String(error.message || 'history-load-error');
    const missing = /relation .* does not exist|schema cache|not found/i.test(String(error.message || ''));
    setStatus(missing ? 'ساختار پایگاه دادهٔ دستیار هنوز اعمال نشده است. فایل migration مربوط به هم‌قدم را در SQL Editor همین پروژه اجرا کن.' : `دریافت تاریخچه ناموفق بود: ${error.message || 'خطای سرور'}`, 'error');
    conversations = [];
    renderConversationList();
    return;
  }
  lastError = '';
  conversations = Array.isArray(data) ? data : [];
  if (activeConversationId && !conversations.some(c => c.id === activeConversationId)) {
    activeConversationId = null;
    messages = [];
  }
  renderConversationList();
}

async function loadMessages(conversationId) {
  const token = ++loadToken;
  messages = [];
  renderTranscript();
  if (!conversationId || !supabase) return;
  const { data, error } = await supabase.from('ai_messages')
    .select('id,role,content,created_at').eq('conversation_id', conversationId)
    .order('created_at', { ascending: true }).limit(200);
  if (token !== loadToken) return;
  if (error) { setStatus(`خواندن تاریخچه ناموفق بود: ${error.message || 'خطای سرور'}`, 'error'); return; }
  messages = Array.isArray(data) ? data : [];
  renderTranscript();
}

function renderAIPage() {
  const main = document.getElementById('main');
  if (!main || !pageIsActive()) return;
  addStyles();
  navButton();
  syncActiveNav();
  main.innerHTML = pageMarkup();
  const input = document.getElementById('hg-ai-input');
  input?.addEventListener('input', () => {
    const counter = document.getElementById('hg-ai-counter');
    if (counter) counter.textContent = `${(input.value || '').length.toLocaleString('fa-IR')} / ${MAX_INPUT.toLocaleString('fa-IR')}`;
  });
  renderTranscript();
  renderConversationList();
  if (!isSupabaseConfigured || !supabase) {
    setStatus('اتصال Supabase در ساخت برنامه تنظیم نشده است. تا زمان تنظیم URL و کلید عمومی، دستیار آنلاین فعال نمی‌شود.', 'error');
    return;
  }
  setStatus('در حال بررسی نشست و تاریخچهٔ حساب…');
  void (async () => {
    const { data, error } = await supabase.auth.getUser();
    if (!pageIsActive()) return;
    if (error || !data?.user) {
      setStatus('برای استفاده از دستیار باید وارد حساب هم‌قدم شوی.', 'error');
      return;
    }
    await loadConversations();
    if (activeConversationId) await loadMessages(activeConversationId);
    if (!lastError) setStatus('آماده‌ایم. فقط متن پرسش و تاریخچهٔ همین گفت‌وگو برای پاسخ به سرویس مدل ارسال می‌شود.');
  })().catch(() => setStatus('بررسی نشست ناموفق بود؛ اتصال اینترنت و ورود را بررسی کن.', 'error'));
}

async function sendMessage(form) {
  if (busy) return;
  if (!supabase || !isSupabaseConfigured) { setStatus('اتصال سرور تنظیم نشده است.', 'error'); return; }
  const input = document.getElementById('hg-ai-input');
  const message = String(input?.value || '').trim();
  if (!message) { setStatus('پرسش را بنویس.', 'error'); input?.focus(); return; }
  if (message.length > MAX_INPUT) { setStatus(`پرسش نباید بیشتر از ${MAX_INPUT} نویسه باشد.`, 'error'); return; }
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData?.session) { setStatus('نشست معتبر نیست؛ دوباره وارد حساب هم‌قدم شو.', 'error'); return; }

  busy = true;
  const send = document.getElementById('hg-ai-send');
  if (send) send.disabled = true;
  if (input) input.disabled = true;
  setStatus('در حال گرفتن پاسخ از دستیار…');
  let timedOut = false;
  let timeoutHandle;
  const request = supabase.functions.invoke('hamghadam-ai', {
    body: { message, conversationId: activeConversationId },
  });
  const deadline = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => { timedOut = true; reject(new Error('CLIENT_TIMEOUT')); }, 27000);
  });
  try {
    const result = await Promise.race([request, deadline]);
    if (result.error) {
      let messageText = result.error.message || 'درخواست ناموفق بود.';
      try { const body = await result.error.context?.json?.(); if (body?.error) messageText = body.error; } catch { /* use safe fallback */ }
      throw new Error(messageText);
    }
    if (result.data?.error) throw new Error(String(result.data.error));
    if (!result.data?.conversationId || typeof result.data?.reply !== 'string') throw new Error('پاسخ سرور کامل نبود؛ تاریخچه را تازه‌سازی کن.');
    activeConversationId = result.data.conversationId;
    lastError = '';
    if (input) input.value = '';
    await loadConversations();
    await loadMessages(activeConversationId);
    setStatus('پاسخ دریافت و در تاریخچهٔ خصوصی حساب ذخیره شد.');
  } catch (error) {
    lastError = String(error?.message || '');
    if (timedOut) setStatus('پاسخ در مهلت ۲۷ ثانیه‌ای به رابط نرسید. ممکن است سرور درخواست را دریافت کرده باشد؛ پیش از ارسال دوباره، تاریخچه را تازه‌سازی کن.', 'error');
    else setStatus(String(error?.message || 'ارتباط با دستیار ناموفق بود.'), 'error');
  } finally {
    clearTimeout(timeoutHandle);
    busy = false;
    const btn = document.getElementById('hg-ai-send');
    const textarea = document.getElementById('hg-ai-input');
    if (btn) btn.disabled = false;
    if (textarea) textarea.disabled = false;
  }
}

async function deleteConversation(id) {
  if (!id || busy) return;
  const convo = conversations.find(c => c.id === id);
  if (!convo || !confirm(`گفت‌وگوی «${convo.title || 'گفت‌وگو'}» و تاریخچهٔ آن حذف شود؟ این کار بازگشت‌پذیر نیست.`)) return;
  busy = true;
  setStatus('در حال حذف گفت‌وگو…');
  try {
    const { data, error } = await supabase.functions.invoke('hamghadam-ai', { body: { action: 'delete', conversationId: id } });
    if (error) throw new Error(error.message || 'حذف ناموفق بود.');
    if (data?.error) throw new Error(String(data.error));
    if (activeConversationId === id) { activeConversationId = null; messages = []; }
    await loadConversations();
    renderTranscript();
    setStatus('گفت‌وگو و پیام‌هایش حذف شد.');
  } catch (error) {
    setStatus(String(error?.message || 'حذف ناموفق بود.'), 'error');
  } finally { busy = false; }
}

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== 'hg-ai-form') return;
  event.preventDefault();
  void sendMessage(form);
});

document.addEventListener('click', (event) => {
  const nav = event.target.closest(`#${NAV_ID}`);
  if (nav) setTimeout(() => renderAIPage(), 0);
  const button = event.target.closest('[data-hg-ai]');
  if (!button) return;
  const action = button.dataset.hgAi;
  if (action === 'new') {
    activeConversationId = null;
    messages = [];
    lastError = '';
    renderTranscript();
    renderConversationList();
    setStatus('گفت‌وگوی تازه آماده است؛ با اولین پاسخ موفق در سرور ذخیره می‌شود.');
    document.getElementById('hg-ai-input')?.focus();
  } else if (action === 'select') {
    activeConversationId = button.dataset.id || null;
    lastError = '';
    renderConversationList();
    void loadMessages(activeConversationId);
    setStatus('تاریخچهٔ انتخاب‌شده بارگیری می‌شود…');
  } else if (action === 'delete') {
    void deleteConversation(button.dataset.id || '');
  }
});

// The existing app is a single-page shell. Wrap its renderer so the AI route survives
// normal app navigation/auth profile refresh without rewriting the 500 KB legacy HTML.
if (typeof window.render === 'function' && !window.__hgAiRenderWrapped) {
  const originalRender = window.render.bind(window);
  window.render = (...args) => {
    const result = originalRender(...args);
    setTimeout(() => {
      navButton();
      syncActiveNav();
      if (pageIsActive()) renderAIPage();
    }, 0);
    return result;
  };
  window.__hgAiRenderWrapped = true;
}

const navObserver = new MutationObserver(() => {
  navButton();
  syncActiveNav();
});
const navRoot = document.getElementById('nav');
if (navRoot) navObserver.observe(navRoot, { childList: true });
navButton();
addStyles();
