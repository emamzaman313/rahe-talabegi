import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20261029180925_fix_private_chat_policy_correlations.sql'),
  'utf8',
);

test('chat reply insert policy correlates the parent to the submitted reply and conversation', () => {
  assert.match(migration, /parent\.id\s*=\s*chat_messages\.reply_to/i);
  assert.match(migration, /parent\.conversation_id\s*=\s*chat_messages\.conversation_id/i);
  assert.match(migration, /parent\.deleted_at\s+is\s+null/i);
  assert.doesNotMatch(migration, /parent\.id\s*=\s*parent\.reply_to/i);
  assert.doesNotMatch(migration, /parent\.conversation_id\s*=\s*parent\.conversation_id/i);
});

test('poll vote insert policy requires the selected option to belong to the voted poll', () => {
  assert.match(migration, /o\.id\s*=\s*chat_poll_votes\.option_id/i);
  assert.match(migration, /o\.poll_id\s*=\s*chat_poll_votes\.poll_id/i);
  assert.doesNotMatch(migration, /o\.poll_id\s*=\s*o\.poll_id/i);
});

test('chat block insert rejects self-blocks without a recursive table lookup', () => {
  assert.match(migration, /blocker_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(migration, /blocker_id\s*<>\s*blocked_id/i);
  assert.doesNotMatch(migration, /from\s+public\.chat_blocks\s+reciprocal/i);
});
