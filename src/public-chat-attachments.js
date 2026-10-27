import { supabase, isSupabaseConfigured } from "./supabase-client.js";
import {
  MAX_ATTACHMENT_BYTES,
  sanitizeAttachmentName,
  validateAttachmentFile,
} from "./public-chat-attachment-utils.mjs";

const BUCKET = "hamghadam-chat-files";
const MAX_MESSAGE = 3000;

let observer;
let mutationScheduled = false;
let activeUpload = false;

const signedUrlCache = new Map();

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} کیلوبایت`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`;
}

function activeRoomId() {
  return document.querySelector(
    "#hc-public-chat .hc-room-card.active"
  )?.dataset.room || "";
}

function activeMessageList() {
  return document.querySelector(
    "#hc-public-chat #hc-message-list"
  );
}

function status(message, error = false) {
  const root = document.querySelector("#hc-public-chat");
  if (!root) return;

  let node = root.querySelector("#hc-attachment-status");

  if (!node) {
    node = document.createElement("p");
    node.id = "hc-attachment-status";
    node.className = "hc-attachment-status";
    node.setAttribute("role", "status");
    node.setAttribute("aria-live", "polite");

    root.querySelector(".hc-composer-wrap")?.append(node);
  }

  node.textContent = message;
  node.classList.toggle("error", error);
}

function addStyles() {
  if (document.getElementById("hc-attachment-style")) return;

  const style = document.createElement("style");
  style.id = "hc-attachment-style";

  style.textContent = `
    #hc-public-chat .hc-attachment-tools {
      display:flex;
      align-items:center;
      gap:8px;
      flex-wrap:wrap;
      margin-top:8px;
    }

    #hc-public-chat .hc-attachment-pick {
      display:inline-flex;
      align-items:center;
      gap:6px;
      border:1px solid var(--line,#d9e1e4);
      border-radius:10px;
      padding:7px 10px;
      background:var(--paper,#fff);
      color:var(--ink,#1d3038);
      font:inherit;
      font-size:12px;
      cursor:pointer;
    }

    #hc-public-chat .hc-attachment-pick:disabled {
      opacity:.55;
      cursor:wait;
    }

    #hc-public-chat .hc-attachment-status {
      margin:6px 0 0;
      font-size:11px;
      color:var(--muted,#63737a);
      overflow-wrap:anywhere;
    }

    #hc-public-chat .hc-attachment-status.error {
      color:#a22d43;
    }

    #hc-public-chat .hc-attachment-list {
      display:grid;
      gap:6px;
      margin-top:8px;
    }

    #hc-public-chat .hc-attachment-card {
      display:flex;
      align-items:center;
      gap:9px;
      border:1px solid var(--line,#d9e1e4);
      border-radius:10px;
      padding:8px 10px;
      background:var(--soft,#f7f8f6);
      max-width:100%;
      text-decoration:none;
      color:inherit;
    }

    #hc-public-chat .hc-attachment-card .hc-attachment-icon {
      font-size:20px;
      flex:none;
    }

    #hc-public-chat .hc-attachment-card .hc-attachment-copy {
      display:grid;
      min-width:0;
      gap:2px;
    }

    #hc-public-chat .hc-attachment-card b {
      font-size:11px;
      overflow-wrap:anywhere;
    }

    #hc-public-chat .hc-attachment-card small {
      font-size:10px;
      color:var(--muted,#63737a);
    }

    #hc-public-chat .hc-attachment-card:focus-visible,
    #hc-public-chat .hc-attachment-pick:focus-visible {
      outline:3px solid var(--teal,#168b83);
      outline-offset:2px;
    }
  `;

  document.head.append(style);
}

function mountPicker() {
  const root = document.querySelector("#hc-public-chat");
  const wrap = root?.querySelector(".hc-composer-wrap");

  if (!root || !wrap || wrap.querySelector("#hc-attachment-input")) {
    return;
  }

  const tools = document.createElement("div");
  tools.className = "hc-attachment-tools";

  const label = document.createElement("label");
  label.className = "hc-attachment-pick";
  label.htmlFor = "hc-attachment-input";
  label.textContent = "📎 ارسال عکس، فایل یا صوت (حداکثر ۵۰ مگابایت)";

  const input = document.createElement("input");
  input.id = "hc-attachment-input";
  input.type = "file";

  input.accept =
    ".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv,.doc,.docx," +
    ".xls,.xlsx,.ppt,.pptx,.zip,.7z,.mp3,.m4a,.ogg,.opus," +
    ".wav,.webm,.aac,.3gp,.mp4";

  input.hidden = true;
  input.setAttribute(
    "aria-label",
    "انتخاب عکس، فایل یا صوت برای ارسال در اتاق"
  );

  input.addEventListener("change", () => {
    const file = input.files?.[0];

    // امکان انتخاب مجدد همان فایل
    input.value = "";

    if (file) {
      void uploadAttachment(file);
    }
  });

  tools.append(label, input);
  wrap.append(tools);
}

