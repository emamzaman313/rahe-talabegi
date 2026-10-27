const PRIORITY_RANK = Object.freeze({ "زیاد": 0, "متوسط": 1, "کم": 2 });
const DEFAULT_ACTIVE_DAYS = Object.freeze([0, 1, 2, 3, 4, 6]);

function normalizePriority(value) {
  const raw = String(value || "متوسط").trim().toLocaleLowerCase("fa");
  const map = {
    "زیاد": "زیاد", "بالا": "زیاد", "high": "زیاد",
    "متوسط": "متوسط", "عادی": "متوسط", "medium": "متوسط",
    "کم": "کم", "پایین": "کم", "low": "کم",
  };
  return map[raw] || null;
}

function titleKey(value) {
  return String(value || "").trim().toLocaleLowerCase("fa");
}

export function parseStudyTopics(input) {
  if (typeof input !== "string") throw new TypeError("فهرست درس‌ها باید متن باشد.");
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error("حداقل یک درس یا مبحث وارد کن.");
  if (lines.length > 80) throw new Error("در هر برنامه حداکثر ۸۰ مبحث وارد کن.");

  const topics = lines.map((line, index) => {
    const fields = line.split("|").map((field) => field.trim());
    const title = fields[0] || "";
    if (!title) throw new Error("عنوان مبحث در سطر " + (index + 1) + " خالی است.");
    if (title.length > 120) throw new Error("عنوان مبحث در سطر " + (index + 1) + " بیشتر از ۱۲۰ نویسه است.");

    const totalMinutes = fields[1] ? Number(fields[1]) : 60;
    if (!Number.isInteger(totalMinutes) || totalMinutes < 15 || totalMinutes > 6000) {
      throw new Error("مدت مبحث «" + title + "» باید عدد صحیحی بین ۱۵ تا ۶۰۰۰ دقیقه باشد.");
    }

    const priority = normalizePriority(fields[2]);
    if (!priority) throw new Error("اولویت مبحث «" + title + "» باید «زیاد»، «متوسط» یا «کم» باشد.");

    const prerequisites = fields[3]
      ? fields[3].split(/[,،;؛]/).map((value) => value.trim()).filter(Boolean)
      : [];
    if (prerequisites.some((value) => value.length > 120)) {
      throw new Error("نام پیش‌نیاز در مبحث «" + title + "» بیش از حد طولانی است.");
    }

    return { title, totalMinutes, priority, prerequisites, sourceIndex: index };
  });

  const seen = new Set();
  for (const topic of topics) {
    const key = titleKey(topic.title);
    if (seen.has(key)) throw new Error("عنوان تکراری پیدا شد: «" + topic.title + "». هر مبحث را فقط یک بار بنویس.");
    seen.add(key);
  }

  return topics;
}

export function orderTopicsByPriorityAndPrerequisites(topics) {
  if (!Array.isArray(topics) || !topics.length) throw new Error("فهرست مباحث خالی است.");
  const byName = new Map(topics.map((topic) => [titleKey(topic.title), topic]));
  const pending = topics.slice();
  const ordered = [];
  const completed = new Set();

  while (pending.length) {
    const ready = pending.filter((topic) => topic.prerequisites.every((prerequisite) => {
      const key = titleKey(prerequisite);
      return !byName.has(key) || completed.has(key);
    }));

    if (!ready.length) {
      throw new Error("بین پیش‌نیازهای این مباحث چرخه وجود دارد؛ وابستگی‌ها را اصلاح کن: " +
        pending.map((topic) => topic.title).join("، "));
    }

    ready.sort((a, b) =>
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.sourceIndex - b.sourceIndex
    );
    const next = ready[0];
    pending.splice(pending.indexOf(next), 1);
    ordered.push(next);
    completed.add(titleKey(next.title));
  }

  return ordered;
}

function isoDate(date) {
  return date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0");
}

function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) throw new Error("تاریخ شروع معتبر نیست.");
  const date = new Date(value + "T12:00:00");
  if (Number.isNaN(date.getTime()) || isoDate(date) !== value) throw new Error("تاریخ شروع معتبر نیست.");
  return date;
}

function timeToMinutes(value, label) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
  if (!match) throw new Error((label || "ساعت") + " معتبر نیست.");
  return Number(match[1]) * 60 + Number(match[2]);
}

function minutesToTime(value) {
  return String(Math.floor(value / 60)).padStart(2, "0") + ":" +
    String(value % 60).padStart(2, "0");
}

