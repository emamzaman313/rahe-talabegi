import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261022000000_support_chat.sql'), 'utf8');
const client = fs.readFileSync(path.join(root, 'src/support-chat.js'), 'utf8');

test('RLS is enabled for both support tables', () => {
  assert.match(sql, /alter table public\.support_conversations enable row level security/i);
  assert.match(sql, /alter table public\.support_messages enable row level security/i);
});

test('support privilege is read from trusted app_metadata, not user_metadata', () => {
  assert.match(sql, /auth\.jwt\(\)\s*->\s*'app_metadata'\s*->>\s*'role'\)\s*=\s*'support'/i);
  assert.doesNotMatch(sql, /user_metadata/i);
  assert.match(client, /isSupportAgent\(currentUser\)/);
});

test('messages have bounded non-empty bodies and cannot be edited/deleted by app roles', () => {
  assert.match(sql, /char_length\(btrim\(body\)\) between 1 and 5000/i);
  assert.match(sql, /grant insert \(conversation_id, sender_id, sender_role, body\) on table public\.support_messages to authenticated/i);
  assert.doesNotMatch(sql, /grant\s+(?:all|update|delete)\s+on\s+table\s+public\.support_messages\s+to\s+authenticated/i);
});

test('client bundle never contains a service-role credential', () => {
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY|service_role\s*[:=]/i);
  assert.match(client, /VITE_SUPABASE_PUBLISHABLE_KEY/);
});

test('the mobile web entry includes the support page and bundles its module', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /\['support','💬','پشتیبانی'\]/);
  assert.match(html, /support:renderSupport/);
  assert.match(html, /type="module" src="\/src\/support-chat\.js"/);
});
