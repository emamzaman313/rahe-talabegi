import './hamghadam-auth.css';
import { supabase, isSupabaseConfigured } from './supabase-client.js';
import { Capacitor } from '@capacitor/core';
import { unregisterPushDevice } from './task-reminders.js';
import {
  greetingName,
  normalizeDisplayName,
  normalizeFreeMinutes,
  normalizeStage,
  normalizeStudyStyle,
  profilePayload,
  roleLabel,
  trustedRole,
} from './hamghadam-auth-utils.mjs';

const PROFILE_COLUMNS = 'id,display_name,stage,stage_confirmed,avatar_path,free_minutes,study_style,selected_discussion_group_id,created_at,updated_at';
const GATE_ID = 'hg-auth-gate';
const AUTH_DEADLINE_MS = 20000;
let user = null;
let profile = null;
let mode = 'login';
let pendingEmail = '';
let pendingName = '';
let pendingStage = '';
let pendingMode = 'login';
let deferSignInHydration = false;
let busy = false;
let notice = '';
let noticeType = 'info';
let lastHydratedUserId = null;
let queuedWebPromoSession = null;
let activeWebPromoKey = null;
let webPromoPreviousFocus = null;
let webPromoAppState = null;

const ANDROID_APK_URL = 'https://github.com/emamzaman313/rahe-talabegi/releases/download/android-latest/hamghadam-android.apk';

function closeWebAppPromo() {
  document.getElementById('hg-web-app-promo')?.remove();
  const app = document.querySelector('body > .app');
  if (app && webPromoAppState) {
    app.inert = webPromoAppState.inert;
    if (webPromoAppState.ariaHidden === null) app.removeAttribute('aria-hidden');
    else app.setAttribute('aria-hidden', webPromoAppState.ariaHidden);
  }
  webPromoAppState = null;
  if (webPromoPreviousFocus?.isConnected && !webPromoPreviousFocus.closest('[hidden]')) {
    webPromoPreviousFocus.focus?.({ preventScroll: true });
  } else {
    document.querySelector('body > .app main button:not([disabled]), body > .app main a[href]')?.focus?.({ preventScroll: true });
  }
  webPromoPreviousFocus = null;
}

function showWebAppPromo(session) {
  if (Capacitor.isNativePlatform() || !session?.user) return;
  const promoKey = `${session.user.id}:${session.expires_at || ''}`;
  if (activeWebPromoKey === promoKey || document.getElementById('hg-web-app-promo')) return;
  if (document.getElementById('hg-discussion-onboarding')) {
    queuedWebPromoSession = session;
    return;
  }

  queuedWebPromoSession = null;
  activeWebPromoKey = promoKey;
  webPromoPreviousFocus = document.activeElement;
  const app = document.querySelector('body > .app');
  if (app) {
    webPromoAppState = { inert: app.inert, ariaHidden: app.getAttribute('aria-hidden') };
    app.inert = true;
    app.setAttribute('aria-hidden', 'true');
  }

  const overlay = document.createElement('div');
  overlay.id = 'hg-web-app-promo';
  overlay.dir = 'rtl';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'hg-web-app-promo-title');
  overlay.innerHTML = `<div class="hg-promo-orbit hg-promo-orbit-one" aria-hidden="true"></div><div class="hg-promo-orbit hg-promo-orbit-two" aria-hidden="true"></div><section class="hg-promo-card"><div class="hg-promo-art" aria-hidden="true"><span class="hg-promo-star star-one">✦</span><span class="hg-promo-star star-two">✧</span><span class="hg-promo-star star-three">✦</span><div class="hg-promo-moon"></div><div class="hg-promo-mountain mountain-back"></div><div class="hg-promo-mountain mountain-front"></div><div class="hg-promo-path"></div><div class="hg-promo-mark">هـ</div></div><div class="hg-promo-copy"><span class="hg-promo-kicker">هم‌قدم، همراه مسیر تو</span><h1 id="hg-web-app-promo-title">تجربه‌ای بهتر<br><span>در اپلیکیشن</span></h1><p>برای دسترسی آسان‌تر، اعلان‌های برنامه و همراهی پیوسته در مسیر یادگیری، نسخهٔ اندروید هم‌قدم را نصب کن.</p><div class="hg-promo-points"><span><i>✦</i> دسترسی سریع‌تر</span><span><i>◷</i> یادآوری‌های برنامه</span><span><i>▤</i> همراهی در مسیر مطالعه</span></div><div class="hg-promo-actions"><a class="hg-promo-download" href="${ANDROID_APK_URL}" aria-label="دانلود مستقیم برنامهٔ اندروید هم‌قدم">دانلود برنامه <span aria-hidden="true">↓</span></a><button class="hg-promo-web" type="button">فعلاً، ادامه در نسخهٔ وب</button></div><small class="hg-promo-note">هر زمان خواستی می‌توانی از همین سایت به برنامه برگردی.</small></div></section>`;
  document.body.append(overlay);

  const dismiss = () => closeWebAppPromo();
  overlay.querySelector('.hg-promo-web').addEventListener('click', dismiss);
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); return; }
    if (event.key !== 'Tab') return;
    const items = [...overlay.querySelectorAll('a[href],button:not([disabled])')];
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  overlay.querySelector('.hg-promo-web').focus({ preventScroll: true });
}