function splitMinutes(total, maximum) {
  const count = Math.ceil(total / maximum);
  const base = Math.floor(total / count);
  const remainder = total % count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function taskTimeRange(task) {
  if (!task || typeof task.start !== "string" || typeof task.end !== "string") return null;
  try {
    const start = timeToMinutes(task.start, "ساعت شروع فعالیت");
    const end = timeToMinutes(task.end, "ساعت پایان فعالیت");
    if (end <= start) return null;
    return { start, end };
  } catch {
    return null;
  }
}

function findGap(cursor, duration, endOfWindow, busy) {
  let candidate = cursor;
  const orderedBusy = busy.slice().sort((a, b) => a.start - b.start);
  while (candidate + duration <= endOfWindow) {
    const conflict = orderedBusy.find((slot) => slot.start < candidate + duration && slot.end > candidate);
    if (!conflict) return candidate;
    candidate = Math.max(candidate + 1, conflict.end);
  }
  return null;
}

export function makeStudyPlan(options) {
  const config = options || {};
  const orderedTopics = orderTopicsByPriorityAndPrerequisites(config.topics);
  const days = Number(config.days ?? 14);
  const dailyMinutes = Number(config.dailyMinutes ?? 60);
  const sessionMinutes = Number(config.sessionMinutes ?? 40);
  const breakMinutes = Number(config.breakMinutes ?? 10);
  if (!Number.isInteger(days) || days < 1 || days > 60) throw new Error("طول برنامه باید بین ۱ تا ۶۰ روز باشد.");
  if (!Number.isInteger(dailyMinutes) || dailyMinutes < 15 || dailyMinutes > 600) throw new Error("ظرفیت روزانه باید بین ۱۵ تا ۶۰۰ دقیقه باشد.");
  if (!Number.isInteger(sessionMinutes) || sessionMinutes < 15 || sessionMinutes > 120) throw new Error("طول هر نشست باید بین ۱۵ تا ۱۲۰ دقیقه باشد.");
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 60) throw new Error("استراحت باید بین صفر تا ۶۰ دقیقه باشد.");

  const startDate = parseDate(config.startDate);
  const startAt = timeToMinutes(config.startTime || "20:30", "ساعت شروع بازه");
  const endAt = timeToMinutes(config.endTime || "22:30", "ساعت پایان بازه");
  if (endAt <= startAt) throw new Error("پایان بازه باید بعد از شروع آن باشد.");
  if (endAt - startAt < 15) throw new Error("بازهٔ روزانه باید دست‌کم ۱۵ دقیقه باشد.");

  const activeDays = new Set(config.activeDays === undefined ? DEFAULT_ACTIVE_DAYS : config.activeDays);
  if (!activeDays.size || Array.from(activeDays).some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw new Error("حداقل یک روز معتبر برای برنامه‌ریزی انتخاب کن.");
  }

  const maxBlock = Math.min(sessionMinutes, dailyMinutes, endAt - startAt);
  const queue = [];
  for (const topic of orderedTopics) {
    const durations = splitMinutes(topic.totalMinutes, maxBlock);
    durations.forEach((duration, index) => queue.push({
      topic, duration, sessionNumber: index + 1, sessionCount: durations.length,
    }));
  }

  const existingTasks = Array.isArray(config.existingTasks) ? config.existingTasks : [];
  const generated = [];
  let queueIndex = 0;
  let plannedMinutes = 0;
  let usedDays = 0;

  for (let offset = 0; offset < days && queueIndex < queue.length; offset += 1) {
    const date = new Date(startDate.getTime());
    date.setDate(date.getDate() + offset);
    if (!activeDays.has(date.getDay())) continue;
    const dateKey = isoDate(date);

    const busy = existingTasks
      .filter((task) => task && task.date === dateKey && task.sample !== true)
      .map((task) => taskTimeRange(task)).filter(Boolean);
    let usedToday = 0;
    let cursor = startAt;
    let createdToday = 0;

    while (queueIndex < queue.length) {
      const block = queue[queueIndex];
      if (usedToday + block.duration > dailyMinutes) break;
      const start = findGap(cursor, block.duration, endAt, busy);
      if (start === null) break;
      const end = start + block.duration;

      generated.push({
        id: "smart-plan-pending-" + generated.length,
        title: block.topic.title + " · جلسه " + block.sessionNumber + " از " + block.sessionCount,
        category: "درس",
        date: dateKey,
        start: minutesToTime(start),
        end: minutesToTime(end),
        priority: block.topic.priority,
        status: "pending",
        note: "برنامه‌ساز هوشمند هم‌قدم؛ جلسه " + block.sessionNumber + " از " + block.sessionCount +
          (block.topic.prerequisites.length ? "؛ پیش‌نیاز: " + block.topic.prerequisites.join("، ") : ""),
        sample: false,
        smartGenerated: true,
        topicTitle: block.topic.title,
        topicMinutes: block.duration,
        sessionNumber: block.sessionNumber,
        sessionCount: block.sessionCount,
      });

      busy.push({ start, end });
      usedToday += block.duration;
      plannedMinutes += block.duration;
      createdToday += 1;
      queueIndex += 1;
      cursor = end + breakMinutes;
    }
    if (createdToday) usedDays += 1;
  }

  const remainingMap = new Map();
  for (const block of queue.slice(queueIndex)) {
    const key = titleKey(block.topic.title);
    const current = remainingMap.get(key) || { title: block.topic.title, sessions: 0, minutes: 0 };
    current.sessions += 1;
    current.minutes += block.duration;
    remainingMap.set(key, current);
  }

  return {
    tasks: generated,
    scheduledSessions: generated.length,
    scheduledMinutes: plannedMinutes,
    activeDaysUsed: usedDays,
    unscheduledTopics: Array.from(remainingMap.values()),
    unscheduledSessions: queue.length - queueIndex,
    unscheduledMinutes: queue.slice(queueIndex).reduce((sum, block) => sum + block.duration, 0),
  };
}

export const SMART_PLANNER_DEFAULT_ACTIVE_DAYS = DEFAULT_ACTIVE_DAYS.slice();
