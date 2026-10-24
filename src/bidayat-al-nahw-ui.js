import { BIDAYAT_AL_NAHW } from './bidayat-al-nahw-catalog.mjs';
import './bidayat-al-nahw-ui.css';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const flatText = (value) => String(value ?? '').normalize('NFC').toLocaleLowerCase();
let overlay;
let searchInput;
let countLabel;
let detail;
let selectedTopic = null;

function renderChapter(chapter, query) {
  const filtered = chapter.topics.filter((topic) => !query || flatText(`${topic.titleArabic} ${topic.titlePersian}`).includes(query));
  if (query && !flatText(`${chapter.titleArabic} ${chapter.titlePersian}`).includes(query) && !filtered.length) return '';
  const showAll = !query || flatText(`${chapter.titleArabic} ${chapter.titlePersian}`).includes(query);
  const topics = showAll ? chapter.topics : filtered;
  return `<details class="hg-bidayat-chapter" ${query ? 'open' : ''}>
    <summary class="hg-bidayat-summary"><span><span class="hg-bidayat-chapter-title" lang="ar" dir="rtl">${escapeHtml(chapter.titleArabic)}</span><span class="hg-bidayat-chapter-sub">${escapeHtml(chapter.titlePersian)}</span></span></summary>
    <div class="hg-bidayat-topics">${topics.map((topic) => `<button class="hg-bidayat-topic" type="button" data-hg-topic="${escapeHtml(topic.id)}"><span class="hg-bidayat-topic-ar" lang="ar" dir="rtl">${escapeHtml(topic.titleArabic)}</span><span class="hg-bidayat-topic-fa">${escapeHtml(topic.titlePersian)}</span></button>`).join('')}</div>
  </details>`;
}

function updateDetail(topic) {
  selectedTopic = topic;
  if (!topic) { detail.hidden = true; detail.innerHTML = ''; return; }
  const chapter = BIDAYAT_AL_NAHW.chapters.find((item) => item.id === topic.chapterId);
  detail.innerHTML = `<h3 lang="ar" dir="rtl">${escapeHtml(topic.titleArabic)}</h3><div class="fa-title">${escapeHtml(topic.titlePersian)}${chapter ? ` · ${escapeHtml(chapter.titlePersian)}` : ''}</div><p>این عنوان از فهرست عربی کتاب «بداية النحو» برداشته شده است. شرح، مثال و اعرابِ این درس هنوز باید با متن عربی همان مبحث تطبیق داده شود؛ برای جلوگیری از نسبت‌دادن توضیح نادقیق به مؤلف، در این مرحله محتوای تألیفیِ تأییدنشده نمایش داده نمی‌شود.</p><div class="source-label">وضعیت منبع: عنوان فهرست ثبت شده؛ متن درس هنوز صفحه‌به‌صفحه بررسی نشده است.</div>`;
  detail.hidden = false;
  detail.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});
}

function renderCatalog() {
  const query = flatText(searchInput.value.trim());
  const chaptersHtml = BIDAYAT_AL_NAHW.chapters.map((chapter) => renderChapter(chapter, query)).filter(Boolean).join('');
  const count = BIDAYAT_AL_NAHW.chapters.reduce((total, chapter) => total + chapter.topics.filter((topic) => !query || flatText(`${topic.titleArabic} ${topic.titlePersian} ${chapter.titleArabic} ${chapter.titlePersian}`).includes(query)).length, 0);
  countLabel.textContent = `${count.toLocaleString('fa-IR')} عنوان`;
  const grid = overlay.querySelector('.hg-bidayat-grid');
  grid.innerHTML = chaptersHtml || '<div class="hg-bidayat-note">عنوانی پیدا نشد. عبارت عربی یا فارسی کوتاه‌تری جست‌وجو کن.</div>';
  if (selectedTopic) {
    const stillExists = [...grid.querySelectorAll('[data-hg-topic]')].some((button) => button.dataset.hgTopic === selectedTopic.id);
    if (!stillExists) updateDetail(null);
  }
}

