import './hamghadam-suite.css';
import { supabase, isSupabaseConfigured } from './supabase-client.js';
import {
  HGD_ARGUMENT_TYPES, HGD_FEATURE_LABELS, HGD_FILE_LIMITS, HGD_REPORT_REASONS,
  nextReviewSchedule, normalizeText, selectActiveOccasion, validateOccasion, validateUpload,
} from './hamghadam-suite-core.mjs';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
const faDate = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('fa-IR', { dateStyle:'medium', timeStyle:'short' }); };
const timeOnly = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('fa-IR', { hour:'2-digit', minute:'2-digit' }); };
const fmtNum = (v) => Number(v || 0).toLocaleString('fa-IR');
const errText = (e) => {
  const m = String(e?.message || '');
  if (/row-level security|permission denied|42501/i.test(m)) return 'سرور اجازهٔ این کار را نداد. مجوزها یا عضویت این حساب را بررسی کن.';
  if (/duplicate key|23505/i.test(m)) return 'این مورد قبلاً ثبت شده است.';
  if (/network|fetch|timeout|offline|failed to fetch/i.test(m)) return 'اتصال اینترنت برقرار نیست یا پاسخ سرور دیر رسیده است.';
  return m ? normalizeText(m, 600) : 'خطای نامشخصی رخ داد.';
};

const state = {
  user: null, session: null, prefs: null, occasions: [], activeOccasion: null,
  features: {}, tab: 'themes', topicId: null, chatId: null, replyId: null,
  topics: [], posts: [], chats: [], messages: [], chatUserResults: [], book: null, notes: [], flashcards: [], quizzes: [], globalAudio: null, searchRequest: 0,
  chatChannel: null, busy: false, origin: null,
};

const TAB_ITEMS = [
  ['themes','✦','تم و مناسبت'], ['debates','⚖','مباحثه'], ['groups','◌','گروه بحث'],
  ['chats','☏','چت‌ها'], ['study','▤','میز مطالعه'], ['flashcards','◇','مرور فاصله‌دار'], ['quizzes','✓','آزمون'], ['announcements','▱','اعلان‌ها'], ['settings','⚙','تنظیمات'],
];

function isAdmin(user = state.user) {
  const meta = user?.app_metadata || {};
  const roles = Array.isArray(meta.roles) ? meta.roles : [];
  return ['admin','super_admin'].includes(meta.role) || roles.includes('admin') || roles.includes('super_admin');
}
function isManager(user = state.user) {
  const meta = user?.app_metadata || {};
  const roles = Array.isArray(meta.roles) ? meta.roles : [];
  return isAdmin(user) || ['support','chat_moderator','content_moderator'].includes(meta.role) || roles.some((x) => ['support','chat_moderator','content_moderator'].includes(x));
}
function featureEnabled(key) { return state.features[key] !== false; }
function alertMarkup(message, type = 'info') { return message ? `<div class="hgd-alert ${type === 'error' ? 'error' : type === 'warn' ? 'warn' : ''}" role="status">${escapeHtml(message)}</div>` : ''; }
function button(label, action, extra = '', cls = '') { return `<button type="button" class="hgd-button ${cls}" data-hgd-action="${escapeHtml(action)}" ${extra}>${label}</button>`; }
function field(label, name, type = 'text', value = '', extra = '') { return `<div class="hgd-field"><label for="hgd-${escapeHtml(name)}">${label}</label><input id="hgd-${escapeHtml(name)}" name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" ${extra}></div>`; }
function empty(title, desc = '') { return `<div class="hgd-empty"><b>${escapeHtml(title)}</b>${desc ? `<div>${escapeHtml(desc)}</div>` : ''}</div>`; }
function getRoot() {
  let el = $('#hgd-suite-root');
  if (el) return el;
  el = document.createElement('div'); el.id = 'hgd-suite-root'; el.setAttribute('dir','rtl'); el.setAttribute('aria-label','قابلیت‌های تکمیلی هم‌قدم');
  el.innerHTML = `<section class="hgd-window" role="dialog" aria-modal="true" aria-labelledby="hgd-title">
    <header class="hgd-header"><div class="hgd-brand"><div class="hgd-brand-mark">هـ</div><div><h2 id="hgd-title">هم‌قدم | امکانات اجتماعی و مطالعه</h2><p>گفت‌وگو، مباحثه، مناسبت‌ها و پیشرفت درسی</p></div></div><div class="hgd-row"><button type="button" class="hgd-notification-button" data-hgd-action="notifications" aria-label="اعلان‌ها">🔔 <span data-notification-count></span></button><button type="button" class="hgd-close" data-hgd-action="close" aria-label="بستن">×</button></div></header>
    <nav class="hgd-tabs" aria-label="بخش‌های هم‌قدم">${TAB_ITEMS.map(([id,ico,label]) => `<button class="hgd-tab" type="button" data-hgd-tab="${id}"><span>${ico}</span> ${label}</button>`).join('')}</nav>
    <main class="hgd-content" id="hgd-content"><div class="hgd-empty">در حال آماده‌سازی…</div></main>
    <footer class="hgd-foot"><span id="hgd-connection">وضعیت اتصال بررسی می‌شود</span><span>همهٔ داده‌های آنلاین به مجوزهای سرور وابسته‌اند؛ موفقیت فقط پس از پاسخ سرور اعلام می‌شود.</span></footer>
  </section>`;
  document.body.append(el);
  el.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-hgd-tab]');
    if (tab) { void setTab(tab.dataset.hgdTab); return; }
    const action = event.target.closest('[data-hgd-action]');
    if (action) { event.preventDefault(); if(action.dataset.hgdAction==='open-notification'){void openNotification(action.dataset.id);return;} void actionHandler(action.dataset.hgdAction, action); }
  });
  el.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-hgd-form]');
    if (!form) return;
    event.preventDefault(); void formHandler(form.dataset.hgdForm, form);
  });
  el.addEventListener('change', (event) => {
    const inp = event.target.closest('[data-hgd-change]');
    if (inp) void changeHandler(inp.dataset.hgdChange, inp);
  });
  el.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeSuite(); });
  return el;
}

function addLaunchers() {
  const actions = $('.topactions');
  if (actions && !$('#hgd-suite-launcher')) {
    const b = document.createElement('button'); b.id='hgd-suite-launcher'; b.type='button'; b.className='btn hgd-launcher'; b.textContent='✦ مباحثه و جامعه'; b.addEventListener('click', () => void openSuite('debates'));
    const ref = $('#hg-account-box', actions); actions.insertBefore(b, ref || null);
  }
  if (actions && !$('#hgd-chat-launcher')) {
    const b = document.createElement('button'); b.id='hgd-chat-launcher'; b.type='button'; b.className='btn hgd-launcher'; b.textContent='☏ چت‌ها'; b.setAttribute('aria-label','باز کردن گفت‌وگوهای خصوصی، گروه‌ها و کانال‌ها'); b.addEventListener('click', () => void openSuite('chats'));
    const ref = $('#hg-account-box', actions); actions.insertBefore(b, ref || null);
  }
  if (isAdmin() && actions && !$('#hgd-admin-launcher')) {
    const a = document.createElement('a'); a.id='hgd-admin-launcher'; a.className='btn hgd-launcher'; a.href='./admin.html'; a.textContent='▣ پنل مدیریت';
    const ref = $('#hg-account-box', actions); actions.insertBefore(a, ref || null);
  } else if (!isAdmin()) $('#hgd-admin-launcher')?.remove();
}

async function loadSession() {
  if (!isSupabaseConfigured || !supabase) { state.user=null; state.session=null; $('#hgd-connection')?.replaceChildren(document.createTextNode('اتصال سرور تنظیم نشده')); return; }
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  state.session = data.session || null; state.user = data.session?.user || null;
  if (state.user) await loadUserBootstrap();
  else await loadGlobalAudio();
  addLaunchers();
}

async function loadGlobalAudio() {
  if (!supabase) return;
  const { data, error } = await supabase.from('app_settings').select('setting_value').eq('setting_key','global_audio').maybeSingle();
  if (error) { console.warn('Global music could not be loaded:', errText(error)); return; }
  state.globalAudio = data?.setting_value || null;
  applyGlobalAudio();
}

async function loadUserBootstrap() {
  if (!supabase || !state.user) return;
  const [{data:settings,error:settingsErr},{data:prefs,error:prefsErr},{data:occasions,error:occasionsErr},{data:audioSetting,error:audioErr}] = await Promise.all([
    supabase.from('app_settings').select('setting_value').eq('setting_key','features').maybeSingle(),
    supabase.from('user_preferences').select('*').eq('user_id',state.user.id).maybeSingle(),
    supabase.from('occasion_themes').select('*').eq('enabled',true).lte('starts_at',new Date().toISOString()).gt('ends_at',new Date().toISOString()).order('priority',{ascending:false}).limit(10),
    supabase.from('app_settings').select('setting_value').eq('setting_key','global_audio').maybeSingle(),
  ]);
  if (settingsErr && !/does not exist|schema cache/i.test(settingsErr.message || '')) throw settingsErr;
  if (prefsErr && !/does not exist|schema cache/i.test(prefsErr.message || '')) throw prefsErr;
  if (occasionsErr && !/does not exist|schema cache/i.test(occasionsErr.message || '')) throw occasionsErr;
  if (audioErr && !/does not exist|schema cache/i.test(audioErr.message || '')) throw audioErr;
  state.features=settings?.setting_value || {};
  state.prefs=prefs || null;
  state.occasions=occasions || [];
  state.activeOccasion=state.prefs?.disable_occasion_themes ? null : selectActiveOccasion(state.occasions);
  state.globalAudio=audioSetting?.setting_value || null;
  applyPreferences(); applyOccasionBanner(); applyGlobalAudio();
  $('#hgd-connection')?.replaceChildren(document.createTextNode('متصل به Supabase · '+(state.user.email || 'حساب واردشده')));
}

