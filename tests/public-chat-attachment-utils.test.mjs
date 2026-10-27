import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_ATTACHMENT_MIMES,
  MAX_ATTACHMENT_BYTES,
  sanitizeAttachmentName,
  validateAttachmentFile,
} from "../src/public-chat-attachment-utils.mjs";

test("allows a valid PDF up to the 50 MiB per-file limit", () => {
  const result = validateAttachmentFile({ name: "lesson.pdf", size: MAX_ATTACHMENT_BYTES, type: "application/pdf" });
  assert.equal(result.ok, true);
  assert.equal(result.mimeType, "application/pdf");
});

test("rejects a file larger than 50 MiB", () => {
  const result = validateAttachmentFile({ name: "lesson.pdf", size: MAX_ATTACHMENT_BYTES + 1, type: "application/pdf" });
  assert.equal(result.ok, false);
  assert.match(result.error, /۵۰ مگابایت/);
});

test("rejects active and unknown file types", () => {
  for (const name of ["script.js", "page.html", "picture.svg", "program.exe"]) {
    assert.equal(validateAttachmentFile({ name, size: 100, type: "application/octet-stream" }).ok, false);
  }
});

test("rejects a MIME type that conflicts with the file extension", () => {
  assert.equal(validateAttachmentFile({ name: "photo.png", size: 100, type: "application/pdf" }).ok, false);
});

test("normalizes path separators and control characters from names", () => {
  const result = sanitizeAttachmentName("../lesson\\notes\u0000.pdf");
  assert.equal(result.includes("/"), false);
  assert.equal(result.includes("\\"), false);
  assert.equal(result.includes("\u0000"), false);
  assert.match(result, /lesson_notes/);
});

test("accepts supported Office, archive, image, text, audio and video MIME types", () => {
  for (const type of [
    "application/pdf", "image/png", "text/plain",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip", "audio/mpeg", "video/mp4",
  ]) assert.ok(ALLOWED_ATTACHMENT_MIMES.includes(type));
});

test("rejects zero-byte files and missing filenames", () => {
  assert.equal(validateAttachmentFile({ name: "x.pdf", size: 0, type: "application/pdf" }).ok, false);
  assert.equal(validateAttachmentFile({ name: "", size: 1, type: "application/pdf" }).ok, false);
});
