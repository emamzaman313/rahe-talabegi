import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const STATE_KEY = 'rahe-talabegi-v1';
const ENABLED_KEY = 'rahe-talabegi-task-reminders';
const IDS_KEY = 'rahe-talabegi-task-reminder-ids';
const MAX_AHEAD_DAYS = 30;
let syncTimer;
let browserTimers = new Map();

function readTasks() {
  try {
    const state = JSON.parse(localStorage.getItem(STATE_KEY) || '{}');
    return Array.isArray(state.tasks) ? state.tasks : [];
  } catch {
    return [];
  }
}

function reminderDate(task) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.date || '')) return null;
  const time = /^\d{2}:\d{2}$/.test(task.start || '') ? task.start : '09:00';
  const date = new Date(`${task.date}T${time}:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function upcomingTasks() {
  const now = Date.now();
  const limit = now + MAX_AHEAD_DAYS * 24 * 60 * 60 * 1000;
  return readTasks().filter((task) => task && task.id && task.title && !['done', 'completed', 'cancelled'].includes(task.status))
    .map((task) => ({ task, at: reminderDate(task) }))
    .filter(({ at }) => at && at.getTime() > now && at.getTime() <= limit);
}

function notificationId(value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 2147483646 + 1;
}

function setStatus(message) {
  const status = document.getElementById('task-reminder-status');
  if (status) status.textContent = message;
}

async function requestReminderPermission() {
  if (Capacitor.isNativePlatform()) {
    const current = await LocalNotifications.checkPermissions();
    const result = current.display === 'granted' ? current : await LocalNotifications.requestPermissions();
    if (result.display !== 'granted') throw new Error('اجازهٔ اعلان در تنظیمات دستگاه فعال نشد.');
  } else {
    if (!('Notification' in window)) throw new Error('این مرورگر از اعلان پشتیبانی نمی‌کند.');
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (result !== 'granted') throw new Error('اجازهٔ اعلان داده نشد.');
  }
  localStorage.setItem(ENABLED_KEY, 'true');
  await syncReminders();
  const button = document.getElementById('enable-task-reminders');
  if (button) button.textContent = 'خاموش‌کردن یادآوری';
  setStatus('یادآوری فعالیت‌های آینده فعال شد.');
}

async function disableReminders() {
  if (Capacitor.isNativePlatform()) {
    const previous = JSON.parse(localStorage.getItem(IDS_KEY) || '[]');
    if (previous.length) await LocalNotifications.cancel({ notifications: previous.map((id) => ({ id })) });
  }
  for (const timer of browserTimers.values()) clearTimeout(timer.handle);
  browserTimers.clear();
  localStorage.removeItem(ENABLED_KEY);
  localStorage.removeItem(IDS_KEY);
  const button = document.getElementById('enable-task-reminders');
  if (button) button.textContent = 'فعال‌کردن اعلان یادآوری';
  setStatus('یادآوری‌های برنامه خاموش شد.');
}

async function syncNativeReminders(tasks) {
  const previous = JSON.parse(localStorage.getItem(IDS_KEY) || '[]');
  if (previous.length) await LocalNotifications.cancel({ notifications: previous.map((id) => ({ id })) });
  const notifications = tasks.map(({ task, at }) => ({
    id: notificationId(task.id),
    title: 'یادآوری برنامهٔ هم‌قدم',
    body: task.title,
    schedule: { at, allowWhileIdle: true },
    extra: { taskId: task.id },
  }));
  if (notifications.length) await LocalNotifications.schedule({ notifications });
  localStorage.setItem(IDS_KEY, JSON.stringify(notifications.map(({ id }) => id)));
}

function syncBrowserReminders(tasks) {
  const next = new Map(tasks.map(({ task, at }) => [task.id, at.getTime()]));
  for (const [id, timer] of browserTimers) {
    if (next.get(id) !== timer.at) {
      clearTimeout(timer.handle);
      browserTimers.delete(id);
    }
  }
  for (const { task, at } of tasks) {
    if (browserTimers.has(task.id)) continue;
    const handle = setTimeout(() => {
      browserTimers.delete(task.id);
      if (Date.now() < at.getTime()) { void syncReminders(); return; }
      if (Notification.permission === 'granted') new Notification('یادآوری برنامهٔ هم‌قدم', { body: task.title });
    }, Math.min(at.getTime() - Date.now(), 2147480000));
    browserTimers.set(task.id, { at: at.getTime(), handle });
  }
}

async function syncReminders() {
  if (localStorage.getItem(ENABLED_KEY) !== 'true') return;
  const tasks = upcomingTasks();
  if (Capacitor.isNativePlatform()) await syncNativeReminders(tasks);
  else if ('Notification' in window && Notification.permission === 'granted') syncBrowserReminders(tasks);
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('#enable-task-reminders');
  if (!button) return;
  button.disabled = true;
  try { if (localStorage.getItem(ENABLED_KEY) === 'true') await disableReminders(); else await requestReminderPermission(); }
  catch (error) { setStatus(error?.message || 'فعال‌سازی یادآوری انجام نشد.'); }
  finally { button.disabled = false; }
});

function mountReminderControl() {
  const page = window.__RAHE_STATE__?.ui?.page;
  const existing = document.getElementById('enable-task-reminders');
  if (page !== 'settings' || existing) return;
  const anchor = [...document.querySelectorAll('#main h3')].find((heading) => heading.textContent.includes('مدیریت داده‌های نمونه'));
  if (!anchor) return;
  const card = document.createElement('section');
  card.className = 'card';
  card.style.marginTop = '13px';
  card.innerHTML = `<h3>یادآوری برنامه</h3><p class="small">با اجازهٔ تو، فعالیت‌های ثبت‌شده تا ۳۰ روز آینده در زمان شروع برایت یادآوری می‌شوند.</p><button class="btn" type="button" id="enable-task-reminders">${localStorage.getItem(ENABLED_KEY)==='true'?'خاموش‌کردن یادآوری':'فعال‌کردن اعلان یادآوری'}</button><p class="small muted" id="task-reminder-status" aria-live="polite"></p>`;
  anchor.closest('.card')?.before(card);
}

function start() {
  mountReminderControl();
  window.addEventListener('click', () => setTimeout(mountReminderControl, 0));
  syncTimer = setInterval(() => { mountReminderControl(); void syncReminders().catch((error) => console.warn('Reminder sync:', error)); }, 60_000);
  void syncReminders().catch((error) => console.warn('Reminder sync:', error));
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
else start();

window.addEventListener('beforeunload', () => { clearInterval(syncTimer); for (const timer of browserTimers.values()) clearTimeout(timer.handle); });