function applyPreferences() {
  const prefs = state.prefs;
  if (!prefs) {
    document.body.classList.remove('hgd-reduce-motion');
    document.documentElement.style.removeProperty('--font-scale');
    return;
  }
  const dark = prefs.color_mode === 'dark' || (prefs.color_mode === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  if (prefs.color_mode === 'system' || prefs.color_mode === 'light' || prefs.color_mode === 'dark') document.body.classList.toggle('dark', Boolean(dark));
  document.body.classList.toggle('hgd-reduce-motion', Boolean(prefs.reduce_motion));
  document.documentElement.style.setProperty('--font-scale', String(prefs.font_scale || 1));
}

function applyOccasionBanner() {
  const old = $('#hgd-active-occasion-banner'); old?.remove();
  document.body.classList.remove('hgd-occasion-birth','hgd-occasion-martyrdom','hgd-occasion-religious');
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--hgd-accent', '#17766a');
  rootStyle.setProperty('--hgd-occasion-bg', '#f2f6f0');
  const o = state.activeOccasion;
  const palette = o?.occasion_type === 'birth'
    ? { '--teal':'#713b88','--teal2':'#b64f8d','--mint':'#f8e0ee','--bg':'#fff7e8','--paper':'#fffdf6','--navy':'#473257','--gold':'#e4a83f' }
    : o?.occasion_type === 'martyrdom'
      ? { '--teal':'#64242e','--teal2':'#953745','--mint':'#f1e2e3','--bg':'#f3eeee','--paper':'#fffafa','--navy':'#392d31','--gold':'#b59a74' }
      : null;
  for (const key of ['--teal','--teal2','--mint','--bg','--paper','--navy','--gold']) rootStyle.removeProperty(key);
  if (palette) for (const [key,value] of Object.entries(palette)) rootStyle.setProperty(key,value);
  if (!o || !isSafeTheme(o)) return;
  rootStyle.setProperty('--hgd-accent', o.accent_color);
  rootStyle.setProperty('--hgd-occasion-bg', o.background_color);
  const kind = o.occasion_type === 'birth' ? 'birth' : o.occasion_type === 'martyrdom' ? 'martyrdom' : 'religious';
  document.body.classList.add(`hgd-occasion-${kind}`);
  const b = document.createElement('section'); b.id='hgd-active-occasion-banner'; b.className='hgd-occasion-banner'; b.dir='rtl';
  b.style.setProperty('--hgd-accent',o.accent_color); b.style.setProperty('--hgd-occasion-bg',o.background_color); b.innerHTML=`<h3>${kind==='birth'?'🌙 ولادت مبارک':kind==='martyrdom'?'🕯 یادبود و سوگواری':'✦ مناسبت مذهبی'} · ${escapeHtml(o.title)}</h3><p>${escapeHtml(o.description||'تم مناسبتی هم‌قدم فعال است. از بخش «تم و مناسبت» می‌توانی افکت‌ها را مدیریت یا خاموش کنی.')}</p><button type="button" class="hgd-button soft" id="hgd-theme-control">تنظیم تم</button>`;
  const top = $('.topbar'); if (top?.parentNode) top.insertAdjacentElement('afterend',b);
  $('#hgd-theme-control',b)?.addEventListener('click',()=>void openSuite('themes'));
}
function isSafeTheme(o) { const color = (v) => /^#[0-9a-f]{6}$/i.test(String(v||'')); return color(o.accent_color) && color(o.background_color); }
function applyGlobalAudio() {
  const previous=$('#hgd-global-audio-dock');previous?.remove();
  const setting=state.globalAudio;
  if(!setting?.enabled||!setting?.path||!supabase)return;
  const url=supabase.storage.from('hamghadam-global-audio').getPublicUrl(setting.path).data.publicUrl;
  const dock=document.createElement('aside');dock.id='hgd-global-audio-dock';dock.className='hgd-global-audio-dock';dock.dir='rtl';
  const audio=document.createElement('audio');audio.controls=true;audio.preload='auto';audio.src=url;audio.autoplay=true;audio.setAttribute('aria-label','موسیقی سراسری هم‌قدم');
  const label=document.createElement('span');label.textContent=setting.title||'موسیقی هم‌قدم';
  const start=document.createElement('button');start.type='button';start.textContent='▶ شروع موسیقی';start.setAttribute('aria-label','شروع پخش موسیقی');
  start.style.cssText='border:0;border-radius:10px;padding:8px 12px;background:#176b67;color:white;font:inherit;font-weight:700;cursor:pointer';
  const attempt=()=>audio.play().then(()=>{start.hidden=true;}).catch(()=>{start.hidden=false;});
  start.addEventListener('click',()=>{void attempt();});
  audio.addEventListener('playing',()=>{start.hidden=true;});
  audio.addEventListener('pause',()=>{if(!audio.ended)start.hidden=false;});
  start.hidden=true;
  dock.append(label,audio,start);document.body.append(dock);
  void attempt();
}

async function openSuite(tab = 'themes') {
  const root = getRoot(); root.classList.add('hgd-open'); document.body.style.overflow='hidden';
  try { await loadSession(); } catch (e) { renderUnauthed(`خواندن نشست انجام نشد: ${errText(e)}`); return; }
  if (!state.user) { renderUnauthed('برای استفاده از امکانات آنلاین، ابتدا در برنامه وارد حساب کاربری شو.'); return; }
  addLaunchers(); await setTab(tab);
  void refreshNotificationCount();
}
function closeSuite() { const root=$('#hgd-suite-root'); root?.classList.remove('hgd-open'); document.body.style.overflow=''; if(supabase && state.chatChannel){void supabase.removeChannel(state.chatChannel);state.chatChannel=null;} }
function renderUnauthed(message) {
  const root=getRoot(); root.classList.add('hgd-open');
  $('#hgd-content',root).innerHTML = `${alertMarkup(message,'warn')}<div class="hgd-card"><h3>ورود به هم‌قدم</h3><p class="hgd-muted">این بخش به حساب کاربری و سرور نیاز دارد و اطلاعات نمایشی جعلی نشان نمی‌دهد.</p><a class="hgd-button primary" href="./index.html">بازگشت به صفحهٔ ورود</a></div>`;
}

async function setTab(tab) {
  if (!TAB_ITEMS.some((x)=>x[0]===tab)) tab='themes'; state.tab=tab;
  const root=getRoot(); $$('.hgd-tab',root).forEach((el)=>el.classList.toggle('active',el.dataset.hgdTab===tab));
  const content=$('#hgd-content',root); content.innerHTML='<div class="hgd-empty">در حال دریافت اطلاعات از سرور…</div>';
  if (!state.user) { renderUnauthed('ابتدا وارد حساب شو.'); return; }
  const featureKey = ({themes:'special_themes',debates:'debates',groups:'groups',study:'personal_books',flashcards:'quizzes',quizzes:'quizzes',announcements:'announcements'})[tab];
  if (tab==='chats' && !featureEnabled('community_chat') && !featureEnabled('private_chat')) { content.innerHTML=alertMarkup('هم چت خصوصی و هم گروه/کانال از طرف مدیریت غیرفعال شده‌اند.','warn')+empty('پیام‌رسان غیرفعال است','داده‌ها حذف نشده‌اند و پس از فعال‌سازی دوباره در دسترس خواهند بود.'); return; }
  if (featureKey && !featureEnabled(featureKey)) { content.innerHTML=alertMarkup('این بخش فعلاً از طرف مدیریت غیرفعال شده است.','warn')+empty('قابلیت غیرفعال است','داده‌ها حذف نشده‌اند و پس از فعال‌سازی دوباره در دسترس خواهند بود.'); return; }
  try {
    if (tab==='themes') await renderThemes(content);
    else if (tab==='debates') await renderDebates(content);
    else if (tab==='groups') await renderDiscussionGroups(content);
    else if (tab==='chats') await renderChats(content);
    else if (tab==='study') await renderStudyDesk(content);
    else if (tab==='flashcards') await renderFlashcards(content);
    else if (tab==='quizzes') await renderQuizzes(content);
    else if (tab==='announcements') await renderAnnouncements(content);
    else if (tab==='settings') await renderSettings(content);
  } catch (e) { content.innerHTML=alertMarkup(errText(e),'error')+empty('بارگذاری این بخش انجام نشد','بعد از بررسی اتصال و مجوزها دوباره تلاش کن.')+button('تلاش مجدد','reload-tab'); }
}

async function renderThemes(root) {
  if (!state.prefs) {
    const {data,error}=await supabase.from('user_preferences').select('*').eq('user_id',state.user.id).maybeSingle(); if(error)throw error; state.prefs=data||null;
  }
  const {data:occasions,error}=await supabase.from('occasion_themes').select('id,title,occasion_type,description,starts_at,ends_at,timezone,accent_color,background_color,glow_enabled,sound_key,enabled,priority').eq('enabled',true).order('priority',{ascending:false}).limit(20);
  if(error)throw error; state.occasions=occasions||[];state.activeOccasion=state.prefs?.disable_occasion_themes?null:selectActiveOccasion(state.occasions);
  root.innerHTML=`<div class="hgd-heading"><div><h3>تم، مناسبت و دسترس‌پذیری</h3><p>تم شهادت و ولادت فقط در زمان تعریف‌شده فعال می‌شود؛ صدا هرگز خودکار پخش نمی‌شود.</p></div><span class="hgd-chip">همگام با حساب</span></div>
    ${state.activeOccasion?`<div class="hgd-occasion-banner" style="--hgd-accent:${escapeHtml(state.activeOccasion.accent_color)};--hgd-occasion-bg:${escapeHtml(state.activeOccasion.background_color)}"><h3>${state.activeOccasion.occasion_type==='birth'?'🌙 تم ولادت':state.activeOccasion.occasion_type==='martyrdom'?'🕯 تم شهادت':'✦ تم مناسبتی'}: ${escapeHtml(state.activeOccasion.title)}</h3><p>${escapeHtml(state.activeOccasion.description||'این تم در بازهٔ زمانی تعیین‌شده فعال شده است.')}</p>${state.prefs?.sound_enabled&&state.activeOccasion.sound_key&&state.activeOccasion.sound_key!=='none'?button('پخش نمونهٔ صوتی','preview-occasion-sound',`data-sound="${escapeHtml(state.activeOccasion.sound_key)}"`,'soft'):''}</div><div style="height:10px"></div>`:alertMarkup('در حال حاضر مناسبت فعالی برای این حساب تنظیم نشده است. تاریخ‌های دقیق را مدیر برنامه در پنل مدیریت ثبت می‌کند.','warn')}
    <div class="hgd-grid two"><section class="hgd-card"><h4>ظاهر برنامه</h4><form class="hgd-form" data-hgd-form="save-preferences">
      <div class="hgd-field"><label for="hgd-color_mode">حالت رنگ</label><select name="color_mode" id="hgd-color_mode"><option value="system" ${state.prefs?.color_mode==='system'?'selected':''}>مطابق دستگاه</option><option value="light" ${state.prefs?.color_mode==='light'?'selected':''}>روشن</option><option value="dark" ${state.prefs?.color_mode==='dark'?'selected':''}>تیره</option></select></div>
      <label class="hgd-option"><input type="checkbox" name="disable_occasion_themes" ${state.prefs?.disable_occasion_themes?'checked':''}> تم مناسبتی را فقط برای این حساب پنهان کن</label>
      <label class="hgd-option"><input type="checkbox" name="reduce_motion" ${state.prefs?.reduce_motion?'checked':''}> کاهش حرکت و افکت‌های دیداری</label>
      <label class="hgd-option"><input type="checkbox" name="sound_enabled" ${state.prefs?.sound_enabled?'checked':''}> اجازهٔ صدای اختیاری (بدون پخش خودکار)</label>
      <div class="hgd-field"><label for="hgd-font_scale">اندازهٔ متن</label><select name="font_scale" id="hgd-font_scale"><option value="0.9" ${Number(state.prefs?.font_scale)===0.9?'selected':''}>کوچک‌تر</option><option value="1" ${!state.prefs||Number(state.prefs.font_scale)===1?'selected':''}>معمولی</option><option value="1.1" ${Number(state.prefs?.font_scale)===1.1?'selected':''}>بزرگ‌تر</option><option value="1.2" ${Number(state.prefs?.font_scale)===1.2?'selected':''}>خیلی بزرگ</option></select></div>
      <button class="hgd-button primary" type="submit">ذخیره روی سرور</button></form></section>
      <section class="hgd-card"><h4>تم‌های تعریف‌شده</h4><p class="hgd-muted">برنامه تم‌ها را بر اساس بازهٔ تاریخ ثبت‌شده فعال می‌کند. تاریخ قمریِ مناسبت‌ها باید هر سال از سوی مدیر با تقویم معتبر بررسی و ثبت شود.</p><div class="hgd-list">${state.occasions.length?state.occasions.map(o=>`<article class="hgd-item"><div class="hgd-item-main"><h4>${escapeHtml(o.title)}</h4><p>${escapeHtml(o.description||'')}</p><div class="hgd-item-foot"><span class="hgd-chip ${o.occasion_type==='martyrdom'?'danger':o.occasion_type==='birth'?'':'warn'}">${o.occasion_type==='birth'?'ولادت':o.occasion_type==='martyrdom'?'شهادت':'مناسبت'}</span><span class="hgd-small">${faDate(o.starts_at)} تا ${faDate(o.ends_at)}</span></div></div></article>`).join(''):empty('تم مناسبت فعالی نیست')}</div></section></div>`;
}

async function renderDebates(root) {
  const {data,error}=await supabase.from('debate_topics').select('id,title,question,category,state,is_pinned,created_by,created_at,updated_at').neq('state','hidden').order('is_pinned',{ascending:false}).order('updated_at',{ascending:false}).limit(60);
  if(error)throw error;state.topics=data||[];
  if(!state.topicId || !state.topics.some(t=>t.id===state.topicId)) state.topicId=state.topics[0]?.id||null;
  if(state.topicId){const p=await supabase.from('debate_posts').select('id,topic_id,author_id,argument_type,body,reply_to,source_title,source_url,edited_at,created_at').eq('topic_id',state.topicId).order('created_at',{ascending:true}).limit(150);if(p.error)throw p.error;state.posts=p.data||[];}else state.posts=[];
  const t=state.topics.find(x=>x.id===state.topicId);
  root.innerHTML=`<div class="hgd-heading"><div><h3>مباحثهٔ مستند و محترمانه</h3><p>هر موضوع، استدلال موافق و مخالف، پرسش، پاسخ و ارجاع به منبع جداگانه دارد.</p></div>${button('ساخت موضوع تازه','debate-create-mode','','primary')}</div>
    <div class="hgd-grid two"><section class="hgd-card"><h4>موضوعات مباحثه</h4><div class="hgd-list">${state.topics.length?state.topics.map(x=>`<button type="button" class="hgd-item" data-hgd-action="select-topic" data-id="${escapeHtml(x.id)}" style="text-align:right;cursor:pointer;border-color:${x.id===state.topicId?'#7ac4a8':'#e3ece5'};background:${x.id===state.topicId?'#eef9f1':'#fff'}"><span class="hgd-item-main"><h4>${x.is_pinned?'📌 ':''}${escapeHtml(x.title)}</h4><p>${escapeHtml(x.question.slice(0,190))}${x.question.length>190?'…':''}</p><span class="hgd-chip">${escapeHtml(x.category)}</span> <span class="hgd-chip ${x.state==='open'?'':'warn'}">${x.state==='open'?'باز':x.state==='concluded'?'جمع‌بندی':'بایگانی'}</span></span></button>`).join(''):empty('هنوز موضوعی ثبت نشده است','اولین موضوع علمی را با یک پرسش روشن آغاز کن.')}</div>
    <form class="hgd-form" data-hgd-form="create-debate" id="hgd-debate-create-form" hidden style="margin-top:12px">${field('عنوان موضوع','title','text','','required maxlength="180"') }<div class="hgd-field"><label for="hgd-question">پرسش یا گزارهٔ اصلی</label><textarea id="hgd-question" name="question" required maxlength="4000"></textarea></div>${field('دسته','category','text','عمومی','maxlength="80"')}<button type="submit" class="hgd-button primary">ثبت موضوع</button></form></section>
    <section class="hgd-card"><h4>${t?escapeHtml(t.title):'یک موضوع را انتخاب کن'}</h4>${t?`<p class="hgd-muted">${escapeHtml(t.question)}</p><div class="hgd-pills"><span class="hgd-chip">${escapeHtml(t.category)}</span><span class="hgd-small">ایجاد ${faDate(t.created_at)}</span></div><div class="hgd-thread" id="hgd-debate-thread">${state.posts.length?state.posts.map(p=>`<article class="hgd-message ${p.author_id===state.user.id?'mine':''}"><div class="meta"><b>${p.author_id===state.user.id?'شما':'عضو هم‌قدم'}</b><span>${HGD_ARGUMENT_TYPES.find(x=>x[0]===p.argument_type)?.[1]||'استدلال'}</span><time>${timeOnly(p.created_at)}</time></div><div class="body">${escapeHtml(p.body)}</div>${p.source_title?`<div class="hgd-small">منبع: ${escapeHtml(p.source_title)} ${p.source_url?`· <a href="${escapeHtml(p.source_url)}" target="_blank" rel="noopener noreferrer">بازکردن پیوند</a>`:''}</div>`:''}<div class="hgd-item-foot">${button('گزارش','report-item',`data-target-type="debate_post" data-target-id="${escapeHtml(p.id)}"`,'danger')}</div></article>`).join(''):empty('هنوز پاسخی ثبت نشده است','استدلال را مستند و بدون حملهٔ شخصی بنویس.')}</div>${t.state==='open'?`<form class="hgd-form" data-hgd-form="create-debate-post"><div class="hgd-field"><label for="hgd-argument-type">نوع مشارکت</label><select name="argument_type" id="hgd-argument-type">${HGD_ARGUMENT_TYPES.map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}</select></div><div class="hgd-field"><label for="hgd-post-body">متن مشارکت</label><textarea id="hgd-post-body" name="body" rows="4" required maxlength="5000" placeholder="دلیل، شاهد یا پرسش را بنویس…"></textarea></div>${field('عنوان منبع (اختیاری)','source_title','text','','maxlength="240"')}<div class="hgd-field"><label for="hgd-source_url">پیوند منبع HTTPS (اختیاری)</label><input id="hgd-source_url" name="source_url" type="url" maxlength="1200" placeholder="https://…"></div><button type="submit" class="hgd-button primary">ارسال مشارکت</button></form>`:alertMarkup('این موضوع دیگر باز نیست.','warn')}`:empty('موضوعی انتخاب نشده است') }</section></div>`;
}

async function renderDiscussionGroups(root) {
  const [{data:groups,error:gError},{data:members,error:mError}] = await Promise.all([
    supabase.from('discussion_groups').select('id,title,topic,created_by,max_members,is_open,created_at').eq('is_open',true).order('created_at',{ascending:false}).limit(50),
    supabase.from('discussion_group_members').select('group_id,user_id,member_role,joined_at').eq('user_id',state.user.id),
  ]);
  if(gError)throw gError;if(mError)throw mError;
  const my=new Map((members||[]).map(m=>[m.group_id,m]));
  root.innerHTML=`<div class="hgd-heading"><div><h3>گروه سه‌نفرهٔ مباحثه</h3><p>عضویت سه‌نفره در سرور و به‌صورت اتمیک کنترل می‌شود؛ «مسئول بحث» را مالک گروه از میان اعضا تعیین می‌کند.</p></div></div>
    <div class="hgd-grid two"><section class="hgd-card"><h4>ساخت گروه</h4><form class="hgd-form" data-hgd-form="create-discussion-group">${field('نام گروه','title','text','','required maxlength="100"')}${field('موضوع مورد بحث','topic','text','','maxlength="600"')}<button type="submit" class="hgd-button primary">ساخت گروه</button></form><div class="hgd-alert">هر گروه حداکثر سه عضو دارد. اگر ظرفیت پر شود، سرور درخواست عضو چهارم را رد می‌کند.</div></section><section class="hgd-card"><h4>گروه‌های قابل پیوستن</h4><div class="hgd-list">${groups?.length?groups.map(g=>{const m=my.get(g.id);return `<article class="hgd-item"><div class="hgd-item-main"><h4>${escapeHtml(g.title)}</h4><p>${escapeHtml(g.topic||'بدون توضیح')}</p><div class="hgd-item-foot"><span class="hgd-chip">ظرفیت ${fmtNum(g.max_members)} نفر</span>${m?`<span class="hgd-chip">${m.member_role==='discussion_leader'?'مسئول بحث':m.member_role==='owner'?'مالک':'عضو'}</span>`:button('پیوستن','join-discussion-group',`data-id="${escapeHtml(g.id)}"`,'soft')}</div></div>${m&&g.created_by===state.user.id?button('تنظیم مسئول','manage-discussion-leader',`data-id="${escapeHtml(g.id)}"`):''}</article>`}).join(''):empty('گروه فعالی نیست','می‌توانی اولین گروه سه‌نفره را ایجاد کنی.')}</div></section></div>`;
}

async function loadChatList() {
  let {data,error}=await supabase.from('chat_conversations').select('id,kind,visibility,title,description,cover_path,created_by,is_active,slow_mode_seconds,created_at,last_message_at').eq('is_active',true).order('last_message_at',{ascending:false}).limit(100);
  if(error && /cover_path|schema cache|does not exist/i.test(error.message||'')) { const fallback=await supabase.from('chat_conversations').select('id,kind,visibility,title,description,created_by,is_active,slow_mode_seconds,created_at,last_message_at').eq('is_active',true).order('last_message_at',{ascending:false}).limit(100);data=fallback.data?.map(c=>({...c,cover_path:null}));error=fallback.error; }
  if(error)throw error;
  const mine=await supabase.from('chat_members').select('conversation_id,user_id,member_role,last_read_at,muted_until').eq('user_id',state.user.id);
  if(mine.error)throw mine.error;
  const membershipMap=new Map((mine.data||[]).map(x=>[x.conversation_id,x]));
  state.chats=(data||[]).filter(c=>membershipMap.has(c.id)||(c.kind==='channel'&&c.visibility==='public')).map(c=>({...c,membership:membershipMap.get(c.id)||null}));
  const directIds=state.chats.filter(c=>c.kind==='direct').map(c=>c.id);
  if(directIds.length){const peers=await supabase.rpc('hgd_direct_chat_peers',{p_conversation_ids:directIds});if(peers.error&&!/function .* does not exist|schema cache/i.test(peers.error.message||''))throw peers.error;const names=new Map((peers.data||[]).map(x=>[x.conversation_id,x.display_name]));state.chats=state.chats.map(c=>c.kind==='direct'?{...c,title:names.get(c.id)||c.title||'گفت‌وگوی خصوصی'}:c);}
}
async function renderChats(root) {
  await loadChatList();
  if(state.chatId&&!state.chats.some(c=>c.id===state.chatId)) state.chatId=null;
  const current=state.chats.find(c=>c.id===state.chatId)||null;
  if(current) await loadChatMessages(current.id);
  const allowPrivate=featureEnabled('private_chat');
  const allowCommunity=featureEnabled('community_chat');
  const canSend=Boolean(current && (current.kind!=='channel' || ['owner','admin','moderator'].includes(current.membership?.member_role)));
  const directCreate=allowPrivate?`<h4>گفت‌وگوی خصوصی</h4><form class="hgd-form" data-hgd-form="search-chat-users">${field('نام نمایشی کاربر را جست‌وجو کن','query','search','','required minlength="2" maxlength="60" placeholder="حداقل دو حرف"')}<button type="submit" class="hgd-button">جست‌وجوی کاربران</button></form><div class="hgd-list">${state.chatUserResults.length?state.chatUserResults.map(u=>`<article class="hgd-item"><div class="hgd-item-main"><b>${escapeHtml(u.display_name||'کاربر هم‌قدم')}</b></div>${button('شروع گفتگو','start-direct-chat',`data-id="${escapeHtml(u.id)}"`,'soft')}</article>`).join(''):empty('کاربری پیدا نشده','نام نمایشی را جست‌وجو کن.')}</div>`:`<div class="hgd-alert">ساخت چت خصوصی فعلاً از طرف مدیریت غیرفعال شده است.</div>`;
  const communityCreate=allowCommunity?`${button('＋ ساخت گروه یا کانال','chat-create-toggle','','primary')}`:'';
  const communityOptions=allowCommunity?`<div class="hgd-line"></div><h4>عضویت با لینک دعوت</h4><form class="hgd-inline-form" data-hgd-form="join-chat-invite"><div class="hgd-field"><label for="hgd-invite-code">کد دعوت</label><input id="hgd-invite-code" name="invite_code" required minlength="20" maxlength="64" pattern="[a-f0-9]+"></div><button type="submit" class="hgd-button">پیوستن</button></form><div id="hgd-chat-create" hidden><div class="hgd-line"></div><h4>ایجاد گروه یا کانال</h4><form class="hgd-form" data-hgd-form="create-chat">${field('نام گروه یا کانال','title','text','','required maxlength="120"')}<div class="hgd-field"><label for="hgd-kind">نوع</label><select name="kind" id="hgd-kind"><option value="group">گروه خصوصی</option>\${isAdmin()?'<option value="channel">کانال</option>':''}</select></div><div class="hgd-field"><label for="hgd-visibility">دسترسی</label><select name="visibility" id="hgd-visibility"><option value="private">خصوصی با دعوت</option>\${isAdmin()?'<option value="public">کانال عمومی</option>':''}</select></div><div class="hgd-field"><label for="hgd-description">توضیح</label><textarea id="hgd-description" name="description" maxlength="1200"></textarea></div><div class="hgd-field"><label for="hgd-chat-cover">تصویر گروه یا کانال (PNG، JPG یا WebP، حداکثر ۵ MiB)</label><input id="hgd-chat-cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp"></div><button type="submit" class="hgd-button primary">ساخت</button></form></div>`:'';
  const messageComposer=canSend?`<form class="hgd-form" data-hgd-form="send-chat-message"><div class="hgd-field"><label for="hgd-chat-body">متن پیام</label><textarea id="hgd-chat-body" name="body" rows="3" required maxlength="5000" placeholder="پیامت را بنویس…"></textarea></div><div class="hgd-row"><button type="submit" class="hgd-button primary">ارسال</button>${button('دعوت عضو','create-chat-invite','','soft')}${button('تازه‌سازی','reload-chats')}</div></form>
  <details class="hgd-poll-create"><summary>ساخت نظرسنجی</summary><form class="hgd-form" data-hgd-form="create-chat-poll"><div class="hgd-field"><label>پرسش نظرسنجی</label><input name="question" required maxlength="240"></div><div class="hgd-field"><label>گزینه‌ها (هر گزینه در یک خط؛ ۲ تا ۱۰ گزینه)</label><textarea name="options" required maxlength="1600" rows="4"></textarea></div><label class="hgd-option"><input type="checkbox" name="multiple_choice"> امکان انتخاب چند گزینه</label><button class="hgd-button" type="submit">ساخت نظرسنجی</button></form></details>
  <form class="hgd-form hgd-attachment-form" data-hgd-form="upload-chat-attachment"><div class="hgd-field"><label for="hgd-chat-file">پیوست تا ۵۰ MiB</label><input id="hgd-chat-file" name="file" type="file" required accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.7z,.mp3,.mp4"></div><div class="hgd-small">فایل‌ها خصوصی می‌مانند و لینک دانلود موقت دارند.</div><button type="submit" class="hgd-button">بارگذاری پیوست</button></form>`:'';
  root.innerHTML=`<div class="hgd-heading"><div><h3>پیام‌رسان هم‌قدم</h3><p>گفت‌وگوی خصوصی، گروه، کانال، پاسخ، واکنش، ویرایش، فوروارد، گزارش، پیوست و نظرسنجی؛ با محدودیت‌های سمت سرور.</p></div>${communityCreate}</div>
  <div class="hgd-grid two"><section class="hgd-card">${directCreate}${communityOptions}
  <div class="hgd-line"></div><h4>همهٔ گفتگوهای من</h4><p class="hgd-muted">گفت‌وگوی خصوصی، گروه یا کانالی که عضو آن هستی همین‌جا نمایش داده می‌شود.</p><div class="hgd-list">${state.chats.length?state.chats.map(c=>{const cover=c.cover_path?supabase.storage.from('hamghadam-conversation-covers').getPublicUrl(c.cover_path).data.publicUrl:'';return `<button class="hgd-item" type="button" data-hgd-action="select-chat" data-id="${escapeHtml(c.id)}" style="text-align:right;cursor:pointer;background:${c.id===state.chatId?'#eef9f1':'#fff'}">${cover?`<img src="${escapeHtml(cover)}" alt="" width="48" height="48" style="object-fit:cover;border-radius:12px">`:''}<span class="hgd-item-main"><h4>${c.kind==='direct'?'☏ ':c.kind==='group'?'◉ ':'▤ '}${escapeHtml(c.title|| (c.kind==='direct'?'گفت‌وگوی خصوصی':c.kind==='group'?'گروه':'کانال'))}</h4><p>${escapeHtml(c.description||'بدون توضیح')}</p><div class="hgd-item-foot"><span class="hgd-chip">${c.kind==='direct'?'خصوصی':c.kind==='group'?'گروه':c.visibility==='public'?'کانال عمومی':'کانال خصوصی'}</span><span class="hgd-small">${faDate(c.last_message_at)}</span></div></span></button>`}).join(''):empty('گفت‌وگویی در دسترس نیست','یک گفت‌وگوی خصوصی، گروه یا کانال بساز تا شروع کنیم.')}</div></section>
  <section class="hgd-card"><h4>${current?escapeHtml(current.title||'گفت‌وگو'):'گفت‌وگوی انتخاب‌شده'}</h4>${current?`${current.cover_path?`<img src="${escapeHtml(supabase.storage.from('hamghadam-conversation-covers').getPublicUrl(current.cover_path).data.publicUrl)}" alt="تصویر ${escapeHtml(current.title||'گفت‌وگو')}" width="64" height="64" style="object-fit:cover;border-radius:16px">`:''}<div class="hgd-pills"><span class="hgd-chip">${current.kind==='direct'?'خصوصی':current.kind==='group'?'گروه':'کانال'}</span><span class="hgd-chip">${current.visibility==='public'?'عمومی':'خصوصی'}</span>${current.membership?.member_role?`<span class="hgd-chip">${escapeHtml(current.membership.member_role)}</span>`:''}</div><div class="hgd-thread" id="hgd-chat-thread">${renderMessageList(state.messages)}</div>${current.kind==='channel'&&!canSend?alertMarkup('این کانال فقط‌خواندنی است؛ فقط مالک یا مدیر کانال می‌تواند پیام و نظرسنجی منتشر کند.','warn'):''}${state.replyId?`<div class="hgd-alert">پاسخ به پیام انتخاب‌شده فعال است. ${button('لغو پاسخ','clear-reply')}</div>`:''}${messageComposer}`:empty('برای دیدن پیام‌ها، یک گفتگو را انتخاب کن')}</section></div>`;
  if(current) subscribeChat(current.id);
}
function renderMessageList(messages) {
  if(!messages?.length)return empty('هنوز پیامی نیست','با احترام و بدون ارسال اطلاعات خصوصی گفت‌وگو کنید.');
  return messages.map(m=>`<article class="hgd-message ${m.sender_id===state.user.id?'mine':''}"><div class="meta"><b>${m.sender_id===state.user.id?'شما':'عضو هم‌قدم'}</b><time>${timeOnly(m.created_at)}</time>${m.edited_at?'<span>ویرایش‌شده</span>':''}${m.pinned_at?'<span class="hgd-chip warn">سنجاق‌شده</span>':''}</div><div class="body">${escapeHtml(m.deleted_at?'این پیام حذف شده است.':m.body)}</div>${m.poll?`<div class="hgd-poll-card"><b>📊 ${escapeHtml(m.poll.question)}</b>${m.poll.multiple_choice?'<small>چندگزینه‌ای</small>':''}<div class="hgd-poll-options">${m.poll.options.map(o=>`<button type="button" class="hgd-poll-option" data-hgd-action="vote-chat-poll" data-poll-id="${escapeHtml(m.poll.id)}" data-option-id="${escapeHtml(o.id)}" ${m.poll.hasVoted?'disabled':''}><span>${escapeHtml(o.option_text)}</span><small>${fmtNum(o.votes)} رأی</small></button>`).join('')}</div><small>${m.poll.ends_at?`پایان: ${faDate(m.poll.ends_at)}`:'بدون مهلت پایان'} · ${m.poll.hasVoted?'رأی ثبت شده':'برای رأی دادن یک گزینه را انتخاب کن'}</small></div>`:''}${m.attachment?`<div class="hgd-attachment">📎 ${escapeHtml(m.attachment.file_name)} · ${fmtNum(Math.ceil(m.attachment.size_bytes/1048576))} MiB ${button('دریافت پیوست','open-chat-attachment',`data-path="${escapeHtml(m.attachment.object_path)}"`,'soft')}</div>`:''}${m.reply_to?'<small class="hgd-muted">در پاسخ به پیام دیگر</small>':''}<div class="hgd-item-foot">${button('پاسخ','reply-chat-message',`data-id="${escapeHtml(m.id)}"`)}${button('🙏','react-chat-message',`data-id="${escapeHtml(m.id)}" data-emoji="🙏"`)}${button('گزارش','report-item',`data-target-type="chat_message" data-target-id="${escapeHtml(m.id)}"`,'danger')}${m.sender_id===state.user.id&&!m.deleted_at?button('ویرایش','edit-chat-message',`data-id="${escapeHtml(m.id)}"`,'soft'):''}${button('فوروارد','forward-chat-message',`data-id="${escapeHtml(m.id)}"`)}${m.sender_id===state.user.id&&!m.deleted_at?button('حذف','delete-chat-message',`data-id="${escapeHtml(m.id)}"`,'danger'):''}${currentCanManage(m)?button(m.pinned_at?'برداشتن سنجاق':'سنجاق','pin-chat-message',`data-id="${escapeHtml(m.id)}" data-pin="${m.pinned_at?'false':'true'}"`,'soft'):''}</div></article>`).join('');
}
function currentCanManage(message) { const chat=state.chats.find(c=>c.id===state.chatId);return isManager()||['owner','admin','moderator'].includes(chat?.membership?.member_role); }
async function loadChatMessages(id) {
  const {data,error}=await supabase.from('chat_messages').select('id,conversation_id,sender_id,body,reply_to,forwarded_from,pinned_at,pinned_by,edited_at,deleted_at,created_at').eq('conversation_id',id).order('created_at',{ascending:true}).limit(100);
  if(error)throw error;state.messages=data||[];
  const {data: attachments, error: attachError}=await supabase.from('chat_attachments').select('message_id,file_name,mime_type,size_bytes,bucket_id,object_path').eq('conversation_id',id).limit(100);
  if(attachError && !/does not exist|schema cache/i.test(attachError.message||'')) throw attachError;
  const byMessage=new Map((attachments||[]).map(a=>[a.message_id,a]));
  const {data: polls, error: pollError}=await supabase.from('chat_polls').select('id,message_id,conversation_id,question,multiple_choice,ends_at').eq('conversation_id',id).limit(100);
  if(pollError && !/does not exist|schema cache/i.test(pollError.message||'')) throw pollError;
  const byPollMessage=new Map();
  for(const poll of polls||[]){const {data:opts,error:optsError}=await supabase.from('chat_poll_options').select('id,option_text,position').eq('poll_id',poll.id).order('position');if(optsError)throw optsError;const {data:votes,error:votesError}=await supabase.from('chat_poll_votes').select('option_id,user_id').eq('poll_id',poll.id);if(votesError)throw votesError;byPollMessage.set(poll.message_id,{...poll,options:(opts||[]).map(o=>({...o,votes:(votes||[]).filter(v=>v.option_id===o.id).length,voted:(votes||[]).some(v=>v.option_id===o.id&&v.user_id===state.user.id)})),hasVoted:(votes||[]).some(v=>v.user_id===state.user.id)});}
  state.messages=state.messages.map(m=>({...m,attachment:byMessage.get(m.id)||null,poll:byPollMessage.get(m.id)||null}));
  const member=state.chats.find(c=>c.id===id)?.membership;
  if(member) {const {error:updateError}=await supabase.from('chat_members').update({last_read_at:new Date().toISOString()}).eq('conversation_id',id).eq('user_id',state.user.id);if(updateError)console.warn('Could not update read marker:',updateError.message);}
}
async function subscribeChat(id) {
  if(!supabase||!state.user)return;
  if(state.chatChannel) {try{await supabase.removeChannel(state.chatChannel);}catch{} state.chatChannel=null;}
  state.chatChannel=supabase.channel(`hgd-chat-${id}-${state.user.id}`).on('postgres_changes',{event:'*',schema:'public',table:'chat_messages',filter:`conversation_id=eq.${id}`},async()=>{if(state.chatId!==id)return;try{await loadChatMessages(id);const area=$('#hgd-chat-thread');if(area){area.innerHTML=renderMessageList(state.messages);area.scrollTop=area.scrollHeight;}}catch(e){console.warn('Chat refresh failed:',e.message);}}).subscribe();
}

async function renderStudyDesk(root) {
  const [{data:book,error:bError},{data:notes,error:nError}] = await Promise.all([
    supabase.from('personal_books').select('*').eq('user_id',state.user.id).maybeSingle(),
    supabase.from('study_notes').select('id,title,body,reference,updated_at').eq('user_id',state.user.id).order('updated_at',{ascending:false}).limit(30),
  ]);
  if(bError)throw bError;if(nError)throw nError;state.book=book||null;state.notes=notes||[];
  root.innerHTML=`<div class="hgd-heading"><div><h3>میز مطالعهٔ شخصی</h3><p>یک کتاب فعال برای هر حساب، سقف فنی ۱۰۰ MiB؛ یادداشت و پیشرفت فقط برای خودت قابل مشاهده است.</p></div><span class="hgd-chip">خصوصی</span></div>
  <div class="hgd-grid two"><section class="hgd-card"><h4>کتاب شخصی</h4>${state.book?`<div class="hgd-item"><div class="hgd-item-main"><h4>${escapeHtml(state.book.title)}</h4><p>${escapeHtml(state.book.description||state.book.file_name)}</p><div class="hgd-item-foot"><span class="hgd-chip">${fmtNum(Math.ceil(state.book.size_bytes/(1024*1024)))} MiB</span><span class="hgd-small">آخرین تغییر: ${faDate(state.book.updated_at)}</span></div></div>${button('بازکردن','open-personal-book','','primary')}${button('حذف کتاب','delete-personal-book','','danger')}</div>`:empty('کتابی بارگذاری نشده است','PDF یا فایل متنی مجاز خودت را بارگذاری کن.')}
  <form class="hgd-form" data-hgd-form="upload-personal-book" style="margin-top:12px"><div class="hgd-field"><label for="hgd-book-file">فایل کتاب (حداکثر ۱۰۰ MiB)</label><input id="hgd-book-file" name="file" type="file" accept="application/pdf,text/plain,application/epub+zip,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required></div>${field('عنوان','title','text',state.book?.title||'','required maxlength="200"')}<div class="hgd-field"><label for="hgd-book-description">توضیح</label><textarea id="hgd-book-description" name="description" maxlength="2000">${escapeHtml(state.book?.description||'')}</textarea></div><button type="submit" class="hgd-button primary">${state.book?'جایگزینی کتاب فعال':'بارگذاری کتاب'}</button></form><p class="hgd-small">لینک اشتراک عمومی در این نسخه فعال نیست؛ کتاب به فضای خصوصی سرور می‌رود و برای کاربر غیرمجاز قابل دسترسی نیست.</p></section>
  <section class="hgd-card"><h4>یادداشت‌های درس</h4><form class="hgd-form" data-hgd-form="create-study-note">${field('عنوان یادداشت','note_title','text','','required maxlength="200"')}<div class="hgd-field"><label for="hgd-note-body">متن یادداشت</label><textarea id="hgd-note-body" name="body" required maxlength="30000"></textarea></div>${field('ارجاع کتاب/صفحه','reference','text','','maxlength="500"')}<button type="submit" class="hgd-button primary">ثبت یادداشت روی سرور</button></form><div class="hgd-list" style="margin-top:12px">${state.notes.length?state.notes.map(n=>`<article class="hgd-item"><div class="hgd-item-main"><h4>${escapeHtml(n.title)}</h4><p>${escapeHtml(n.body.slice(0,400))}${n.body.length>400?'…':''}</p><div class="hgd-item-foot"><span class="hgd-small">${escapeHtml(n.reference||'بدون ارجاع')} · ${faDate(n.updated_at)}</span></div></div>${button('حذف','delete-study-note',`data-id="${escapeHtml(n.id)}"`,'danger')}</article>`).join(''):empty('یادداشتی نیست')}</div></section></div>`;
}

async function renderFlashcards(root) {
  const {data,error}=await supabase.from('flashcards').select('*').eq('user_id',state.user.id).order('due_at',{ascending:true}).limit(100);
  if(error)throw error;state.flashcards=data||[];
  const due=state.flashcards.filter(c=>new Date(c.due_at)<=new Date());
  root.innerHTML=`<div class="hgd-heading"><div><h3>فلش‌کارت و مرور فاصله‌دار</h3><p>زمان مرور بعدی بر اساس کیفیت پاسخ محاسبه و روی سرور ذخیره می‌شود.</p></div><span class="hgd-chip">موعد مرور: ${fmtNum(due.length)}</span></div>
  <section class="hgd-card"><h4>افزودن فلش‌کارت</h4><form class="hgd-grid two" data-hgd-form="create-flashcard">${field('روی کارت','front','text','','required maxlength="2000"')}${field('پشت کارت','back','text','','required maxlength="4000"')}${field('دسته','deck','text','صرف و نحو','maxlength="120"')}${field('منبع','source_reference','text','','maxlength="500"')}<div class="hgd-row"><button class="hgd-button primary" type="submit">ذخیره</button></div></form></section>
  <div style="height:12px"></div><div class="hgd-list">${state.flashcards.length?state.flashcards.map(c=>`<article class="hgd-item"><div class="hgd-item-main"><h4>${escapeHtml(c.front)}</h4><p>${escapeHtml(c.back)}</p><div class="hgd-item-foot"><span class="hgd-chip">${escapeHtml(c.deck)}</span><span class="hgd-small">مرور بعدی: ${faDate(c.due_at)}</span></div><div class="hgd-row" style="margin-top:7px">${[0,2,3,4,5].map(q=>button(({0:'فراموش کردم',2:'سخت',3:'نسبتاً سخت',4:'خوب',5:'آسان'})[q],'review-flashcard',`data-id="${escapeHtml(c.id)}" data-quality="${q}"`,q<3?'danger':q===3?'':'soft')).join('')}</div></div>${button('حذف','delete-flashcard',`data-id="${escapeHtml(c.id)}"`,'danger')}</article>`).join(''):empty('هنوز فلش‌کارتی نساختی','یک نکتهٔ صرف یا نحو را به صورت پرسش و پاسخ ذخیره کن.')}</div>`;
}

async function renderQuizzes(root) {
  const {data,error}=await supabase.from('hamghadam_quizzes').select('id,slug,title,description,category,difficulty,status,starts_at,ends_at,created_at').eq('status','published').order('created_at',{ascending:false}).limit(60);
  if(error)throw error;state.quizzes=data||[];
  root.innerHTML=`<div class="hgd-heading"><div><h3>آزمون و مسابقه</h3><p>گزینهٔ درست در جدول قابل خواندن مستقیم نیست؛ پاسخ و امتیاز از تابع سمت سرور ثبت می‌شود.</p></div></div>${state.quizzes.length?`<div class="hgd-grid two">${state.quizzes.map(q=>`<article class="hgd-card"><h4>${escapeHtml(q.title)}</h4><p class="hgd-muted">${escapeHtml(q.description||'')}</p><div class="hgd-item-foot"><span class="hgd-chip">${escapeHtml(q.category)}</span><span class="hgd-chip ${q.difficulty==='hard'?'danger':q.difficulty==='easy'?'':'warn'}">${q.difficulty==='easy'?'آسان':q.difficulty==='hard'?'سخت':'متوسط'}</span></div><div class="hgd-row" style="margin-top:11px">${button('شروع آزمون','start-quiz',`data-id="${escapeHtml(q.id)}"`,'primary')}</div></article>`).join('')}</div>`:empty('آزمون منتشرشده‌ای نیست','مدیر باید آزمون و سؤال‌ها را در پنل مدیریت بسازد و منتشر کند.')}`;
}
async function renderAnnouncements(root) {
  const {data,error}=await supabase.from('app_announcements').select('id,title,body,audience,starts_at,ends_at,created_at').eq('is_published',true).lte('starts_at',new Date().toISOString()).order('starts_at',{ascending:false}).limit(30);
  if(error)throw error;
  const {data:notifications,error:nError}=await supabase.from('in_app_notifications').select('id,title,body,kind,accent_color,icon,action_url,read_at,created_at').eq('user_id',state.user.id).order('created_at',{ascending:false}).limit(50);if(nError)throw nError;
  const kindLabel={info:'اطلاع‌رسانی',success:'موفقیت',warning:'توجه',support:'پشتیبانی',chat:'گفت‌وگو',system:'سیستم'};
  root.innerHTML=`<div class="hgd-heading"><div><h3>اعلان‌ها و اطلاعیه‌ها</h3><p>پیام‌های مدیر برای حساب شما، همراه با پیوند مستقیم به بخش مربوط.</p></div><span class="hgd-chip">${fmtNum((notifications||[]).filter(n=>!n.read_at).length)} خوانده‌نشده</span></div><h4>اعلان‌های حساب شما</h4>${notifications?.length?`<div class="hgd-list">${notifications.map(n=>`<article class="hgd-card hgd-notification ${n.read_at?'read':''}" style="border-right-color:${/^#[0-9a-f]{6}$/i.test(n.accent_color||'')?n.accent_color:'#168574'}"><div class="hgd-item-foot"><span class="hgd-chip ${n.kind==='warning'?'warn':n.kind==='success'?'':'blue'}">${escapeHtml(n.icon||'🔔')} ${kindLabel[n.kind]||'اعلان'}</span><span class="hgd-small">${faDate(n.created_at)}</span></div><h4>${escapeHtml(n.title)}</h4><p style="white-space:pre-wrap;font-size:13px">${escapeHtml(n.body||'')}</p><div class="hgd-row">${button(n.action_url?'بازکردن بخش مربوط':'خواندم','open-notification',`data-id="${escapeHtml(n.id)}" data-url="${escapeHtml(n.action_url||'')}"`,n.read_at?'':'soft')}</div></article>`).join('')}</div>`:empty('اعلان شخصی تازه‌ای نداری')}<h4 style="margin-top:18px">اطلاعیه‌های عمومی</h4>${data?.length?`<div class="hgd-list">${data.map(a=>`<article class="hgd-card"><h4>${escapeHtml(a.title)}</h4><p style="white-space:pre-wrap;font-size:13px">${escapeHtml(a.body)}</p><div class="hgd-small">${faDate(a.starts_at)}</div></article>`).join('')}</div>`:empty('اطلاعیهٔ عمومی فعالی نیست')}`;
}
async function refreshNotificationCount(){if(!state.user||!supabase)return;const {count,error}=await supabase.from('in_app_notifications').select('id',{count:'exact',head:true}).eq('user_id',state.user.id).is('read_at',null);if(error){console.warn('Could not read notification count:',error.message);return;}const badge=$('[data-notification-count]');if(badge)badge.textContent=count?fmtNum(count):'';}
async function openNotification(id){const {data,error}=await supabase.from('in_app_notifications').select('id,action_url').eq('id',id).eq('user_id',state.user.id).maybeSingle();if(error)throw error;if(!data)return;const {error:updateError}=await supabase.from('in_app_notifications').update({read_at:new Date().toISOString()}).eq('id',id).eq('user_id',state.user.id);if(updateError)throw updateError;await refreshNotificationCount();const url=data.action_url;if(!url)return;const tab=url.match(/^\/index\.html\?open=(chats|announcements|study|quizzes|settings|support)$/)?.[1];if(tab){closeSuite();window.dispatchEvent(new CustomEvent('hgd:navigate',{detail:{tab}}));return;}if(url==='/index.html'){closeSuite();location.href='./index.html';return;}if(url==='/admin.html'&&isAdmin()){closeSuite();location.href='./admin.html';}}
async function renderSettings(root) {
  const {data,error}=await supabase.from('user_preferences').select('*').eq('user_id',state.user.id).maybeSingle();if(error)throw error;state.prefs=data||null;
  root.innerHTML=`<div class="hgd-heading"><div><h3>تنظیمات و حریم خصوصی</h3><p>حساب واردشده: ${escapeHtml(state.user.email||state.user.id)}</p></div></div>
  <div class="hgd-grid two"><section class="hgd-card"><h4>حساب و دسترسی</h4><p class="hgd-muted">نقش‌های این بخش از app_metadata امن خوانده می‌شوند، نه user_metadata قابل تغییر توسط کاربر.</p><div class="hgd-item"><div class="hgd-item-main"><b>نقش حساب</b><p>${isAdmin()?'مدیر برنامه':isManager()?'ناظر/پشتیبانی':'کاربر عادی'}</p></div><span class="hgd-chip">${isAdmin()?'Admin':isManager()?'Moderator':'Member'}</span></div>${isAdmin()?`<a class="hgd-button primary" href="./admin.html">بازکردن پنل مدیریت</a>`:''}<div class="hgd-line"></div><div class="hgd-row">${button('تازه‌سازی نشست','reload-tab')}${button('رفتن به برنامه','back-to-app')}${button('خروج از این پنجره','close')}</div></section>
  <section class="hgd-card"><h4>پشتیبانی و داده‌ها</h4><p class="hgd-muted">پیام‌های پشتیبانی در ماژول مستقل باقی می‌مانند. برای پاسخ‌گویی کارکنان، نقش سمت سرور لازم است.</p><div class="hgd-row"><a class="hgd-button" href="./support-admin.html">صندوق پشتیبانی</a><a class="hgd-button" href="./index.html">برنامهٔ اصلی</a></div><div class="hgd-line"></div><p class="hgd-muted">یادداشت‌ها، کتاب شخصی و فلش‌کارت‌ها فقط در حساب خودت ذخیره می‌شوند؛ برای حذف حساب یا خروجی کامل داده‌ها باید روش رسمی سرویس احراز هویت و پشتیبان‌گیری اجرا شود.</p></section></div>`;
}

async function formHandler(name, form) {
  if(state.busy)return;
  state.busy=true;
  const submit=$('button[type="submit"]',form);if(submit)submit.disabled=true;
  const data=new FormData(form);
  try {
    if(name==='save-preferences') await savePreferences(data);
    else if(name==='create-debate') {
      const payload={title:normalizeText(data.get('title'),180),question:normalizeText(data.get('question'),4000),category:normalizeText(data.get('category')||'عمومی',80)||'عمومی',created_by:state.user.id,state:'open'};
      if(payload.title.length<4||!payload.question)throw new Error('عنوان و پرسش موضوع را کامل کن.');
      const {data:row,error}=await supabase.from('debate_topics').insert(payload).select('id').single();if(error)throw error;state.topicId=row.id;await setTab('debates');
    } else if(name==='create-debate-post') {
      const payload={topic_id:state.topicId,author_id:state.user.id,argument_type:String(data.get('argument_type')||'argument'),body:normalizeText(data.get('body'),5000),source_title:normalizeText(data.get('source_title'),240)||null,source_url:normalizeText(data.get('source_url'),1200)||null};
      if(!payload.body)throw new Error('متن مشارکت خالی است.');if(payload.source_url&&!/^https:\/\//i.test(payload.source_url))throw new Error('پیوند منبع باید با HTTPS آغاز شود.');
      const {error}=await supabase.from('debate_posts').insert(payload);if(error)throw error;await setTab('debates');
    } else if(name==='create-discussion-group') {
      const {data:gid,error}=await supabase.rpc('create_discussion_group',{p_title:normalizeText(data.get('title'),100),p_topic:normalizeText(data.get('topic'),600)});if(error)throw error;await setTab('groups');
    } else if(name==='search-chat-users') {
      const query=normalizeText(data.get('query'),60);if(query.length<2)throw new Error('برای جست‌وجو دست‌کم دو حرف وارد کن.');
      const {data:users,error}=await supabase.rpc('search_chat_users',{p_query:query});if(error)throw error;state.chatUserResults=users||[];await setTab('chats');
    } else if(name==='join-chat-invite') {
      const code=String(data.get('invite_code')||'').trim();const {data:id,error}=await supabase.rpc('join_chat_invite',{p_invite_code:code});if(error)throw error;state.chatId=id;await setTab('chats');
    } else if(name==='create-chat') {
      const kind=String(data.get('kind'));const visibility=String(data.get('visibility'));if(visibility==='public'&&kind!=='channel')throw new Error('تنها کانال می‌تواند عمومی باشد.');
      const cover=data.get('cover');if(cover?.size){const valid=validateUpload(cover,5*1024*1024,['image/png','image/jpeg','image/webp']);if(!valid.ok)throw new Error(valid.error);}
      const {data:id,error}=await supabase.rpc('create_chat_conversation',{p_kind:kind,p_title:normalizeText(data.get('title'),120),p_visibility:visibility,p_description:normalizeText(data.get('description'),1200)});if(error)throw error;state.chatId=id;
      if(cover?.size){const ext=cover.type==='image/png'?'png':cover.type==='image/webp'?'webp':'jpg';const path=`${id}/${state.user.id}/${crypto.randomUUID()}.${ext}`;const {error:uploadError}=await supabase.storage.from('hamghadam-conversation-covers').upload(path,cover,{upsert:false,contentType:cover.type});if(uploadError)throw new Error(`گفتگو ساخته شد اما بارگذاری تصویر انجام نشد: ${uploadError.message}`);const {error:saveError}=await supabase.rpc('set_chat_conversation_cover',{p_conversation_id:id,p_cover_path:path});if(saveError){await supabase.storage.from('hamghadam-conversation-covers').remove([path]).catch(()=>{});throw new Error(`گفتگو ساخته شد اما ثبت تصویر انجام نشد: ${saveError.message}`);}}
      state.chatUserResults=[];await setTab('chats');
    } else if(name==='send-chat-message') {
      const body=normalizeText(data.get('body'),5000);if(!body)throw new Error('متن پیام خالی است.');
      const insert={conversation_id:state.chatId,body,reply_to:state.replyId||null};const {error}=await supabase.from('chat_messages').insert(insert);if(error)throw error;state.replyId=null;await setTab('chats');
    } else if(name==='create-chat-poll') {
      if(!state.chatId)throw new Error('ابتدا یک گفتگو را انتخاب کن.');
      const question=normalizeText(data.get('question'),240);
      const options=normalizeText(data.get('options'),1600).split(/\r?\n/).map(x=>normalizeText(x,160)).filter(Boolean);
      if(question.length<2||options.length<2||options.length>10||new Set(options.map(x=>x.toLocaleLowerCase())).size!==options.length)throw new Error('پرسش و ۲ تا ۱۰ گزینهٔ غیرتکراری لازم است.');
      const {error}=await supabase.rpc('create_chat_poll',{p_conversation_id:state.chatId,p_question:question,p_options:options,p_multiple_choice:data.get('multiple_choice')==='on',p_ends_at:null});if(error)throw error;await setTab('chats');
    } else if(name==='upload-chat-attachment') {
      const file=data.get('file');
      const valid=validateUpload(file,HGD_FILE_LIMITS.chatBytes,['image/png','image/jpeg','image/webp','image/gif','application/pdf','text/plain','text/csv','application/csv','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/zip','application/x-zip-compressed','application/x-7z-compressed','audio/mpeg','audio/mp4','video/mp4']);
      if(!valid.ok)throw new Error(valid.error);if(!state.chatId)throw new Error('ابتدا یک گفتگو را انتخاب کن.');
      const objectPath=`${state.chatId}/${state.user.id}/${crypto.randomUUID()}/${file.name.replace(/[\\/\u0000-\u001f]/g,'_').slice(0,180)}`;
      const {error:upErr}=await supabase.storage.from('hamghadam-conversation-files').upload(objectPath,file,{upsert:false,contentType:file.type||'application/octet-stream'});if(upErr)throw upErr;
      const body=`پیوست: ${normalizeText(file.name,180)}`;
      const {data:msg,error:msgErr}=await supabase.from('chat_messages').insert({conversation_id:state.chatId,body}).select('id').single();
      if(msgErr){await supabase.storage.from('hamghadam-conversation-files').remove([objectPath]).catch(()=>{});throw msgErr;}
      const {error:metaErr}=await supabase.from('chat_attachments').insert({conversation_id:state.chatId,message_id:msg.id,uploaded_by:state.user.id,bucket_id:'hamghadam-conversation-files',object_path:objectPath,file_name:normalizeText(file.name,255)||'attachment',mime_type:file.type||'application/octet-stream',size_bytes:file.size});
      if(metaErr){await supabase.storage.from('hamghadam-conversation-files').remove([objectPath]).catch(()=>{});throw new Error('پیام ثبت شد اما ثبت اطلاعات پیوست ناموفق بود؛ پشتیبان فنی باید شناسه پیام '+msg.id+' را بررسی کند. '+metaErr.message);}
      await setTab('chats');
    } else if(name==='upload-personal-book') {
      const file=data.get('file');const valid=validateUpload(file,HGD_FILE_LIMITS.personalBookBytes,['application/pdf','text/plain','application/epub+zip','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);if(!valid.ok)throw new Error(valid.error);
      if(!supabase.storage)throw new Error('فضای ذخیره‌سازی در دسترس نیست.');
      const old=state.book;const objectPath=`${state.user.id}/${crypto.randomUUID()}/${file.name.replace(/[\\/\u0000-\u001f]/g,'_').slice(0,200)}`;
      const {error:upErr}=await supabase.storage.from('hamghadam-personal-books').upload(objectPath,file,{upsert:false,contentType:file.type||'application/octet-stream'});if(upErr)throw upErr;
      const book={user_id:state.user.id,title:normalizeText(data.get('title'),200)||file.name,description:normalizeText(data.get('description'),2000),bucket_id:'hamghadam-personal-books',object_path:objectPath,file_name:file.name.slice(0,255),mime_type:file.type||'application/octet-stream',size_bytes:file.size,updated_at:new Date().toISOString()};
      const {error:dbErr}=await supabase.from('personal_books').upsert(book,{onConflict:'user_id'});if(dbErr){await supabase.storage.from('hamghadam-personal-books').remove([objectPath]).catch(()=>{});throw dbErr;}
      if(old?.object_path) await supabase.storage.from('hamghadam-personal-books').remove([old.object_path]).catch(()=>{});
      await setTab('study');
    } else if(name==='create-study-note') {
      const note={user_id:state.user.id,title:normalizeText(data.get('note_title'),200),body:normalizeText(data.get('body'),30000),reference:normalizeText(data.get('reference'),500)};if(!note.title||!note.body)throw new Error('عنوان و متن یادداشت لازم است.');
      const {error}=await supabase.from('study_notes').insert(note);if(error)throw error;await setTab('study');
    } else if(name==='create-flashcard') {
      const front=normalizeText(data.get('front'),2000),back=normalizeText(data.get('back'),4000);if(!front||!back)throw new Error('روی کارت و پشت کارت را کامل کن.');
      const {error}=await supabase.from('flashcards').insert({user_id:state.user.id,front,back,deck:normalizeText(data.get('deck')||'عمومی',120)||'عمومی',source_reference:normalizeText(data.get('source_reference'),500)});if(error)throw error;await setTab('flashcards');
    }
  } catch(e) { const content=$('#hgd-content');if(content){const notice=alertMarkup(errText(e),'error');content.insertAdjacentHTML('afterbegin',notice);} }
  finally {state.busy=false;if(submit)submit.disabled=false;}
}

async function savePreferences(data) {
  const row={user_id:state.user.id,color_mode:String(data.get('color_mode')||'system'),disable_occasion_themes:data.get('disable_occasion_themes')==='on',reduce_motion:data.get('reduce_motion')==='on',sound_enabled:data.get('sound_enabled')==='on',font_scale:Number(data.get('font_scale')||1),updated_at:new Date().toISOString()};
  if(!['system','light','dark'].includes(row.color_mode)||!Number.isFinite(row.font_scale)||row.font_scale<0.85||row.font_scale>1.35)throw new Error('یکی از تنظیمات نامعتبر است.');
  const {error}=await supabase.from('user_preferences').upsert(row,{onConflict:'user_id'});if(error)throw error;state.prefs=row;applyPreferences();state.activeOccasion=row.disable_occasion_themes?null:selectActiveOccasion(state.occasions);applyOccasionBanner();await setTab('themes');
}

async function changeHandler(name,input) {
  if(name==='chat-kind') {const vis=$('#hgd-visibility');if(vis&&input.value!=='channel')vis.value='private';}
}

async function actionHandler(name, el) {
  try {
    if(name==='preview-occasion-sound') {
      if(!state.prefs?.sound_enabled)throw new Error('ابتدا اجازهٔ صدای اختیاری را در تنظیمات فعال کن.');
      const AudioCtor=window.AudioContext||window.webkitAudioContext;if(!AudioCtor)throw new Error('مرورگر این صدای نمونه را پشتیبانی نمی‌کند.');
      const ctx=new AudioCtor();const osc=ctx.createOscillator();const gain=ctx.createGain();const freq=el.dataset.sound==='quiet-bell'?660:520;osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(0.0001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(0.07,ctx.currentTime+0.04);gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.45);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+0.46);osc.onended=()=>void ctx.close();return;
    }
    if(name==='start-direct-chat') {const {data:id,error}=await supabase.rpc('create_direct_chat',{p_other_user_id:el.dataset.id});if(error)throw error;state.chatId=id;state.chatUserResults=[];await setTab('chats');return;}
    if(name==='close') {closeSuite();return;}
    if(name==='back-to-app') {closeSuite();location.href='./index.html';return;}
    if(name==='notifications') {await setTab('announcements');return;}
    if(name==='reload-tab') {await setTab(state.tab);return;}
    if(name==='select-topic') {state.topicId=el.dataset.id;await setTab('debates');return;}
    if(name==='debate-create-mode') {const f=$('#hgd-debate-create-form');if(f)f.hidden=!f.hidden;return;}
    if(name==='join-discussion-group') {const {error}=await supabase.rpc('join_discussion_group',{p_group_id:el.dataset.id});if(error)throw error;await setTab('groups');return;}
    if(name==='manage-discussion-leader') {await manageLeader(el.dataset.id);return;}
    if(name==='chat-create-toggle') {const f=$('#hgd-chat-create');if(f)f.hidden=!f.hidden;return;}
    if(name==='select-chat') {state.chatId=el.dataset.id;state.replyId=null;await setTab('chats');return;}
    if(name==='reload-chats') {await setTab('chats');return;}
    if(name==='create-chat-invite') {await createInvite();return;}
    if(name==='reply-chat-message') {state.replyId=el.dataset.id;await setTab('chats');return;}
    if(name==='clear-reply') {state.replyId=null;await setTab('chats');return;}
    if(name==='react-chat-message') {const {error}=await supabase.from('chat_reactions').upsert({message_id:el.dataset.id,user_id:state.user.id,emoji:el.dataset.emoji},{onConflict:'message_id,user_id,emoji'});if(error)throw error;await setTab('chats');return;}
    if(name==='edit-chat-message') {const message=state.messages.find(m=>m.id===el.dataset.id);if(!message)throw new Error('پیام پیدا نشد.');const body=prompt('متن جدید پیام (فقط تا ۱۰ دقیقه پس از ارسال):',message.body);if(body===null)return;const clean=normalizeText(body,5000);if(!clean)throw new Error('متن پیام خالی است.');const {error}=await supabase.from('chat_messages').update({body:clean}).eq('id',message.id).eq('sender_id',state.user.id);if(error)throw error;await setTab('chats');return;}
    if(name==='forward-chat-message') {const message=state.messages.find(m=>m.id===el.dataset.id);if(!message||message.deleted_at)throw new Error('پیام برای فوروارد در دسترس نیست.');const target=prompt('شناسهٔ گفت‌وگوی مقصد را وارد کن (UUID):','');if(target===null)return;if(!/^[0-9a-f-]{36}$/i.test(target.trim()))throw new Error('شناسهٔ مقصد معتبر نیست.');const {error}=await supabase.from('chat_messages').insert({conversation_id:target.trim(),body:message.body,forwarded_from:message.id});if(error)throw error;alert('پیام به گفت‌وگوی مقصد ارسال شد.');return;}
    if(name==='delete-chat-message') {if(!confirm('پیام حذف شود؟'))return;const {error}=await supabase.from('chat_messages').update({deleted_at:new Date().toISOString(),body:'این پیام حذف شد.'}).eq('id',el.dataset.id).eq('sender_id',state.user.id);if(error)throw error;await setTab('chats');return;}
    if(name==='pin-chat-message') {const {error}=await supabase.rpc('pin_chat_message',{p_message_id:el.dataset.id,p_pin:el.dataset.pin==='true',p_reason:''});if(error)throw error;await setTab('chats');return;}
    if(name==='vote-chat-poll') {const {error}=await supabase.rpc('vote_chat_poll',{p_poll_id:el.dataset.pollId,p_option_id:el.dataset.optionId});if(error)throw error;await setTab('chats');return;}
    if(name==='open-chat-attachment') {const {data,error}=await supabase.storage.from('hamghadam-conversation-files').createSignedUrl(el.dataset.path,600);if(error)throw error;const win=window.open(data.signedUrl,'_blank','noopener,noreferrer');if(!win)alert('مرورگر پنجره را بسته است؛ این پیوند موقت را باز کن:\n'+data.signedUrl);return;}
    if(name==='report-item') {await reportItem(el.dataset.targetType,el.dataset.targetId);return;}
    if(name==='open-personal-book') {await openPersonalBook();return;}
    if(name==='delete-personal-book') {if(!state.book||!confirm('کتاب شخصی حذف شود؟'))return;const b=state.book;const {error}=await supabase.from('personal_books').delete().eq('user_id',state.user.id);if(error)throw error;await supabase.storage.from(b.bucket_id).remove([b.object_path]);state.book=null;await setTab('study');return;}
    if(name==='delete-study-note') {if(!confirm('یادداشت حذف شود؟'))return;const {error}=await supabase.from('study_notes').delete().eq('id',el.dataset.id).eq('user_id',state.user.id);if(error)throw error;await setTab('study');return;}
    if(name==='delete-flashcard') {if(!confirm('فلش‌کارت حذف شود؟'))return;const {error}=await supabase.from('flashcards').delete().eq('id',el.dataset.id).eq('user_id',state.user.id);if(error)throw error;await setTab('flashcards');return;}
    if(name==='review-flashcard') {await reviewFlashcard(el.dataset.id,Number(el.dataset.quality));return;}
    if(name==='start-quiz') {await startQuiz(el.dataset.id);return;}
  } catch(e) {const content=$('#hgd-content');content?.insertAdjacentHTML('afterbegin',alertMarkup(errText(e),'error'));}
}

async function manageLeader(groupId) {
  const {data:members,error}=await supabase.from('discussion_group_members').select('user_id,member_role').eq('group_id',groupId);if(error)throw error;
  const candidates=(members||[]).filter(m=>m.user_id!==state.user.id);
  if(!candidates.length)throw new Error('برای تعیین مسئول، دست‌کم یک عضو دیگر باید در گروه باشد.');
  const choice=prompt('شناسهٔ UUID عضوی که مسئول بحث می‌شود را وارد کن:\n'+candidates.map(m=>`${m.user_id} (${m.member_role})`).join('\n'));
  if(choice===null)return;
  const found=candidates.some(m=>m.user_id===choice.trim());if(!found)throw new Error('شناسه باید دقیقاً یکی از اعضای گروه باشد.');
  const {error:assignError}=await supabase.rpc('assign_discussion_leader',{p_group_id:groupId,p_user_id:choice.trim(),p_assign:true});if(assignError)throw assignError;await setTab('groups');
}

async function createInvite() {
  if(!state.chatId)throw new Error('ابتدا یک گروه یا کانال را انتخاب کن.');
  const daysRaw=prompt('اعتبار لینک به روز (۱ تا ۳۶۵)؛ خالی یعنی بدون انقضا:','7');if(daysRaw===null)return;
  const days=daysRaw.trim()===''?null:Number(daysRaw);if(days!==null&&(!Number.isInteger(days)||days<1||days>365))throw new Error('روز باید عدد صحیح بین ۱ و ۳۶۵ باشد.');
  const exp=days===null?null:new Date(Date.now()+days*86400000).toISOString();
  const {data,error}=await supabase.rpc('create_chat_invite',{p_conversation_id:state.chatId,p_expires_at:exp,p_max_uses:20});if(error)throw error;
  const url=new URL('./index.html',location.href);url.searchParams.set('invite',data);await navigator.clipboard?.writeText(url.toString()).catch(()=>{});alert(`لینک/کد دعوت ساخته شد:\n${url}\nکد: ${data}\n(اگر کپی خودکار انجام نشد، متن را دستی کپی کن.)`);
}

async function reportItem(targetType,targetId) {
  if(!targetType||!targetId)throw new Error('شناسهٔ محتوای گزارش‌شده موجود نیست.');
  const options=HGD_REPORT_REASONS.map(([value,label],i)=>`${i+1}. ${label}`).join('\n');const answer=prompt(`دلیل گزارش را با شماره انتخاب کن:\n${options}`,'1');if(answer===null)return;
  const idx=Number(answer)-1;if(!Number.isInteger(idx)||idx<0||idx>=HGD_REPORT_REASONS.length)throw new Error('شمارهٔ دلیل نامعتبر است.');
  const description=prompt('توضیح تکمیلی اختیاری:','')||'';
  const {error}=await supabase.from('community_reports').insert({reporter_id:state.user.id,target_type,target_id,reason:HGD_REPORT_REASONS[idx][0],description:normalizeText(description,2000)});if(error)throw error;alert('گزارش در سرور ثبت شد و برای بررسی انسانی به پنل ناظران می‌رود.');
}

async function openPersonalBook() {
  if(!state.book)throw new Error('کتابی بارگذاری نشده است.');
  const {data,error}=await supabase.storage.from(state.book.bucket_id).createSignedUrl(state.book.object_path,600);if(error)throw error;
  const win=window.open(data.signedUrl,'_blank','noopener,noreferrer');if(!win)alert('مرورگر پنجرهٔ جدید را بسته است. این پیوند موقت را در مرورگر باز کن:\n'+data.signedUrl);
}

async function reviewFlashcard(id,quality) {
  const card=state.flashcards.find(x=>x.id===id);if(!card)throw new Error('فلش‌کارت پیدا نشد.');
  const next=nextReviewSchedule({quality,intervalDays:card.interval_days,easeFactor:card.ease_factor,repetitions:card.repetitions});
  const {error:reviewError}=await supabase.from('flashcard_reviews').insert({flashcard_id:id,user_id:state.user.id,quality,previous_interval_days:card.interval_days,next_interval_days:next.intervalDays});if(reviewError)throw reviewError;
  const {error:updateError}=await supabase.from('flashcards').update({interval_days:next.intervalDays,ease_factor:next.easeFactor,repetitions:next.repetitions,due_at:next.dueAt,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',state.user.id);if(updateError)throw updateError;await setTab('flashcards');
}

async function startQuiz(id) {
  const {data,error}=await supabase.rpc('get_public_quiz',{p_quiz_id:id});if(error)throw error;
  if(!data||!Array.isArray(data.questions))throw new Error('ساختار آزمون دریافتی معتبر نیست.');
  if(!data.questions.length)throw new Error('این آزمون هنوز سؤال ندارد.');
  let index=0;const answers=[];
  while(index<data.questions.length) {
    const q=data.questions[index];const promptText=`${data.title}\nسؤال ${index+1} از ${data.questions.length}\n\n${q.prompt}\n\n${(q.options||[]).map((o,i)=>`${i+1}) ${o}`).join('\n')}\n\nشمارهٔ گزینه را وارد کن:`;
    const raw=prompt(promptText,'1');if(raw===null)break;const chosen=Number(raw)-1;if(!Number.isInteger(chosen)||chosen<0||chosen>=q.options.length){alert('شمارهٔ گزینه نامعتبر است.');continue;}
    const {data:result,error:submitError}=await supabase.rpc('submit_hamghadam_quiz_answer',{p_quiz_id:id,p_question_id:q.id,p_answer_index:chosen});if(submitError)throw submitError;answers.push(result);alert(`${result.correct?'✅ پاسخ درست':'پاسخ درست نبود'}\nامتیاز این سؤال: ${fmtNum(result.points_awarded)}\nامتیاز مجموع: ${fmtNum(result.score)}\n${result.explanation||''}`);index++;
  }
  alert(`آزمون متوقف شد یا به پایان رسید. پاسخ‌های ثبت‌شده: ${fmtNum(answers.length)}. برای جلوگیری از امتیاز تکراری، هر سؤال در هر نوبت فقط یک‌بار قابل پاسخ است.`);await setTab('quizzes');
}

async function submitBookProgress(page) {
  if(!state.book)return;const n=Number(page);if(!Number.isInteger(n)||n<0)throw new Error('شمارهٔ صفحه نامعتبر است.');
  const {error}=await supabase.from('personal_books').update({progress_page:n,updated_at:new Date().toISOString()}).eq('user_id',state.user.id);if(error)throw error;
}

// Read the invitation token if the user opens a real invite URL. The token is consumed only by an RPC.
async function consumeIncomingInvite() {
  const value=new URLSearchParams(location.search).get('invite');if(!value||!state.user||!supabase)return;
  try { const {data,error}=await supabase.rpc('join_chat_invite',{p_invite_code:value});if(error)throw error;const url=new URL(location.href);url.searchParams.delete('invite');history.replaceState({},'',url);state.chatId=data;await openSuite('chats'); }
  catch(e){console.warn('Invite join failed:',errText(e));}
}

document.addEventListener('input',(event)=>{if(event.target.id!=='searchQ')return;const q=event.target.value.trim();clearTimeout(window.__hgdSearchTimer);const mount=document.getElementById('searchRemoteList');if(mount)mount.innerHTML=q?'<p class="small muted">در حال جست‌وجوی محتوای آنلاین…</p>':'';window.__hgdSearchTimer=setTimeout(async()=>{const target=document.getElementById('searchRemoteList');if(!target||!q||!state.user||!supabase)return;if(q.length<2){target.innerHTML='<p class="small muted">برای جست‌وجوی آنلاین دست‌کم دو نویسه بنویس.</p>';return;}const request=++state.searchRequest;const {data,error}=await supabase.rpc('search_app_content',{p_query:q,p_limit:40});if(request!==state.searchRequest||!document.getElementById('searchRemoteList'))return;if(error){target.innerHTML='<p class="small muted">جست‌وجوی آنلاین موقتاً در دسترس نیست.</p>';console.warn('Global search:',errText(error));return;}const rows=data||[];target.innerHTML='<h3>محتوای آنلاین</h3>'+(rows.length?'<div class="stack">'+rows.map(x=>'<div class="item"><b>'+escapeHtml(x.title||'نتیجه')+'</b><p class="small muted">'+escapeHtml(String(x.snippet||'').slice(0,240))+'</p><button class="btn small" type="button" data-hgd-search-tab="'+escapeHtml(x.target_tab||'chats')+'">بازکردن بخش</button></div>').join('')+'</div>':'<p class="small muted">در محتوای آنلاین نتیجه‌ای پیدا نشد.</p>');},350);});
document.addEventListener('click',(event)=>{const b=event.target.closest('[data-hgd-search-tab]');if(b)void openSuite(b.dataset.hgdSearchTab);});
function registerAppHooks() {
  addLaunchers();
  if(supabase) {
    supabase.auth.onAuthStateChange((_event,session)=>{
      const previous=state.user?.id;state.session=session||null;state.user=session?.user||null;
      if(state.user&&previous!==state.user.id) void loadUserBootstrap().then(addLaunchers).catch(e=>console.warn('Hamghadam preference sync:',errText(e)));
      else if(!state.user){state.prefs=null;state.activeOccasion=null;$('#hgd-admin-launcher')?.remove();$('#hgd-active-occasion-banner')?.remove();void loadGlobalAudio();}
      addLaunchers();
    });
    void loadSession().then(consumeIncomingInvite).catch(e=>console.warn('Hamghadam suite bootstrap:',errText(e)));
  }
}

registerAppHooks();