async function uploadAttachment(file) {
  if (activeUpload) return;

  if (!supabase || !isSupabaseConfigured) {
    status("اتصال امن سرور تنظیم نشده است؛ فایل ارسال نشد.", true);
    return;
  }

  const validation = validateAttachmentFile(file);

  if (!validation.ok) {
    status(validation.error, true);
    return;
  }

  const roomId = activeRoomId();

  if (!roomId) {
    status("ابتدا یک گروه یا کانال را باز کن.", true);
    return;
  }

  const { data: authData, error: authError } =
    await supabase.auth.getUser();

  const user = authData?.user;

  if (authError || !user) {
    status("برای ارسال فایل ابتدا وارد حساب هم‌قدم شو.", true);
    return;
  }

  const textarea = document.querySelector(
    "#hc-public-chat #hc-message-input"
  );

  const typedText = String(textarea?.value || "").trim();

  const body = typedText ||
    `📎 فایل پیوست‌شده: ${validation.name}`;

  if (body.length > MAX_MESSAGE) {
    status("متن همراه فایل نباید بیش از ۳۰۰۰ نویسه باشد.", true);
    return;
  }

  const pick = document.querySelector(
    "#hc-attachment-input"
  )?.previousElementSibling;

  activeUpload = true;

  if (pick) {
    pick.setAttribute("aria-disabled", "true");
  }

  // نام مخصوص مسیر ذخیره‌سازی؛ فقط نویسه‌های امن
  const safeName = sanitizeAttachmentName(validation.name);

  // نام فایل فارسی در مسیر ذخیره‌سازی استفاده نمی‌شود
  const objectPath =
    `${roomId}/${user.id}/${crypto.randomUUID()}-${safeName}`;

  let uploaded = false;
  let messageId = "";

  status(
    `در حال بارگذاری «${validation.name}» ` +
    `(${formatBytes(validation.size)})…`
  );

  try {
    const { error: uploadError } = await supabase
      .storage
      .from(BUCKET)
      .upload(objectPath, file, {
        cacheControl: "3600",
        contentType: validation.mimeType,
        upsert: false,
      });

    if (uploadError) {
      throw uploadError;
    }

    uploaded = true;

    const { data: message, error: messageError } = await supabase
      .from("public_chat_messages")
      .insert({
        room_id: roomId,
        sender_id: user.id,
        body,
      })
      .select("id")
      .single();

    if (messageError || !message) {
      throw messageError || new Error("ثبت پیام فایل ناموفق بود.");
    }

    messageId = message.id;

    const { error: metaError } = await supabase
      .from("public_chat_attachments")
      .insert({
        room_id: roomId,
        message_id: messageId,
        uploaded_by: user.id,
        bucket_id: BUCKET,
        object_path: objectPath,

        // نام اصلی، از جمله حروف فارسی، حفظ می‌شود
        file_name: validation.name,

        mime_type: validation.mimeType,
        size_bytes: validation.size,
      });

    if (metaError) {
      throw metaError;
    }

    if (textarea && typedText) {
      textarea.value = "";
      textarea.dispatchEvent(
        new Event("input", { bubbles: true })
      );
    }

    status(`فایل «${validation.name}» در اتاق ارسال شد.`);

    signedUrlCache.clear();
    await refreshAttachmentCards();

  } catch (error) {
    if (messageId) {
      await supabase
        .from("public_chat_messages")
        .update({
          body: "ارسال پیوست ناموفق بود؛ لطفاً دوباره تلاش کن.",
        })
        .eq("id", messageId)
        .eq("sender_id", user.id);
    }

    if (uploaded) {
      await supabase
        .storage
        .from(BUCKET)
        .remove([objectPath]);
    }

    const message = String(error?.message || "");

    status(
      /row-level security|permission denied|42501/i.test(message)
        ? "سرور اجازهٔ ارسال فایل را نداد؛ مجوزها و عضویت اتاق را بررسی کن."
        : /network|fetch|timeout|offline/i.test(message)
          ? "ارتباط اینترنت قطع شد؛ اتصال را بررسی و دوباره تلاش کن."
          : `ارسال فایل ناموفق بود: ${message || "خطای نامشخص"}`,
      true
    );

  } finally {
    activeUpload = false;

    if (pick) {
      pick.removeAttribute("aria-disabled");
    }
  }
}

