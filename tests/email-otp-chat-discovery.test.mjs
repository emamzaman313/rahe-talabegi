import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const auth = fs.readFileSync(path.join(root, 'src/hamghadam-auth.js'), 'utf8');
const support = fs.readFileSync(path.join(root, 'src/support-chat.js'), 'utf8');
const suite = fs.readFileSync(path.join(root, 'src/hamghadam-suite.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261029185356_chat_discovery_and_covers.sql'), 'utf8');

test('new accounts verify email then set a password; later sign-in uses email and password', () => {
  assert.match(auth, /signInWithOtp\(\{\s*email,\s*options:\s*\{\s*shouldCreateUser:\s*true/i);
  assert.match(auth, /verifyOtp\(\{\s*email:\s*pendingEmail,\s*token,\s*type:\s*'email'/i);
  assert.match(auth, /pendingMode === 'signup'[\s\S]*?mode = 'set-password'/);
  assert.match(auth, /updateUser\(\{\s*password\s*\}\)/);
  assert.match(auth, /signInWithPassword\(\{\s*email,\s*password\s*\}\)/);
  assert.match(auth, /autocomplete="one-time-code"/);
  assert.doesNotMatch(auth, /signInWithOtp\(\{\s*email,\s*options:\s*\{\s*shouldCreateUser:\s*false/i);
});

test('support screen uses the same email code verification instead of a password form', () => {
  assert.match(support, /signInWithOtp\(/);
  assert.match(support, /verifyOtp\(\{\s*email:\s*authPendingEmail,\s*token,\s*type:\s*'email'/i);
  assert.doesNotMatch(support, /signInWithPassword|auth\.signUp\(/);
});

test('chat UI discovers people by display name and allows named groups/channels with a cover image', () => {
  assert.ok(suite.includes('hgd-chat-launcher'));
  assert.ok(suite.includes("openSuite('chats')"));
  assert.match(suite, /data-hgd-form="search-chat-users"/);
  assert.match(suite, /rpc\('search_chat_users'/);
  assert.match(suite, /button\('شروع گفتگو','start-direct-chat'/);
  assert.match(suite, /<option value="channel">کانال<\/option>/);
  assert.match(suite, /<option value="public">عمومی و قابل جست‌وجو<\/option>/);
  assert.match(suite, /getPublicUrl\(u\.avatar_path\)/);
  assert.match(suite, /name="cover" type="file" accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(suite, /set_chat_conversation_cover/);
  assert.match(suite, /cover_path/);
});

test('chat directory exposes only limited profile names and cover upload is owner-scoped', () => {
  assert.match(migration, /returns table\(id uuid, display_name text\)/i);
  assert.match(migration, /limit 20/i);
  assert.match(migration, /revoke all on function public\.search_chat_users\(text\) from public, anon/i);
  assert.match(migration, /grant execute on function public\.search_chat_users\(text\) to authenticated/i);
  assert.match(migration, /c\.created_by = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /file_size_limit, allowed_mime_types/i);
});