document.addEventListener('hgd:discussion-group-selected', () => {
  if (queuedWebPromoSession) showWebAppPromo(queuedWebPromoSession);
});

const $ = (selector, root = document) => root.querySelector(selector);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[ch]);
const normalizeOtp = (value) => String(value ?? '').replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 1632)).trim();

function withDeadline(promise, operation, timeoutMs = AUTH_DEADLINE_MS) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(`${operation} بیش از حد طول کشید.`);
        error.name = 'TimeoutError';
        reject(error);
      }, timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}

function getLegacyProfile() {
  try {
    const state = window.__RAHE_STATE__ || JSON.parse(localStorage.getItem('rahe-talabegi-v1') || 'null');
    return state?.profile || {};
  } catch { return {}; }
}

function applyProfileToLegacyState(row) {
  if (!row) return;
  const target = window.__RAHE_STATE__;
  if (target?.profile) {
    Object.assign(target.profile, {
      name: row.display_name || '',
      stage: row.stage || 'پایه یک',
      freeMinutes: row.free_minutes ?? 60,
      studyStyle: row.study_style || 'ترکیبی',
    });
    try { localStorage.setItem('rahe-talabegi-v1', JSON.stringify(target)); } catch { /* cache is optional */ }
    if (typeof window.render === 'function') {
      try { window.render(); } catch { /* the current view can still operate */ }
    }
  }
}

function renderMountain() {
  return `<svg class="hg-mountain" viewBox="0 0 620 190" role="img" aria-label="نقشهٔ نمادین مسیر رشد و یادگیری">
    <defs><linearGradient id="hgPeakA" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#83e0cb" stop-opacity=".55"/><stop offset="1" stop-color="#1f786f" stop-opacity=".13"/></linearGradient><linearGradient id="hgPeakB" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#efd28d" stop-opacity=".5"/><stop offset="1" stop-color="#a6d6c9" stop-opacity=".05"/></linearGradient></defs>
    <path d="M0 162 90 92 135 124 238 25 310 111 365 64 469 132 523 100 620 153V190H0Z" fill="url(#hgPeakA)"/>
    <path d="m194 66 44-41 42 50-35-14-17 13-15-16-19 8Z" fill="#c8f2e4" opacity=".8"/><path d="M0 176 116 126 178 145 275 92 359 155 447 119 620 178V190H0Z" fill="#0a222b" opacity=".72"/>
    <path d="M44 157 Q115 143 151 112 T239 82 T316 116 T401 105 T496 133" fill="none" stroke="#9be6d4" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 7" opacity=".85"/>
    <circle cx="151" cy="112" r="5" fill="#f2cb7d" stroke="#f9e6b7" stroke-width="3"/><circle cx="316" cy="116" r="5" fill="#66d3bb" stroke="#c7f5e7" stroke-width="3"/><circle cx="496" cy="133" r="5" fill="#f2cb7d" stroke="#f9e6b7" stroke-width="3"/><path d="m239 78 10-16 10 16Z" fill="#f2cb7d"/>
  </svg>`;
}