async function refreshAttachmentCards() {
  if (!supabase || !isSupabaseConfigured) return;

  const list = activeMessageList();
  if (!list) return;

  const articles = [
    ...list.querySelectorAll("article.hc-message[id^='hc-msg-']")
  ];

  const ids = articles
    .map(article => article.id.slice("hc-msg-".length))
    .filter(Boolean);

  if (!ids.length) return;

  const { data, error } = await supabase
    .from("public_chat_attachments")
    .select(
      "id,room_id,message_id,file_name,mime_type," +
      "size_bytes,object_path,bucket_id,created_at"
    )
    .in("message_id", ids);

  if (error) {
    if (
      !/relation .* does not exist|schema cache/i.test(
        String(error.message || "")
      )
    ) {
      status(
        "دریافت پیوست‌ها ناموفق بود؛ مجوزها و migration را بررسی کن.",
        true
      );
    }

    return;
  }

  const byMessage = new Map();

  for (const item of data || []) {
    if (!byMessage.has(item.message_id)) {
      byMessage.set(item.message_id, []);
    }

    byMessage.get(item.message_id).push(item);
  }

  for (const article of articles) {
    const bubble = article.querySelector(".hc-bubble");
    if (!bubble) continue;

    let container = bubble.querySelector(".hc-attachment-list");

    const attachments =
      byMessage.get(article.id.slice("hc-msg-".length)) || [];

    if (!attachments.length) {
      container?.remove();
      continue;
    }

    if (!container) {
      container = document.createElement("div");
      container.className = "hc-attachment-list";
      bubble.append(container);
    }

    const present = new Set(
      [
        ...container.querySelectorAll("[data-attachment-id]")
      ].map(a => a.dataset.attachmentId)
    );

    for (const attachment of attachments) {
      if (present.has(attachment.id)) continue;

      let url = signedUrlCache.get(attachment.id);

      if (!url) {
        const { data: signed, error: signedError } =
          await supabase.storage
            .from(attachment.bucket_id || BUCKET)
            .createSignedUrl(attachment.object_path, 3600);

        if (signedError || !signed?.signedUrl) {
          continue;
        }

        url = signed.signedUrl;
        signedUrlCache.set(attachment.id, url);
      }

      const link = document.createElement("a");

      link.className = "hc-attachment-card";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.dataset.attachmentId = attachment.id;

      const icon = document.createElement("span");

      icon.className = "hc-attachment-icon";
      icon.setAttribute("aria-hidden", "true");

      if (attachment.mime_type?.startsWith("image/")) {
        icon.textContent = "🖼️";
      } else if (attachment.mime_type?.startsWith("audio/")) {
        icon.textContent = "🎧";
      } else if (attachment.mime_type?.startsWith("video/")) {
        icon.textContent = "🎬";
      } else if (attachment.mime_type === "application/pdf") {
        icon.textContent = "📕";
      } else {
        icon.textContent = "📎";
      }

      const copy = document.createElement("span");
      copy.className = "hc-attachment-copy";

      const title = document.createElement("b");
      title.textContent = attachment.file_name || "فایل پیوست";

      const meta = document.createElement("small");
      meta.textContent =
        `${formatBytes(Number(attachment.size_bytes) || 0)} · دانلود امن`;

      copy.append(title, meta);
      link.append(icon, copy);
      container.append(link);
    }
  }
}

function scheduleRefresh() {
  if (mutationScheduled) return;

  mutationScheduled = true;

  queueMicrotask(() => {
    mutationScheduled = false;
    mountPicker();
    void refreshAttachmentCards();
  });
}

function init() {
  addStyles();
  mountPicker();

  if (observer) return;

  observer = new MutationObserver(records => {
    const root = document.querySelector("#hc-public-chat");
    if (!root) return;

    mountPicker();

    const relevant = records.some(record =>
      [...record.addedNodes].some(node =>
        node.nodeType === 1 &&
        !node.classList?.contains("hc-attachment-list") &&
        !node.closest?.(".hc-attachment-list")
      )
    );

    if (relevant) {
      scheduleRefresh();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  document.addEventListener("click", event => {
    if (event.target.closest("#hc-attachment-input")) {
      mountPicker();
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, {
    once: true,
  });
} else {
  init();
}
