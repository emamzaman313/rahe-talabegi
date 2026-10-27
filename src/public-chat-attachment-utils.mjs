export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

const MIME_BY_EXTENSION = Object.freeze({
  ".pdf": ["application/pdf"],
  ".png": ["image/png"],
  ".jpg": ["image/jpeg"], ".jpeg": ["image/jpeg"],
  ".webp": ["image/webp"], ".gif": ["image/gif"],
  ".txt": ["text/plain"], ".csv": ["text/csv", "application/csv"],
  ".doc": ["application/msword"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".xls": ["application/vnd.ms-excel"],
  ".xlsx": ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ".ppt": ["application/vnd.ms-powerpoint"],
  ".pptx": ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  ".zip": ["application/zip", "application/x-zip-compressed"],
  ".7z": ["application/x-7z-compressed"],
  ".mp3": ["audio/mpeg"], ".m4a": ["audio/mp4"],
  ".mp4": ["video/mp4"],
});

export const ALLOWED_ATTACHMENT_MIMES = Object.freeze([
  ...new Set(Object.values(MIME_BY_EXTENSION).flat()),
]);

export function sanitizeAttachmentName(value) {
  const cleaned = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\/\\\u0000-\u001f\u007f]/g, "_")
    .replace(/^\.+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "attachment";
}

export function validateAttachmentFile(file) {
  if (!file || typeof file !== "object") {
    return { ok: false, error: "فایل انتخاب‌شده معتبر نیست." };
  }
  const name = sanitizeAttachmentName(file.name);
  const size = Number(file.size);
  if (!name || name === "attachment") {
    return { ok: false, error: "نام فایل معتبر نیست." };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, error: "فایل خالی یا نامعتبر است." };
  }
  if (size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: "حداکثر اندازهٔ هر فایل ۵۰ مگابایت است." };
  }
  const dot = name.lastIndexOf(".");
  const extension = dot >= 0 ? name.slice(dot).toLowerCase() : "";
  const allowedForExtension = MIME_BY_EXTENSION[extension];
  const type = String(file.type ?? "").trim().toLowerCase();
  if (!allowedForExtension) {
    return { ok: false, error: "این نوع فایل مجاز نیست. PDF، تصویر، سند اداری، ZIP، صوت یا MP4 انتخاب کن." };
  }
  if (type && type !== "application/octet-stream" &&
      !allowedForExtension.includes(type)) {
    return { ok: false, error: "نوع فایل با پسوند آن سازگار نیست." };
  }
  return {
    ok: true,
    name,
    size,
    mimeType: type && type !== "application/octet-stream"
      ? type
      : allowedForExtension[0],
    extension,
  };
}