function renderGate() {
  const titles = {
    login: ['خوش برگشتی', 'برای ادامهٔ مسیرت وارد حساب هم‌قدم شو.', 'ورود به هم‌قدم'],
    signup: ['از همین قدم شروع کن', 'یک حساب بساز تا مسیرت بین دستگاه‌ها ادامه پیدا کند.', 'ساخت حساب'],
    'set-password': ['رمز ورودت را بساز', 'ایمیلت تأیید شد. حالا یک رمز عبور بساز تا دفعه‌های بعد با ایمیل و رمز وارد شوی.', 'ثبت رمز و ورود'],
    reset: ['بازیابی رمز عبور', 'نشانی ایمیلت را بنویس تا کد بازیابی برایت ارسال شود.', 'ارسال کد بازیابی'],

    update: ['رمز تازه انتخاب کن', 'رمز عبور جدیدی برای حساب خودت ثبت کن.', 'ثبت رمز تازه'],
    verify: [pendingMode === 'recovery' ? 'کد بازیابی را وارد کن' : 'ایمیلت را تأیید کن', pendingMode === 'recovery' ? 'کد تازه‌ترین ایمیل بازیابی را وارد کن تا بتوانی رمز جدید بسازی.' : 'کدی را که به ایمیلت ارسال شده وارد کن؛ اگر پیوند دریافت کردی، روی آن بزن تا به برنامه برگردی.', pendingMode === 'recovery' ? 'تأیید کد و ادامه' : 'تأیید و ورود'],

  };
  const [title, subtitle, submit] = titles[mode] || titles.login;
  const showPassword = ['login', 'update', 'set-password'].includes(mode);
  const passwordLabel = mode === 'update' || mode === 'set-password' ? 'رمز عبور تازه' : 'رمز عبور';
  const form = isSupabaseConfigured ? `<form class="hg-form" id="hg-auth-form" novalidate>
    ${mode === 'signup' ? `<div class="hg-field"><label for="hg-name">نام نمایشی (اختیاری)</label><input id="hg-name" name="display_name" type="text" maxlength="60" autocomplete="nickname" placeholder="مثلاً علی"></div><div class="hg-field"><label for="hg-stage">پایهٔ تحصیلی</label><input id="hg-stage" name="stage" type="text" maxlength="60" required placeholder="مثلاً پایهٔ اول"></div>` : ''}
    ${mode !== 'update' && mode !== 'set-password' && mode !== 'verify' ? `<div class="hg-field"><label for="hg-email">ایمیل</label><input id="hg-email" name="email" type="email" autocomplete="email" maxlength="254" required placeholder="you@example.com" dir="ltr"></div>` : ''}
    ${mode === 'verify' ? `<input type="hidden" name="email" value="${escape(pendingEmail)}"><div class="hg-field"><label for="hg-code">کد تأیید</label><input id="hg-code" name="token" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9٠-٩۰-۹]{6,10}" minlength="6" maxlength="10" required dir="ltr" placeholder="12345678"></div>` : ''}
    ${showPassword ? `<div class="hg-field"><label for="hg-password">${passwordLabel}</label><input id="hg-password" name="password" type="password" autocomplete="${mode === 'update' || mode === 'set-password' ? 'new-password' : 'current-password'}" minlength="8" maxlength="128" required placeholder="حداقل ۸ نویسه" dir="ltr"></div>` : ''}
    ${notice ? `<div class="hg-alert ${escape(noticeType)}" role="status" aria-live="polite">${escape(notice)}</div>` : ''}
    <button class="hg-submit" type="submit" ${busy ? 'disabled' : ''}><span>${busy ? 'در حال انجام…' : submit}</span><span aria-hidden="true">↙</span></button>
    <div class="hg-form-row">${mode === 'login' ? `<button class="hg-link" type="button" data-hg-mode="signup">حساب ندارم؛ ثبت‌نام</button><button class="hg-link" type="button" data-hg-mode="reset">رمزم را فراموش کرده‌ام</button>` : mode === 'signup' ? `<button class="hg-link" type="button" data-hg-mode="login">حساب دارم؛ ورود</button>` : mode === 'verify' ? `<button class="hg-link" type="button" data-hg-action="resend-code">ارسال دوبارهٔ کد</button><button class="hg-link" type="button" data-hg-mode="${escape(pendingMode === 'recovery' ? 'reset' : pendingMode || 'login')}">تغییر ایمیل</button>` : mode === 'update' ? `<button class="hg-link" type="button" data-hg-mode="login">لغو</button>` : `<button class="hg-link" type="button" data-hg-mode="login">بازگشت به ورود</button>`}<button class="hg-link" type="button" data-hg-action="refresh" aria-label="بارگذاری دوباره صفحه ورود">↻ رفرش و تلاش مجدد</button></div>
  </form>` : `<div class="hg-alert warn" role="status">اتصال امن هنوز در تنظیمات ساخت وب/اندروید تعریف نشده است. تا زمان تنظیم نشانی پروژه و کلید عمومی Supabase، ورود فعال نمی‌شود.</div><ol class="hg-setup-list"><li>نشانی پروژه را با متغیر <code>VITE_SUPABASE_URL</code> تنظیم کن.</li><li>کلید عمومی را با متغیر <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> تنظیم کن.</li><li>برنامه را دوباره build کن. کلید secret یا <code>service_role</code> را هرگز داخل اپ قرار نده.</li></ol>`;

  return `<div class="hg-shell"><section class="hg-story" aria-label="معرفی هم‌قدم">
    <div class="hg-brand"><div class="hg-brandmark" aria-hidden="true">هـ</div><div><div class="hg-brandname">هم‌قدم</div><div class="hg-brandtag">همراه مسیر علم، مطالعه و رشد</div></div></div>
    <span class="hg-eyebrow">یک مسیر روشن، قدم‌به‌قدم</span>
    <h1>راهی برای <span>یادگرفتنِ عمیق‌تر</span> و ادامه‌دادن.</h1>
    <p>برنامه‌ریزی، کتاب‌خوانی، تمرین نحو و صرف و همفکری در یک فضای آرام و منظم؛ با حساب شخصی که از مسیر سرور مدیریت می‌شود.</p>
    ${renderMountain()}
    <div class="hg-benefits"><div class="hg-benefit"><i>◷</i><b>برنامه و هدف</b><span>قدم‌های کوچک و برنامهٔ قابل تنظیم</span></div><div class="hg-benefit"><i>ق</i><b>نحو و صرف</b><span>تمرین و مرور علمی با توجه به کتاب درسی</span></div><div class="hg-benefit"><i>▤</i><b>کتاب و مطالعه</b><span>ادامهٔ مسیر یادگیری به‌تدریج تکمیل می‌شود</span></div><div class="hg-benefit"><i>✦</i><b>همفکری و پشتیبانی</b><span>ارتباط با حساب و نشست معتبر</span></div></div>
  </section><section class="hg-auth-card" aria-labelledby="hg-auth-title">
    <div class="hg-card-top"><div><h2 id="hg-auth-title">${title}</h2><p>${subtitle}</p></div><div class="hg-card-emblem" aria-hidden="true">✧</div></div>
    ${form}
    <div class="hg-card-bottom">ایمیل تأیید حاوی کد یا پیوند ورود است؛ حساب تنها پس از تأیید مالکیت ایمیل وارد برنامه می‌شود.</div>
    <div class="hg-privacy"><span>◈</span><div>پروفایل پایه به سرور همگام می‌شود. داده‌های قدیمی برنامه‌ریز که هنوز منتقل نشده‌اند، روی همین دستگاه باقی می‌مانند؛ این مرحله آن‌ها را خودکار آپلود نمی‌کند.</div></div>
  </section></div>`;
}

function setGateOpen(open) {
  const root = document.getElementById(GATE_ID);
  if (root) root.hidden = !open;
  const app = document.querySelector('body > .app');
  if (app) {
    app.inert = open;
    app.setAttribute('aria-hidden', open ? 'true' : 'false');
  }
  if (open) {
    document.documentElement.classList.add('hg-auth-checking');
    document.body.classList.add('hg-auth-locked');
  } else {
    document.documentElement.classList.remove('hg-auth-checking');
    document.body.classList.remove('hg-auth-locked');
  }
}

function ensureAccountBox() {
  const actions = $('.topbar .topactions');
  if (!actions) return;
  let box = $('#hg-account-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'hg-account-box';
    box.className = 'hg-account';
    actions.prepend(box);
  }
  const role = trustedRole(user);
  const name = greetingName(profile, user);
  const avatar=profile?.avatar_path?supabase.storage.from('profile-avatars').getPublicUrl(profile.avatar_path).data.publicUrl:'';
  box.innerHTML = `<span class="hg-account-chip" title="حساب متصل به سرور">${avatar?`<img class="hg-account-avatar" src="${escape(avatar)}" alt="تصویر ${escape(name)}">`:'<span class="hg-account-dot"></span>'}<span class="hg-account-name">${escape(name)}</span><span class="hg-role">${escape(roleLabel(role))}</span></span><button type="button" class="hg-account-btn" data-hg-action="profile">ویرایش پروفایل</button><button type="button" class="hg-account-btn" data-hg-action="photo">انتخاب عکس</button>${role === 'support' ? '<a class="hg-account-btn" href="./support-admin.html" rel="noopener">صندوق پشتیبانی</a>' : ''}<button type="button" class="hg-account-btn danger" data-hg-action="logout">خروج</button>`;
}

async function loadOrCreateProfile(authUser) {
  const fallback = getLegacyProfile();
  const seed = {
    id: authUser.id,
    display_name: normalizeDisplayName(authUser.user_metadata?.display_name, fallback.name || String(authUser.email || '').split('@')[0]),
    stage: normalizeStage(authUser.user_metadata?.stage, normalizeStage(fallback.stage, 'پایه یک')),
    free_minutes: normalizeFreeMinutes(fallback.freeMinutes, 60),
    study_style: normalizeStudyStyle(fallback.studyStyle, 'ترکیبی'),
    stage_confirmed: false,
  };
  let result = await withDeadline(supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', authUser.id).maybeSingle(), 'دریافت پروفایل');
  if (result.error) throw result.error;
  if (result.data) return result.data;
  result = await withDeadline(supabase.from('profiles').insert(seed).select(PROFILE_COLUMNS).single(), 'ساخت پروفایل');
  if (result.error) {
    // A concurrent sign-in may have created the row; reread it before failing.
    const retry = await withDeadline(supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', authUser.id).maybeSingle(), 'بررسی دوبارهٔ پروفایل');
    if (!retry.error && retry.data) return retry.data;
    throw result.error;
  }
  return result.data;
}

async function acceptSession(session, { showWebPromo = false } = {}) {
  if (!session?.user) {
    user = null;
    profile = null;
    lastHydratedUserId = null;
    queuedWebPromoSession = null;
    activeWebPromoKey = null;
    closeWebAppPromo();
    mode = 'login';
    setGateOpen(true);
    renderGateIntoRoot();
    return;
  }
  const authUser = session.user;
  const changed = lastHydratedUserId !== authUser.id;
  user = authUser;
  setGateOpen(true);
  ensureAccountBox();
  if (changed) {
    lastHydratedUserId = authUser.id;
    try {
      profile = await loadOrCreateProfile(authUser);
      applyProfileToLegacyState(profile);
      ensureAccountBox();
      await ensureDiscussionGroupSelection();
    } catch (error) {
      lastHydratedUserId = null;
      notice = `وارد حساب شدی، اما پروفایل سروری بارگذاری نشد: ${error?.message || 'خطای اتصال'}`;
      noticeType = 'warn';
      setGateOpen(true);
      renderGateIntoRoot();
      showLegacyToast(notice);
      return;
    }
  }
  if (showWebPromo) showWebAppPromo(session);
}

async function ensureDiscussionGroupSelection(){
  if(!user||document.getElementById('hg-discussion-onboarding'))return;
  const skipKey=`hg-discussion-onboarding-skipped:${user.id}`;try{if(localStorage.getItem(skipKey)==='1')return;}catch{/* storage is optional */}
  const root=document.createElement('div');root.id='hg-discussion-onboarding';root.dir='rtl';root.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="hg-discussion-title"><h2 id="hg-discussion-title">پیش از ورود، مسیرت را مشخص کن</h2><p>می‌توانی پایه و گروه مباحثه را همین حالا انتخاب کنی یا فعلاً وارد برنامه شوی و بعداً آن را تکمیل کنی.</p><div class="hg-onboarding-stage"></div><div class="hg-discussion-list"></div><p class="hg-discussion-status" aria-live="polite"></p><button type="button" data-onboarding-skip>فعلاً وارد برنامه شو</button></section>';
  document.body.append(root);
  const stageHost=root.querySelector('.hg-onboarding-stage'),list=root.querySelector('.hg-discussion-list'),status=root.querySelector('.hg-discussion-status');
  const unlock=()=>{root.remove();setGateOpen(false);ensureAccountBox();document.dispatchEvent(new CustomEvent('hgd:discussion-group-selected',{detail:{groupId:profile.selected_discussion_group_id}}));};
  const renderStage=()=>{stageHost.innerHTML=`<form class="hg-onboarding-form"><label for="hg-onboarding-stage">پایه یا مقطع تحصیلی</label><input id="hg-onboarding-stage" name="stage" maxlength="60" required value="${escape(profile?.stage||'')}" placeholder="مثلاً پایهٔ اول یا سطح دو"><button type="submit">تأیید پایه و دیدن گروه‌ها</button></form>`;list.innerHTML='';};
  const loadGroups=async()=>{setGateOpen(true);status.textContent='در حال دریافت گروه‌های مناسب…';list.innerHTML='';try{const {data:groups,error}=await withDeadline(supabase.rpc('list_discussion_group_options'), 'دریافت گروه‌های مباحثه', 12000);if(error)throw error;const available=(groups||[]).filter(g=>!g.stage||String(g.stage).trim().toLocaleLowerCase()===String(profile.stage).trim().toLocaleLowerCase());list.innerHTML=available.map(group=>{const count=Number(group.current_members)||0,limit=Number(group.max_members)||3;return `<article><div><b>${escape(group.title)}</b><p>${escape(group.topic||'مباحثهٔ هم‌پایه‌ها')}</p><small>${count.toLocaleString('fa-IR')} از ${limit.toLocaleString('fa-IR')} عضو${group.stage?` · ${escape(group.stage)}`:''}</small></div><button type="button" data-group-id="${escape(group.group_id)}" ${count>=limit?'disabled':''}>${count>=limit?'ظرفیت تکمیل':'پیوستن به گروه'}</button></article>`}).join('')||'<p>هنوز گروه خالی برای این پایه وجود ندارد؛ چند لحظهٔ دیگر دوباره تلاش کن.</p>';status.textContent='یک گروه هم‌پایه انتخاب کن تا ورود کامل شود.';}catch(error){status.textContent=`گروه‌ها بارگذاری نشدند: ${error?.message||'اتصال سرور'}`;list.innerHTML='<button type="button" data-onboarding-retry>تلاش دوباره</button>';}};
  renderStage();
  root.addEventListener('submit',async event=>{if(!event.target.matches('.hg-onboarding-form'))return;event.preventDefault();const stage=normalizeStage(new FormData(event.target).get('stage'),'');if(!stage){status.textContent='پایه یا مقطع را وارد کن.';return;}const submit=event.target.querySelector('button');submit.disabled=true;status.textContent='در حال ذخیرهٔ پایه…';try{const {data,error}=await withDeadline(supabase.from('profiles').update({stage,stage_confirmed:true}).eq('id',user.id).select(PROFILE_COLUMNS).single(), 'ذخیرهٔ پایهٔ تحصیلی');if(error)throw error;profile=data;applyProfileToLegacyState(profile);if(profile.selected_discussion_group_id)unlock();else await loadGroups();}catch(error){status.textContent=`پایه ذخیره نشد: ${error?.message||'خطای سرور'}`;submit.disabled=false;}});
  root.addEventListener('click',async event=>{if(event.target.closest('[data-onboarding-skip]')){try{localStorage.setItem(skipKey,'1');}catch{/* storage is optional */}unlock();return;}if(event.target.closest('[data-onboarding-retry]')){await loadGroups();return;}const button=event.target.closest('[data-group-id]');if(!button||button.disabled)return;button.disabled=true;status.textContent='در حال ثبت عضویت…';try{const {data,error}=await withDeadline(supabase.rpc('select_discussion_group',{p_group_id:button.dataset.groupId}), 'ثبت عضویت در گروه', 12000);if(error)throw error;profile={...profile,selected_discussion_group_id:data};unlock();showLegacyToast('به گروه مباحثه پیوستی؛ حالا وارد هم‌قدم می‌شوی.');}catch(error){status.textContent=error?.message||'عضویت ثبت نشد؛ گروه دیگری را انتخاب کن.';button.disabled=false;}});
  if(profile?.stage_confirmed&&profile?.selected_discussion_group_id){unlock();return;}
  if(profile?.stage_confirmed)void loadGroups();
}

function showLegacyToast(message) {
  const toast = $('#toast');
  if (toast) {
    toast.textContent = message;
    toast.classList.remove('hide');
    clearTimeout(showLegacyToast.timer);
    showLegacyToast.timer = setTimeout(() => toast.classList.add('hide'), 5000);
  }
}

function renderGateIntoRoot() {
  const root = document.getElementById(GATE_ID);
  if (!root) return;

  // Keep entered values when the auth gate is re-rendered during a request.
  const previousValues = new Map();
  root.querySelectorAll('[name]').forEach((field) => {
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
      previousValues.set(field.name, field.value);
    }
  });

  root.innerHTML = renderGate();
  root.hidden = false;
  root.querySelectorAll('[name]').forEach((field) => {
    if (previousValues.has(field.name)) field.value = previousValues.get(field.name);
  });

  const email = $('#hg-email', root);
  if (email && user?.email && !email.value) email.value = user.email;
}

function setMode(next) {
  mode = ['login', 'signup', 'reset', 'update', 'set-password'].includes(next) ? next : 'login';
  notice = '';
  noticeType = 'info';
  busy = false;
  renderGateIntoRoot();
  const target = $('#hg-email') || $('#hg-password');
  target?.focus({ preventScroll: true });
}

async function handleSubmit(form) {
  if (!supabase || busy) return;
  const data = new FormData(form);
  const email = String(data.get('email') || '').trim().toLowerCase();
  const password = String(data.get('password') || '');
  const name = normalizeDisplayName(data.get('display_name'), '');
  const stage = normalizeStage(data.get('stage'), '');
  const token = normalizeOtp(data.get('token'));
  if (mode === 'verify' && !/^\d{6,10}$/.test(token)) return setNotice('کد باید بین ۶ تا ۱۰ رقم باشد.', 'error');
  if (!['update', 'set-password', 'verify'].includes(mode) && !email) return setNotice('ایمیل را وارد کن.', 'error');
  if (['update', 'set-password', 'login'].includes(mode) && password.length < 8) return setNotice('رمز عبور باید دست‌کم ۸ نویسه داشته باشد.', 'error');
  busy = true;
  notice = '';
  renderGateIntoRoot();
  try {
    if (mode === 'signup') {
      if(!stage) return setNotice('پایهٔ تحصیلی را وارد کن.', 'error');
      pendingEmail = email; pendingName = name; pendingStage=stage; pendingMode = 'signup';
      const emailRedirectTo = `${location.origin}${location.pathname}`;
      const { error } = await withDeadline(supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo, data: { display_name: name, stage } } }), 'ارسال ایمیل تأیید');
      if (error) throw error;
      mode = 'verify'; setNotice('ایمیل تأیید فرستاده شد. اگر کد می‌بینی، آن را وارد کن؛ اگر پیوند می‌بینی، روی آن بزن تا وارد شوی.', 'info');
    } else if (mode === 'login') {
      const { data: loginData, error } = await withDeadline(supabase.auth.signInWithPassword({ email, password }), 'ورود به حساب');
      if (error) throw error;
      await acceptSession(loginData?.session, { showWebPromo: true });
    } else if (mode === 'verify') {
      const recoveryCode = pendingMode === 'recovery';
      deferSignInHydration = pendingMode === 'signup';
      const verification = recoveryCode
        ? supabase.auth.verifyOtp({ email: pendingEmail, token, type: 'recovery' })
        : supabase.auth.verifyOtp({ email: pendingEmail, token, type: 'email' });
      const { data: response, error } = await withDeadline(verification, 'تأیید کد');
      if (error) throw error;
      if (!response.session) throw new Error('کد تأیید شد اما نشست ورود دریافت نشد. دوباره درخواست کد بده.');
      if (recoveryCode) {
        user = response.session.user;
        mode = 'update';
        setGateOpen(true);
        setNotice('ایمیل تأیید شد. حالا رمز عبور جدیدت را ثبت کن.', 'info');
      } else if (pendingMode === 'signup') {
        user = response.session.user;
        pendingMode = 'set-password';
        mode = 'set-password';
        setGateOpen(true);
        setNotice('ایمیلت تأیید شد. حالا رمز ورودت را بساز.', 'info');
      } else {
        await acceptSession(response.session, { showWebPromo: true });
        pendingEmail = ''; pendingName = '';
      }
    } else if (mode === 'reset') {
      const redirectTo = `${location.origin}${location.pathname}`;
      const { error } = await withDeadline(
        supabase.auth.resetPasswordForEmail(email, { redirectTo }),
        'بازیابی رمز عبور'
      );
      if (error) throw error;
      pendingEmail = email; pendingName = ''; pendingMode = 'recovery';
      mode = 'verify';
      setNotice('اگر این ایمیل به حسابی متصل باشد، کد بازیابی ارسال شده است. فقط کد تازه‌ترین ایمیل را وارد کن.', 'info');
    } else if (mode === 'update' || mode === 'set-password') {
      const creatingPassword = mode === 'set-password';
      const { error } = await withDeadline(
        supabase.auth.updateUser({ password }),
        creatingPassword ? 'ساخت رمز عبور' : 'تغییر رمز عبور'
      );
      if (error) throw error;
      if (creatingPassword) {
        const { data: sessionData, error: sessionError } = await withDeadline(supabase.auth.getSession(), 'دریافت نشست ورود');
        if (sessionError) throw sessionError;
        await acceptSession(sessionData?.session, { showWebPromo: true });
        pendingEmail = ''; pendingName = ''; pendingMode = 'login';
        deferSignInHydration = false;
      } else {
        setMode('login');
        setNotice('رمز عبور تغییر کرد. اکنون می‌توانی با ایمیل و رمز وارد شوی.', 'info');
      }
    }
  } catch (error) {
    if (mode === 'verify') deferSignInHydration = false;
    const message = String(error?.message || 'عملیات ناموفق بود.');
    const friendly = error?.name === 'TimeoutError' || /timed out|timeout|deadline/i.test(message)
      ? 'پاسخ سرور به‌موقع نرسید. اتصال اینترنت را بررسی کن و دوباره تلاش کن.'
      : /failed to fetch|network|fetch|abort/i.test(message)
        ? 'ارتباط با سرور برقرار نشد. اینترنت را بررسی کن و دوباره تلاش کن.'
        : /invalid login credentials/i.test(message) && mode === 'login' ? 'ایمیل یا رمز عبور درست نیست. اگر قبلاً با کد وارد می‌شدی، از «رمزم را فراموش کرده‌ام» رمز بساز.'
        : /invalid token|token has expired|otp_expired/i.test(message) ? 'این کد معتبر نیست یا با درخواست کد تازه باطل شده است. تازه‌ترین ایمیل را باز کن؛ اگر چند کد درخواست کردی، فقط آخرین کد را وارد کن. پس از درخواست کد جدید دست‌کم ۶۰ ثانیه صبر کن.'
        : /email not confirmed/i.test(message) ? 'ایمیل هنوز تأیید نشده است؛ صندوق ایمیلت را بررسی کن.'
        : /user already registered/i.test(message) ? 'این ایمیل قبلاً ثبت شده است؛ وارد حساب شو.'
        : `عملیات انجام نشد: ${message}`;
    setNotice(friendly, 'error');
  } finally {
    busy = false;
    // Profile hydration can fail after Supabase has already created a session.
    // Release the submit control whenever the authentication gate is still visible.
    const gate = document.getElementById(GATE_ID);
    if (gate && !gate.hidden) renderGateIntoRoot();
  }
}

function setNotice(message, type = 'info') {
  notice = message;
  noticeType = type;
  renderGateIntoRoot();
}

async function editProfile() {
  if (!user || !supabase || busy) return;
  const currentName = profile?.display_name || '';
  const enteredName = window.prompt('نام نمایشی هم‌قدم:', currentName);
  if (enteredName === null) return;
  const display_name = normalizeDisplayName(enteredName, '');
  if (display_name.length > 60) return showLegacyToast('نام نمایشی حداکثر ۶۰ نویسه است.');
  const stage = normalizeStage(window.prompt('پایه یا مرحلهٔ تحصیلی:', profile?.stage || 'پایه یک'), profile?.stage || 'پایه یک');
  if (stage.length > 60) return showLegacyToast('عنوان مرحله حداکثر ۶۰ نویسه است.');
  busy = true;
  try {
    const { data, error } = await supabase.from('profiles').update({ display_name, stage, stage_confirmed:true }).eq('id', user.id).select(PROFILE_COLUMNS).single();
    if (error) throw error;
    profile = data;
    applyProfileToLegacyState(profile);
    ensureAccountBox();
    showLegacyToast('پروفایل روی سرور ذخیره شد.');
  } catch (error) {
    showLegacyToast(`پروفایل ذخیره نشد: ${error?.message || 'خطای سرور'}`);
  } finally { busy = false; }
}

async function chooseProfilePhoto(){
  if(!user||!supabase)return;
  const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.hidden=true;document.body.append(input);input.click();
  input.addEventListener('change',async()=>{try{const file=input.files?.[0];if(!file)return;if(file.size>5*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type)){showLegacyToast('عکس باید PNG، JPG یا WebP و حداکثر ۵ مگابایت باشد.');return;}const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg',path=`${user.id}/avatar.${ext}`;const {error:uploadError}=await supabase.storage.from('profile-avatars').upload(path,file,{upsert:true,contentType:file.type,cacheControl:'60'});if(uploadError)throw uploadError;const {data,error}=await supabase.from('profiles').update({avatar_path:path}).eq('id',user.id).select(PROFILE_COLUMNS).single();if(error)throw error;profile=data;ensureAccountBox();document.dispatchEvent(new CustomEvent('hgd:profile-updated',{detail:{userId:user.id,avatarPath:path}}));showLegacyToast('عکس پروفایل ذخیره شد و در گفت‌وگوها نمایش داده می‌شود.');}catch(error){showLegacyToast(`عکس ذخیره نشد: ${error?.message||'خطای سرور'}`);}finally{input.remove();}});
}

async function logout() {
  if (!supabase || busy) return;
  busy = true;
  try {
    await unregisterPushDevice();
    const { error } = await withDeadline(supabase.auth.signOut(), 'خروج از حساب');
    if (error) throw error;
  } catch (error) {
    busy = false;
    showLegacyToast(`خروج انجام نشد: ${error?.message || 'خطا'}`);
  }
}

async function syncPreferences(payload) {
  if (!supabase || !user) return;
  const update = {
    display_name: normalizeDisplayName(payload.display_name, ''),
      stage: normalizeStage(payload.stage, 'پایه یک'),
    free_minutes: normalizeFreeMinutes(payload.free_minutes, 60),
    study_style: normalizeStudyStyle(payload.study_style, 'ترکیبی'),
  };
  try {
    const { data, error } = await supabase.from('profiles').update(update).eq('id', user.id).select(PROFILE_COLUMNS).single();
    if (error) throw error;
    profile = data;
    applyProfileToLegacyState(profile);
    ensureAccountBox();
  } catch (error) {
    showLegacyToast(`تنظیمات محلی ذخیره شد، اما همگام‌سازی سرور ناموفق بود: ${error?.message || 'خطای شبکه'}`);
  }
}

function mount() {
  let root = document.getElementById(GATE_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = GATE_ID;
    root.hidden = true;
    document.body.append(root);
  }
  if (!isSupabaseConfigured || !supabase) {
    setGateOpen(true);
    renderGateIntoRoot();
    return;
  }

  document.addEventListener('click', (event) => {
    const modeButton = event.target.closest('[data-hg-mode]');
    if (modeButton && root.contains(modeButton)) { setMode(modeButton.dataset.hgMode); return; }
    const action = event.target.closest('[data-hg-action]')?.dataset.hgAction;
    if (action === 'refresh' && root.contains(event.target.closest('[data-hg-action="refresh"]'))) {
      // A full reload reinitializes Supabase and rechecks any session persisted during a stalled request.
      window.location.reload();
      return;
    }
    if (action === 'profile') void editProfile();
    else if (action === 'photo') void chooseProfilePhoto();
    else if (action === 'logout') void logout();
    else if (action === 'resend-code' && mode === 'verify' && pendingEmail) {
      busy = true; setNotice('در حال ارسال دوباره…');
      const resend = withDeadline(pendingMode === 'recovery'
        ? supabase.auth.resetPasswordForEmail(pendingEmail, { redirectTo: `${location.origin}${location.pathname}` })
        : supabase.auth.signInWithOtp({ email: pendingEmail, options: { shouldCreateUser: pendingMode === 'signup', emailRedirectTo: `${location.origin}${location.pathname}`, ...(pendingName ? { data: { display_name: pendingName, stage: pendingStage } } : {}) } }), 'ارسال دوبارهٔ ایمیل');
      void resend
        .then(({ error }) => { if (error) throw error; setNotice('ایمیل تازه ارسال شد.', 'info'); })
        .catch((error) => setNotice(`ارسال کد ناموفق بود: ${error?.message || 'خطای شبکه'}`, 'error'))
        .finally(() => { busy = false; renderGateIntoRoot(); });
    }
  });
  document.addEventListener('submit', (event) => {
    if (event.target?.id === 'hg-auth-form') { event.preventDefault(); void handleSubmit(event.target); }
  });

  // Capture the values before the legacy settings handler rerenders its form.
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (form instanceof HTMLFormElement && form.dataset.form === 'preferences' && user) {
      const payload = profilePayload(new FormData(form), profile || {});
      setTimeout(() => void syncPreferences(payload), 0);
    }
  }, true);

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && deferSignInHydration) return;
    if (event === 'USER_UPDATED') deferSignInHydration = false;
    if (event === 'PASSWORD_RECOVERY') {
      mode = 'update'; notice = 'برای ادامه، رمز عبور تازه را ثبت کن.'; noticeType = 'info';
      setGateOpen(true); renderGateIntoRoot(); return;
    }
    // Do not await Supabase queries inside the auth callback; that can stall auth's internal lock.
    setTimeout(() => void acceptSession(session, { showWebPromo: event === 'SIGNED_IN' }), 0);
  });

  setGateOpen(true);
  renderGateIntoRoot();
  void withDeadline(supabase.auth.getSession(), 'بررسی نشست')
    .then(({ data, error }) => {
      if (error) setNotice(`خواندن نشست انجام نشد: ${error.message}`, 'error');
      void acceptSession(data?.session || null);
    }).catch((error) => {
      const timedOut = error?.name === 'TimeoutError' || /timed out|timeout|deadline/i.test(String(error?.message || ''));
      setNotice(timedOut
        ? 'بررسی اتصال بیش از حد طول کشید. اینترنت را بررسی کن و دوباره تلاش کن.'
        : `اتصال ورود ناموفق بود: ${error?.message || 'خطای شبکه'}`, 'error');
    });
}

mount();