function open() {
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';
  renderCatalog();
  searchInput.focus({preventScroll:true});
}
function close() {
  overlay.hidden = true;
  document.body.style.overflow = '';
  document.getElementById('hg-bidayat-launch')?.focus({preventScroll:true});
}

function mount() {
  const actions = document.querySelector('.topbar .topactions');
  if (!actions || document.getElementById('hg-bidayat-launch')) return;
  const launch = document.createElement('button');
  launch.type = 'button';
  launch.id = 'hg-bidayat-launch';
  launch.innerHTML = '<span class="hg-book-mark" aria-hidden="true">ق</span><span>کتاب بدایة النحو</span>';
  launch.setAttribute('aria-haspopup', 'dialog');
  actions.prepend(launch);

  overlay = document.createElement('div');
  overlay.id = 'hg-bidayat-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `<section class="hg-bidayat-window" role="dialog" aria-modal="true" aria-labelledby="hg-bidayat-dialog-title">
    <header class="hg-bidayat-head"><div><div class="hg-bidayat-eyebrow">کتاب‌خانهٔ علمی هم‌قدم · بررسی بر پایهٔ منبع عربی</div><h2 id="hg-bidayat-dialog-title">فهرست و مسیر مطالعه</h2><div class="hg-bidayat-ar-title" lang="ar" dir="rtl">بداية النحو</div><p>عنوان‌ها از فهرست نسخهٔ اسکن‌شده استخراج شده‌اند. نام عربی اصل حفظ می‌شود و توضیح فارسی فقط پس از بررسی متن همان مبحث افزوده خواهد شد.</p></div><button class="hg-bidayat-close" type="button" data-hg-close>✕ بستن</button></header>
    <div class="hg-bidayat-tools"><input class="hg-bidayat-search" type="search" placeholder="جست‌وجو به عربی یا فارسی… مثل المبتدأ، فاعل، اعراب" aria-label="جست‌وجوی عنوان‌های کتاب"><span class="hg-bidayat-count"></span></div>
    <div class="hg-bidayat-content"><div class="hg-bidayat-note"><b>دقت علمی:</b> این PDF اسکن‌شده است. صفحه‌های نمایشگر PDF با شماره‌های چاپی کتاب یکی فرض نشده‌اند و شمارهٔ صفحه برای مبحثی که به‌صورت بصری تطبیق نشده، نمایش داده نمی‌شود. این بخش در حال حاضر فهرست ناوبری است، نه ادعای ارائهٔ شرح کامل درس.</div><div class="hg-bidayat-grid"></div></div>
    <section class="hg-bidayat-topic-detail" hidden aria-live="polite"></section>
    <footer class="hg-bidayat-footer"><span class="hg-bidayat-status">متن مرجع: عربی · توضیح آموزشی: پس از تطبیق منبع</span><span>نسخهٔ آغازین فهرست · هم‌قدم</span></footer>
  </section>`;
  document.body.append(overlay);
  searchInput = overlay.querySelector('.hg-bidayat-search');
  countLabel = overlay.querySelector('.hg-bidayat-count');
  detail = overlay.querySelector('.hg-bidayat-topic-detail');
  launch.addEventListener('click', open);
  searchInput.addEventListener('input', renderCatalog);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target.closest('[data-hg-close]')) { close(); return; }
    const topicButton = event.target.closest('[data-hg-topic]');
    if (topicButton) {
      const topic = BIDAYAT_AL_NAHW.chapters.flatMap((chapter) => chapter.topics.map((item) => ({...item, chapterId:chapter.id}))).find((item) => item.id === topicButton.dataset.hgTopic);
      updateDetail(topic || null);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (!overlay.hidden && event.key === 'Escape') close();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, {once:true});
else mount();
