import { makeStudyPlan, parseStudyTopics } from "./smart-planner-core.mjs";

const STORE_KEY = "rahe-talabegi-v1";
const CARD_ID = "hg-smart-planner-card";
const FORM_ID = "hg-smart-planner-form";
let previewState = null;
let observer = null;
const DAYS = [
  { value: 6, label: "شنبه", checked: true },
  { value: 0, label: "یکشنبه", checked: true },
  { value: 1, label: "دوشنبه", checked: true },
  { value: 2, label: "سه‌شنبه", checked: true },
  { value: 3, label: "چهارشنبه", checked: true },
  { value: 4, label: "پنجشنبه", checked: true },
  { value: 5, label: "جمعه", checked: false },
];

function todayISO() {
  const date = new Date();
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0");
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}
function readStoredState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
function getLiveState() {
  try {
    if (typeof state !== "undefined" && state && Array.isArray(state.tasks)) return state;
  } catch {
    // Some app shells keep their state in a script scope not visible to modules.
  }
  return null;
}
function currentState() {
  return getLiveState() || readStoredState();
}
function activePage() {
  const app = currentState();
  return app && app.ui && app.ui.page === "planner";
}
function appendStyles() {
  if (document.getElementById("hg-smart-planner-style")) return;
  const style = document.createElement("style");
  style.id = "hg-smart-planner-style";
  style.textContent = [
    ".hg-sp-card{margin:0 0 14px;border:1px solid var(--line);border-radius:18px;background:var(--paper);padding:16px;box-shadow:var(--shadow)}",
    ".hg-sp-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}",
    ".hg-sp-heading h3{margin:0 0 4px;font-size:16px}.hg-sp-heading p{margin:0;color:var(--muted);font-size:12px;max-width:850px}",
    ".hg-sp-tag{white-space:nowrap;display:inline-flex;align-items:center;border:1px solid var(--line);border-radius:999px;padding:4px 9px;color:var(--muted);font-size:10px}",
    ".hg-sp-guide{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:13px 0;font-size:12px;line-height:1.9}",
    ".hg-sp-guide code{direction:ltr;unicode-bidi:plaintext;display:block;white-space:pre-wrap;overflow-wrap:anywhere;font-family:Tahoma,sans-serif;font-size:12px}",
    ".hg-sp-field{display:grid;gap:5px;min-width:0;font-size:12px;color:var(--muted)}",
    ".hg-sp-field input,.hg-sp-field select,.hg-sp-field textarea{width:100%;min-width:0;border:1px solid var(--line);border-radius:10px;padding:9px 10px;color:var(--ink);background:var(--paper);font:inherit;font-size:13px}",
    ".hg-sp-field textarea{min-height:120px;resize:vertical;line-height:1.9}.hg-sp-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.hg-sp-form{display:grid;gap:12px}",
    ".hg-sp-days{display:flex;flex-wrap:wrap;gap:7px}.hg-sp-day{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:9px;padding:6px 9px;font-size:11px}.hg-sp-day input{accent-color:var(--teal)}",
    ".hg-sp-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.hg-sp-actions button{border:1px solid var(--line);border-radius:10px;padding:8px 12px;background:var(--paper);color:var(--ink);font:inherit;font-size:12px;cursor:pointer}.hg-sp-actions .primary{background:var(--teal);color:white;border-color:var(--teal)}.hg-sp-actions button:disabled{opacity:.48;cursor:not-allowed}",
    ".hg-sp-result{margin-top:12px}.hg-sp-result:empty{display:none}.hg-sp-summary{font-size:12px;line-height:1.9;padding:10px 12px;border-radius:11px;background:var(--soft);border:1px solid var(--line)}",
    ".hg-sp-warning{margin-top:8px;color:var(--muted);font-size:11px;line-height:1.8}.hg-sp-error{color:#9b3048}.hg-sp-list{display:grid;gap:6px;margin-top:9px}.hg-sp-item{display:grid;grid-template-columns:170px minmax(0,1fr);gap:9px;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:11px}.hg-sp-time{color:var(--teal);font-weight:700;direction:ltr;text-align:right;white-space:nowrap}.hg-sp-item b{font-weight:700;overflow-wrap:anywhere}.hg-sp-small{color:var(--muted);font-size:10px}",
    "@media(max-width:850px){.hg-sp-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.hg-sp-card{padding:12px}.hg-sp-grid{grid-template-columns:1fr 1fr}.hg-sp-item{grid-template-columns:1fr;gap:2px}.hg-sp-time{text-align:right}}",
  ].join("\n");
  document.head.append(style);
}
function field(label, id, type, value, attributes) {
  return '<label class="hg-sp-field" for="' + id + '">' + label +
    '<input id="' + id + '" name="' + id + '" type="' + type + '" value="' + escapeHTML(value) + '" ' +
    (attributes || "") + "></label>";
}
function collectConfig() {
  const byId = (id) => document.getElementById(id);
  const topics = parseStudyTopics(byId("hg-sp-topics").value);
  const activeDays = Array.from(document.querySelectorAll("#" + FORM_ID + " input[name='hg-sp-day']:checked"))
    .map((input) => Number(input.value));
  if (!activeDays.length) throw new Error("حداقل یک روز هفته را انتخاب کن.");
  const app = currentState();
  return {
    topics,
    startDate: byId("hg-sp-start-date").value,
    days: Number(byId("hg-sp-days").value),
    dailyMinutes: Number(byId("hg-sp-daily-minutes").value),
    sessionMinutes: Number(byId("hg-sp-session-minutes").value),
    breakMinutes: Number(byId("hg-sp-break-minutes").value),
    startTime: byId("hg-sp-start-time").value,
    endTime: byId("hg-sp-end-time").value,
    activeDays,
    existingTasks: Array.isArray(app && app.tasks) ? app.tasks : [],
  };
}
function collectConfigSnapshot() {
  const ids = [
    "hg-sp-topics", "hg-sp-start-date", "hg-sp-days", "hg-sp-daily-minutes",
    "hg-sp-session-minutes", "hg-sp-break-minutes", "hg-sp-start-time", "hg-sp-end-time",
  ];
  const values = ids.map((id) => {
    const element = document.getElementById(id);
    return element ? element.value : "";
  });
  values.push(Array.from(document.querySelectorAll("#" + FORM_ID + " input[name='hg-sp-day']:checked"))
    .map((element) => element.value).sort());
  return values;
}
function showError(message) {
  const result = document.getElementById("hg-sp-result");
  const saveButton = document.getElementById("hg-sp-save");
  previewState = null;
  if (saveButton) saveButton.disabled = true;
  if (!result) return;
  result.replaceChildren();
  const box = document.createElement("div");
  box.className = "hg-sp-summary hg-sp-error";
  box.setAttribute("role", "alert");
  box.textContent = message;
  result.append(box);
}
function renderPreview(plan, id) {
  const result = document.getElementById("hg-sp-result");
  if (!result) return;
  result.replaceChildren();
  const summary = document.createElement("div");
  summary.className = "hg-sp-summary";
  summary.textContent = "پیش‌نمایش: " + plan.scheduledSessions + " نشست، " +
    plan.scheduledMinutes + " دقیقه مطالعه در " + plan.activeDaysUsed + " روز. " +
    (plan.unscheduledMinutes ? plan.unscheduledMinutes + " دقیقه از کارها در این بازه جا نمی‌شود." : "تمام مباحث در بازه جا شده‌اند.");
  result.append(summary);
  if (plan.unscheduledTopics.length) {
    const warning = document.createElement("div");
    warning.className = "hg-sp-warning";
    warning.textContent = "باقی‌مانده: " + plan.unscheduledTopics.map((item) =>
      item.title + " (" + item.minutes + " دقیقه)"
    ).join("؛ ") + ". روزهای بیشتری انتخاب کن، ظرفیت روزانه را افزایش بده یا بازهٔ زمانی را گسترده‌تر کن.";
    result.append(warning);
  }
  const list = document.createElement("div");
  list.className = "hg-sp-list";
  for (const task of plan.tasks.slice(0, 24)) {
    const item = document.createElement("div");
    item.className = "hg-sp-item";
    const time = document.createElement("div");
    time.className = "hg-sp-time";
    time.textContent = task.date + " · " + task.start + " تا " + task.end;
    const detail = document.createElement("div");
    const title = document.createElement("b");
    title.textContent = task.title;
    detail.append(title);
    const meta = document.createElement("div");
    meta.className = "hg-sp-small";
    meta.textContent = task.priority + " اولویت · " + task.topicMinutes + " دقیقه";
    detail.append(meta);
    item.append(time, detail);
    list.append(item);
  }
  if (plan.tasks.length > 24) {
    const more = document.createElement("div");
    more.className = "hg-sp-small";
    more.textContent = "و " + (plan.tasks.length - 24) + " نشست دیگر…";
    list.append(more);
  }
  result.append(list);
  const saveButton = document.getElementById("hg-sp-save");
  if (saveButton) saveButton.disabled = plan.tasks.length === 0;
  previewState = { plan, id, configSnapshot: JSON.stringify(collectConfigSnapshot()) };
}
function makeId() {
  try {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") return "smart-task-" + globalThis.crypto.randomUUID();
  } catch {
    // Fallback for webviews without randomUUID.
  }
  return "smart-task-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
function persistPlan(plan, planId) {
  const live = getLiveState();
  const stored = live || readStoredState();
  if (!stored || !Array.isArray(stored.tasks)) throw new Error("اطلاعات برنامه‌ریز پیدا نشد؛ صفحه را تازه‌سازی کن.");
  if (stored.tasks.some((task) => task && task.smartPlanId === planId)) {
    throw new Error("این پیش‌نمایش قبلاً ثبت شده است؛ یک پیش‌نمایش تازه بساز.");
  }
  const tasks = plan.tasks.map((task) => ({
    ...task,
    id: makeId(),
    smartPlanId: planId,
    smartGenerated: true,
    sample: false,
    createdAt: new Date().toISOString(),
  }));
  stored.tasks.push(...tasks);
  let saved = false;
  try {
    if (typeof save === "function") saved = save() !== false;
  } catch {
    saved = false;
  }
  if (!saved) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(stored));
      saved = true;
    } catch {
      saved = false;
    }
  }
  if (!saved) throw new Error("ذخیره‌سازی ناموفق بود؛ فضای مرورگر یا اجازهٔ ذخیره را بررسی کن.");
  previewState = null;
  try {
    if (typeof toast === "function") toast(tasks.length + " نشست به برنامه اضافه شد.");
    else {
      const toastNode = document.getElementById("toast");
      if (toastNode) {
        toastNode.textContent = tasks.length + " نشست به برنامه اضافه شد.";
        toastNode.classList.remove("hide");
      }
    }
  } catch {
    // The saved tasks are more important than an optional notification.
  }
  try {
    if (typeof window.render === "function") {
      window.render();
      return;
    }
  } catch {
    // Reload if the legacy renderer is unavailable.
  }
  window.location.reload();
}
function mount() {
  const main = document.getElementById("main");
  if (!main || !activePage() || document.getElementById(CARD_ID)) return;
  const app = currentState();
  const minutes = Math.max(15, Math.min(600, Number(app && app.profile && app.profile.freeMinutes) || 60));
  const card = document.createElement("section");
  card.id = CARD_ID;
  card.className = "hg-sp-card";
  card.innerHTML = [
    '<div class="hg-sp-heading"><div><h3>🧠 برنامه‌ساز هوشمند مطالعه</h3>',
    '<p>برای هر مبحث زمان و اولویت مشخص کن؛ پیش‌نیازها، ظرفیت روزانه و تداخل با فعالیت‌های ثبت‌شده بررسی می‌شوند. برنامه‌سازی روی همین دستگاه انجام می‌شود.</p></div>',
    '<span class="hg-sp-tag">پیش‌نمایش قبل از ثبت</span></div>',
    '<div class="hg-sp-guide">هر سطر: <b>عنوان | دقیقهٔ کل | اولویت | پیش‌نیازها</b>؛ پیش‌نیازها را با ویرگول جدا کن. اگر نام پیش‌نیاز در همین فهرست باشد، ابتدا آن مبحث برنامه‌ریزی می‌شود.',
    '<code>صرف ساده | 120 | زیاد\nنحو | 180 | زیاد | صرف ساده\nتجوید | 90 | متوسط</code>',
    '<div class="hg-sp-small">اگر زمان یا اولویت ننویسی، پیش‌فرض به‌ترتیب ۶۰ دقیقه و متوسط است. پیش‌نیازهای خارج از فهرست، از قبل آموخته‌شده فرض می‌شوند.</div></div>',
    '<form id="' + FORM_ID + '" class="hg-sp-form">',
    '<label class="hg-sp-field" for="hg-sp-topics">فهرست درس‌ها و مباحث',
    '<textarea id="hg-sp-topics" name="topics" required placeholder="مثلاً:\nصرف ساده | 120 | زیاد\nنحو | 180 | زیاد | صرف ساده"></textarea></label>',
    '<div class="hg-sp-grid">',
    field("تاریخ شروع", "hg-sp-start-date", "date", todayISO(), "required"),
    '<label class="hg-sp-field" for="hg-sp-days">مدت برنامه<select id="hg-sp-days" name="days"><option value="7">۷ روز</option><option value="14" selected>۱۴ روز</option><option value="21">۲۱ روز</option><option value="28">۲۸ روز</option><option value="42">۴۲ روز</option><option value="60">۶۰ روز</option></select></label>',
    field("ظرفیت مطالعهٔ روزانه (دقیقه)", "hg-sp-daily-minutes", "number", String(minutes), 'min="15" max="600" required'),
    field("حداکثر طول هر نشست (دقیقه)", "hg-sp-session-minutes", "number", "40", 'min="15" max="120" required'),
    field("استراحت بین نشست‌ها (دقیقه)", "hg-sp-break-minutes", "number", "10", 'min="0" max="60" required'),
    field("شروع بازهٔ آزاد", "hg-sp-start-time", "time", "20:30", "required"),
    field("پایان بازهٔ آزاد", "hg-sp-end-time", "time", "22:30", "required"),
    "</div>",
    '<div class="hg-sp-field"><span>روزهای مجاز برنامه‌ریزی</span><div class="hg-sp-days">',
    DAYS.map((day) => '<label class="hg-sp-day"><input type="checkbox" name="hg-sp-day" value="' + day.value + '"' + (day.checked ? " checked" : "") + '> ' + day.label + "</label>").join(""),
    "</div></div>",
    '<div class="hg-sp-actions"><button type="submit" class="primary">ساخت پیش‌نمایش</button><button id="hg-sp-save" type="button" disabled>ثبت نشست‌ها در برنامه</button></div>',
    '<div id="hg-sp-result" class="hg-sp-result" aria-live="polite"></div>',
    "</form>",
  ].join("");
  appendStyles();
  const pageHead = main.querySelector(".pagehead");
  if (pageHead) pageHead.insertAdjacentElement("afterend", card);
  else main.insertAdjacentElement("afterbegin", card);

  const form = document.getElementById(FORM_ID);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const config = collectConfig();
      const plan = makeStudyPlan(config);
      const id = "smart-plan-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
      renderPreview(plan, id);
    } catch (error) {
      showError(String(error && error.message || "ساخت پیش‌نمایش ناموفق بود."));
    }
  });
  form.addEventListener("input", () => {
    previewState = null;
    const saveButton = document.getElementById("hg-sp-save");
    if (saveButton) saveButton.disabled = true;
  });
  form.addEventListener("change", (event) => {
    if (event.target && event.target.name === "hg-sp-day") {
      previewState = null;
      const saveButton = document.getElementById("hg-sp-save");
      if (saveButton) saveButton.disabled = true;
    }
  });
  document.getElementById("hg-sp-save").addEventListener("click", () => {
    if (!previewState) {
      showError("ابتدا پیش‌نمایش تازه‌ای بساز.");
      return;
    }
    if (previewState.configSnapshot !== JSON.stringify(collectConfigSnapshot())) {
      showError("تنظیمات تغییر کرده است؛ پیش از ثبت، پیش‌نمایش تازه بساز.");
      return;
    }
    try {
      persistPlan(previewState.plan, previewState.id);
    } catch (error) {
      showError(String(error && error.message || "ثبت برنامه ناموفق بود."));
    }
  });
}
function startObserver() {
  appendStyles();
  const main = document.getElementById("main");
  if (!main || observer) return;
  observer = new MutationObserver(() => {
    if (activePage()) mount();
  });
  observer.observe(main, { childList: true, subtree: true });
  mount();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startObserver, { once: true });
} else {
  startObserver();
}
