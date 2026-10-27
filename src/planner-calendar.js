import { findMoveConflicts, getCalendarDates, moveTaskDate } from "./planner-calendar-core.mjs";

const STORE_KEY = "rahe-talabegi-v1";
const CARD_ID = "hg-planner-calendar";
const WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
let mode = "month";
let anchorDate = todayISO();
let feedback = "";
let feedbackIsError = false;
let observer = null;

function todayISO() {
  const now = new Date();
  return now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
}
function readStoredState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && Array.isArray(parsed.tasks) ? parsed : null;
  } catch { return null; }
}
function liveState() {
  try {
    if (typeof state !== "undefined" && state && Array.isArray(state.tasks)) return state;
  } catch { /* The main app's state may not be visible in some webviews. */ }
  return null;
}
function currentState() { return liveState() || readStoredState(); }
function activePage() { return currentState()?.ui?.page === "planner"; }
function addStyles() {
  if (document.getElementById("hg-planner-calendar-css")) return;
  const style = document.createElement("style");
  style.id = "hg-planner-calendar-css";
  style.textContent = [
    ".hg-cal{margin:0 0 14px;border:1px solid var(--line);border-radius:18px;background:var(--paper);padding:14px;box-shadow:var(--shadow);min-width:0}",
    ".hg-cal-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.hg-cal-head h3{font-size:16px;margin:0}.hg-cal-head p{font-size:11px;color:var(--muted);margin:3px 0 0}",
    ".hg-cal-tools{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.hg-cal-tools button{border:1px solid var(--line);border-radius:9px;padding:6px 9px;background:var(--paper);color:var(--ink);font:inherit;font-size:11px}.hg-cal-tools button.active,.hg-cal-tools button.primary{background:var(--teal);border-color:var(--teal);color:white}",
    ".hg-cal-weekdays,.hg-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.hg-cal-weekday{text-align:center;font-size:10px;font-weight:bold;color:var(--muted);padding:4px 0}",
    ".hg-cal-day{border:1px solid var(--line);background:var(--paper);border-radius:9px;min-height:94px;padding:5px;min-width:0;display:flex;flex-direction:column;gap:3px}.hg-cal-day.outside{opacity:.48;background:var(--soft)}.hg-cal-day.today{border:2px solid var(--gold)}.hg-cal-day.dragover{outline:2px dashed var(--teal);outline-offset:-3px;background:var(--mint)}",
    ".hg-cal-daynum{font-size:11px;color:var(--muted);font-weight:700;display:flex;justify-content:space-between;gap:4px}.hg-cal-daynum small{font-size:9px;font-weight:normal}.hg-cal-events{display:grid;gap:3px;min-width:0}",
    ".hg-cal-event{border:1px solid #bdddd1;background:var(--mint);border-radius:6px;padding:3px 4px;display:grid;gap:2px;min-width:0;font-size:10px;line-height:1.5;overflow-wrap:anywhere}.hg-cal-event.done{opacity:.65;text-decoration:line-through}.hg-cal-event.sample{border-style:dashed}.hg-cal-event[draggable=true]{cursor:grab}.hg-cal-event strong{font-size:10px;font-weight:700}.hg-cal-event time{font-size:9px;direction:ltr;text-align:right;color:var(--muted)}",
    ".hg-cal-move{display:flex;gap:3px;align-items:center;flex-wrap:wrap}.hg-cal-move button{border:1px solid var(--line);border-radius:5px;background:var(--paper);color:var(--ink);font:inherit;font-size:9px;padding:2px 4px}.hg-cal-move input{width:100%;min-width:0;border:1px solid var(--line);border-radius:5px;padding:3px;font:inherit;font-size:9px;background:var(--paper);color:var(--ink)}.hg-cal-move input[hidden]{display:none}",
    ".hg-cal-more{font-size:9px;color:var(--muted);text-align:center}.hg-cal-status{font-size:11px;line-height:1.8;padding:8px 10px;border:1px solid var(--line);border-radius:9px;margin-top:9px;background:var(--soft);color:var(--muted)}.hg-cal-status.error{color:#9b3048;border-color:#dfabb4;background:#fff1f3}.dark .hg-cal-status.error{background:#3a2529;color:#f5c7cf;border-color:#6a3944}",
    ".hg-cal-summary{font-size:11px;color:var(--muted);margin-top:8px}.hg-cal-grid.week .hg-cal-day{min-height:230px}.hg-cal-grid.week .hg-cal-event{padding:6px}.hg-cal-grid.week .hg-cal-event strong{font-size:11px}",
    "@media(max-width:850px){.hg-cal{padding:10px}.hg-cal-grid{gap:3px}.hg-cal-day{min-height:84px;padding:3px}.hg-cal-event{font-size:9px;padding:2px}.hg-cal-grid.week{grid-template-columns:repeat(2,minmax(0,1fr))}.hg-cal-grid.week .hg-cal-day{min-height:130px}.hg-cal-weekdays{display:none}}",
    "@media(max-width:480px){.hg-cal-day{min-height:67px}.hg-cal-daynum{font-size:10px}.hg-cal-event time{font-size:8px}.hg-cal-grid.week{grid-template-columns:1fr}.hg-cal-grid.week .hg-cal-day{min-height:70px}.hg-cal-move input{font-size:10px}.hg-cal-head h3{font-size:14px}}",
  ].join("\n");
  document.head.append(style);
}
function formatDate(value, options = {}) {
  const date = new Date(value + "T12:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fa-IR-u-ca-gregory", { year: "numeric", month: "long", day: "numeric", ...options }).format(date);
}
function monthTitle(value) {
  const date = new Date(value + "T12:00:00");
  return new Intl.DateTimeFormat("fa-IR-u-ca-gregory", { year: "numeric", month: "long" }).format(date);
}
function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}
function persistState(app) {
  try {
    if (typeof save === "function" && app === liveState()) {
      const saved = save();
      if (saved === false) throw new Error("ذخیره‌سازی برنامه انجام نشد.");
      return;
    }
  } catch (error) {
    throw error;
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(app));
  } catch {
    throw new Error("ذخیره‌سازی مرورگر در دسترس نیست؛ فضای آزاد و اجازهٔ ذخیره را بررسی کن.");
  }
}
function showFeedback(message, isError = false) {
  feedback = message;
  feedbackIsError = isError;
  const target = document.getElementById("hg-cal-status");
  if (target) {
    target.textContent = message;
    target.classList.toggle("error", isError);
    target.hidden = !message;
  }
}
function moveTask(taskId, targetDate) {
  const app = currentState();
  if (!app || !Array.isArray(app.tasks)) return showFeedback("فعالیت‌های برنامه پیدا نشدند؛ صفحه را تازه‌سازی کن.", true);
  try {
    const result = moveTaskDate(app.tasks, taskId, targetDate);
    if (!result.moved) {
      const names = result.conflicts.map((task) => task.title || "فعالیت بدون عنوان").join("، ");
      return showFeedback("انتقال انجام نشد؛ ساعت این فعالیت با «" + names + "» تداخل دارد. ابتدا یکی از ساعت‌ها را تغییر بده.", true);
    }
    persistState(app);
    anchorDate = targetDate;
    showFeedback("تاریخ فعالیت به «" + formatDate(targetDate) + "» منتقل شد.");
    if (typeof render === "function") {
      render();
      return;
    }
    window.location.reload();
  } catch (error) {
    showFeedback(String(error?.message || "انتقال فعالیت انجام نشد."), true);
  }
}
function addTaskEvent(dayBox, task) {
  const item = node("div", "hg-cal-event" + (task.status === "done" ? " done" : "") + (task.sample ? " sample" : ""));
  item.dataset.taskId = String(task.id);
  item.dataset.taskDate = task.date || "";
  if (task.sample !== true) item.draggable = true;
  const title = node("strong", "", task.title || "فعالیت بدون عنوان");
  item.append(title);
  if (task.start || task.end) item.append(node("time", "", String(task.start || "—") + "–" + String(task.end || "—")));
  const move = node("div", "hg-cal-move");
  const button = node("button", "", "انتقال");
  button.type = "button";
  button.dataset.calMove = String(task.id);
  button.disabled = task.sample === true;
  button.title = "انتقال به تاریخ دیگر";
  const input = document.createElement("input");
  input.type = "date";
  input.value = task.date || todayISO();
  input.hidden = true;
  input.dataset.calDateFor = String(task.id);
  input.setAttribute("aria-label", "تاریخ جدید برای " + (task.title || "فعالیت"));
  move.append(button, input);
  item.append(move);
  dayBox.append(item);
}
function renderCalendar() {
  const card = document.getElementById(CARD_ID);
  if (!card) return;
  const app = currentState();
  const tasks = Array.isArray(app?.tasks) ? app.tasks.filter((task) => task && typeof task.date === "string") : [];
  const dates = getCalendarDates(anchorDate, mode);
  const anchorMonth = anchorDate.slice(0, 7);
  card.replaceChildren();

  const head = node("div", "hg-cal-head");
  const heading = document.createElement("div");
  heading.append(node("h3", "", "🗓 تقویم دیداری برنامه"));
  heading.append(node("p", "", "فعالیت را بکش و روی روز مقصد رها کن؛ در موبایل از دکمهٔ «انتقال» استفاده کن."));
  const tools = node("div", "hg-cal-tools");
  for (const [action, label, cls] of [["prev", "‹ قبلی", ""], ["today", "امروز", "primary"], ["next", "بعدی ›", ""]]) {
    const button = node("button", cls, label);
    button.type = "button";
    button.dataset.calAction = action;
    tools.append(button);
  }
  for (const [value, label] of [["week", "هفته"], ["month", "ماه"]]) {
    const button = node("button", value === mode ? "active" : "", label);
    button.type = "button";
    button.dataset.calMode = value;
    tools.append(button);
  }
  head.append(heading, tools);
  card.append(head);
  const titleDate = mode === "month" ? monthTitle(anchorDate) : formatDate(dates[0].date) + " تا " + formatDate(dates[6].date);
  card.append(node("div", "hg-cal-summary", titleDate + " · شروع هفته: شنبه"));

  const weekdays = node("div", "hg-cal-weekdays");
  WEEKDAYS.forEach((name) => weekdays.append(node("div", "hg-cal-weekday", name)));
  card.append(weekdays);
  const grid = node("div", "hg-cal-grid" + (mode === "week" ? " week" : ""));
  const today = todayISO();
  for (const day of dates) {
    const cell = node("div", "hg-cal-day" + (day.inAnchorMonth ? "" : " outside") + (day.date === today ? " today" : ""));
    cell.dataset.calDate = day.date;
    cell.append(node("div", "hg-cal-daynum", new Intl.DateTimeFormat("fa-IR-u-ca-gregory", { day: "numeric" }).format(new Date(day.date + "T12:00:00")) + (day.date === today ? " · امروز" : "")));
    const eventList = node("div", "hg-cal-events");
    const dayTasks = tasks.filter((task) => task.date === day.date).sort((a, b) => String(a.start || "99:99").localeCompare(String(b.start || "99:99")));
    const shown = mode === "month" ? dayTasks.slice(0, 3) : dayTasks;
    shown.forEach((task) => addTaskEvent(eventList, task));
    if (dayTasks.length > shown.length) eventList.append(node("div", "hg-cal-more", (dayTasks.length - shown.length) + " فعالیت دیگر"));
    cell.append(eventList);
    grid.append(cell);
  }
  card.append(grid);
  const status = node("div", "hg-cal-status", feedback);
  status.id = "hg-cal-status";
  status.hidden = !feedback;
  status.classList.toggle("error", feedbackIsError);
  card.append(status);
  const activeCount = tasks.filter((task) => !task.sample && task.status !== "done").length;
  card.append(node("div", "hg-cal-summary", activeCount + " فعالیت واقعیِ باز در برنامه ثبت شده است. فعالیت‌های نمونه با کادر خط‌چین مشخص می‌شوند."));
}
function updateAnchor(action) {
  const date = new Date(anchorDate + "T12:00:00");
  if (action === "today") {
    anchorDate = todayISO();
  } else if (action === "prev" || action === "next") {
    if (mode === "month") date.setDate(1);
    date.setMonth(date.getMonth() + (action === "prev" ? -1 : 1));
    if (mode === "week") date.setDate(date.getDate() + (action === "prev" ? -7 : 7));
    anchorDate = date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }
  feedback = "";
  const app = currentState();
  if (app) {
    app.ui = app.ui || {};
    app.ui.calendarAnchor = anchorDate;
    try { persistState(app); } catch { /* Navigating the calendar remains available if persistence is blocked. */ }
  }
  renderCalendar();
}
function onClick(event) {
  const actionButton = event.target.closest("[data-cal-action]");
  if (actionButton) {
    updateAnchor(actionButton.dataset.calAction);
    return;
  }
  const modeButton = event.target.closest("[data-cal-mode]");
  if (modeButton) {
    mode = modeButton.dataset.calMode === "week" ? "week" : "month";
    feedback = "";
    renderCalendar();
    return;
  }
  const moveButton = event.target.closest("[data-cal-move]");
  if (moveButton) {
    const input = moveButton.parentElement?.querySelector("input[type=date]");
    if (input) {
      input.hidden = !input.hidden;
      if (!input.hidden) input.focus();
    }
  }
}
function onChange(event) {
  const input = event.target.closest("input[data-cal-date-for]");
  if (input && input.value) moveTask(input.dataset.calDateFor, input.value);
}
function onDragStart(event) {
  if (event.target.closest("button,input")) { event.preventDefault(); return; }
  const item = event.target.closest(".hg-cal-event[draggable=true]");
  if (!item || !event.dataTransfer) return;
  event.dataTransfer.setData("text/plain", item.dataset.taskId || "");
  event.dataTransfer.effectAllowed = "move";
}
function onDragOver(event) {
  const cell = event.target.closest("[data-cal-date]");
  if (!cell || !event.dataTransfer) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  cell.classList.add("dragover");
}
function onDragLeave(event) {
  const cell = event.target.closest("[data-cal-date]");
  if (cell && !cell.contains(event.relatedTarget)) cell.classList.remove("dragover");
}
function onDrop(event) {
  const cell = event.target.closest("[data-cal-date]");
  if (!cell || !event.dataTransfer) return;
  event.preventDefault();
  cell.classList.remove("dragover");
  const taskId = event.dataTransfer.getData("text/plain");
  if (taskId) moveTask(taskId, cell.dataset.calDate);
}
function mount() {
  const main = document.getElementById("main");
  if (!main || !activePage() || document.getElementById(CARD_ID)) return;
  const app = currentState();
  if (app?.ui?.calendarAnchor) anchorDate = app.ui.calendarAnchor;
  const card = node("section", "hg-cal");
  card.id = CARD_ID;
  const plannerCard = document.getElementById("hg-smart-planner-card");
  const pageHead = main.querySelector(".pagehead");
  if (plannerCard) plannerCard.insertAdjacentElement("afterend", card);
  else if (pageHead) pageHead.insertAdjacentElement("afterend", card);
  else main.insertAdjacentElement("afterbegin", card);
  card.addEventListener("click", onClick);
  card.addEventListener("change", onChange);
  card.addEventListener("dragstart", onDragStart);
  card.addEventListener("dragover", onDragOver);
  card.addEventListener("dragleave", onDragLeave);
  card.addEventListener("drop", onDrop);
  renderCalendar();
}
function start() {
  addStyles();
  const main = document.getElementById("main");
  if (!main || observer) return;
  observer = new MutationObserver(() => { if (activePage()) mount(); });
  observer.observe(main, { childList: true, subtree: true });
  mount();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
