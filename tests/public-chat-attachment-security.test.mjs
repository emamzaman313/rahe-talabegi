import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migration = fs.readFileSync(path.join(root, "supabase/migrations/20261027150000_public_chat_attachments.sql"), "utf8");
const client = fs.readFileSync(path.join(root, "src/public-chat-attachments.js"), "utf8");

test("storage bucket is private and capped at 50 MiB", () => {
  assert.match(migration, /'hamghadam-chat-files'\s*,\s*'hamghadam-chat-files'\s*,\s*false\s*,\s*52428800/s);
});

test("database metadata enforces the per-file size ceiling", () => {
  assert.match(migration, /size_bytes between 1 and 52428800/i);
});

test("attachment metadata has row-level security and membership checks", () => {
  assert.match(migration, /alter table public\.public_chat_attachments enable row level security/i);
  assert.match(migration, /public_chat_attachments_read_room_members/i);
  assert.match(migration, /public_chat_attachments_insert_own_message/i);
  assert.match(migration, /public_chat_files_read_room_members|hamghadam_chat_files_read_room_members/i);
  assert.match(migration, /hamghadam_chat_files_upload_room_members/i);
});

test("client creates short-lived signed download links rather than public URLs", () => {
  assert.match(client, /createSignedUrl\(attachment\.object_path,\s*3600\)/);
  assert.doesNotMatch(client, /getPublicUrl\s*\(/);
});

test("client uses the expected private bucket and validates before upload", () => {
  assert.match(client, /const BUCKET = "hamghadam-chat-files"/);
  assert.match(client, /validateAttachmentFile\(file\)/);
  assert.match(client, /supabase\.storage\.from\(BUCKET\)\.upload/);
});
