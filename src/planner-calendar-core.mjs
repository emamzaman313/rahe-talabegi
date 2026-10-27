export function isoDate(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(value + "T12:00:00");
  if (Number.isNaN(date.getTime()) || isoDate(date) !== value) return null;
  return date;
}

export function getCalendarDates(anchorValue, mode = "month") {
  const anchor = validDate(anchorValue) || new Date();
  anchor.setHours(12, 0, 0, 0);
  const start = new Date(anchor);
  // Persian/Iranian calendar week: Saturday through Friday.
  start.setDate(start.getDate() - ((start.getDay() + 1) % 7));
  if (mode === "week") {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return { date: isoDate(date), inAnchorMonth: date.getMonth() === anchor.getMonth() && date.getFullYear() === anchor.getFullYear() };
    });
  }
  if (mode !== "month") throw new Error("نمای تقویم نامعتبر است.");
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
  first.setDate(first.getDate() - ((first.getDay() + 1) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index);
    return { date: isoDate(date), inAnchorMonth: date.getMonth() === anchor.getMonth() && date.getFullYear() === anchor.getFullYear() };
  });
}

export function parseTaskTime(task) {
  if (!task || typeof task.start !== "string" || typeof task.end !== "string") return null;
  const startMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(task.start);
  const endMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(task.end);
  if (!startMatch || !endMatch) return null;
  const start = Number(startMatch[1]) * 60 + Number(startMatch[2]);
  const end = Number(endMatch[1]) * 60 + Number(endMatch[2]);
  if (end <= start) return null;
  return { start, end };
}

export function findMoveConflicts(tasks, taskId, targetDate) {
  if (!Array.isArray(tasks)) throw new TypeError("فهرست فعالیت‌ها معتبر نیست.");
  const moving = tasks.find((task) => task && String(task.id) === String(taskId));
  if (!moving) throw new Error("فعالیت برای انتقال پیدا نشد.");
  if (moving.sample === true) return { task: moving, conflicts: [], movable: false };
  const time = parseTaskTime(moving);
  if (!time) return { task: moving, conflicts: [], movable: true };
  const conflicts = tasks.filter((other) => {
    if (!other || String(other.id) === String(taskId) || other.date !== targetDate || other.sample === true || other.status === "done") return false;
    const otherTime = parseTaskTime(other);
    return Boolean(otherTime && otherTime.start < time.end && otherTime.end > time.start);
  });
  return { task: moving, conflicts, movable: true };
}

export function moveTaskDate(tasks, taskId, targetDate) {
  const parsed = validDate(targetDate);
  if (!parsed) throw new Error("تاریخ مقصد معتبر نیست.");
  const task = Array.isArray(tasks) ? tasks.find((item) => item && String(item.id) === String(taskId)) : null;
  if (!task) throw new Error("فعالیت برای انتقال پیدا نشد.");
  if (task.sample === true) throw new Error("فعالیت نمونه را نمی‌توان منتقل کرد؛ ابتدا فعالیت واقعی ثبت کن.");
  const result = findMoveConflicts(tasks, taskId, targetDate);
  if (result.conflicts.length) {
    return { moved: false, task, conflicts: result.conflicts };
  }
  const previousDate = task.date;
  task.date = targetDate;
  return { moved: true, task, previousDate, conflicts: [] };
}
