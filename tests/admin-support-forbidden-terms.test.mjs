import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const admin = fs.readFileSync(path.join(root, 'src/hamghadam-admin-console.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261030190000_normalize_forbidden_chat_terms.sql'), 'utf8');

test('admin support inbox lists conversations, reads messages, replies and updates status', () => {
  assert.match(admin, /async function supportInbox\(root\)/);
  assert.match(admin, /from\('support_conversations'\).*\.order\('last_message_at'/);
  assert.match(admin, /from\('support_messages'\).*\.order\('created_at'/);
  assert.match(admin, /sender_role:'support'/);
  assert.match(admin, /data-support-status/);
  assert.match(admin, /a==='support-select'/);
});

test('forbidden terms normalize Persian variants and match complete expressions', () => {
  assert.match(migration, /translate\(lower\(coalesce\(p_text/);
  assert.match(migration, /position\(' ' \|\| private\.hgd_normalize_forbidden_text\(t\.term\)/);
  assert.match(migration, /return null;/);
  assert.match(migration, /source_table/);
  assert.match(migration, /set active=false[\s\S]*توهین نژادی/);
});

test('admin forbidden-word reports show source and prior review information', () => {
  assert.match(admin, /select\('id,user_id,term,attempted_text,source_table,status,review_action,review_note,created_at'\)/);
  assert.match(admin, /esc\(r\.source_table\)/);
  assert.match(admin, /r\.review_action/);
  assert.match(admin, /r\.review_note/);
});
