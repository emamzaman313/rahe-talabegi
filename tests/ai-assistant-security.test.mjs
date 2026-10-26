import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const client = fs.readFileSync(path.join(root, 'src/ai-assistant.js'), 'utf8');
const fn = fs.readFileSync(path.join(root, 'supabase/functions/hamghadam-ai/index.ts'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261025000000_hamghadam_ai.sql'), 'utf8');

test('AI provider secret exists only in the server function', () => {
  assert.match(fn, /Deno\.env\.get\("OPENAI_API_KEY"\)/);
  assert.doesNotMatch(client, /OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|service_role/i);
});

test('server validates the signed-in user and checks conversation ownership', () => {
  assert.match(fn, /auth\.getUser\(accessToken\)/);
  assert.match(fn, /eq\("user_id", userId\)/);
  assert.match(fn, /MAX_MESSAGE_CHARS = 6000/);
});

test('AI history has owner-based RLS and no client write grants', () => {
  assert.match(sql, /alter table public\.ai_conversations enable row level security/i);
  assert.match(sql, /alter table public\.ai_messages enable row level security/i);
  assert.match(sql, /using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(sql, /grant select on table public\.ai_messages to authenticated/i);
  assert.doesNotMatch(sql, /grant\s+(?:insert|update|delete|all)\s+on\s+table\s+public\.ai_messages\s+to\s+authenticated/i);
});

test('AI endpoint has a server-side quota and provider timeout', () => {
  assert.match(fn, /consume_hamghadam_ai_quota/);
  assert.match(fn, /MAX_REQUESTS_PER_MINUTE = 10/);
  assert.match(fn, /setTimeout\(\(\) => controller\.abort\(\), 20000\)/);
});

test('AI client calls only the Supabase Edge Function and uses textContent for transcript', () => {
  assert.match(client, /functions\.invoke\('hamghadam-ai'/);
  assert.match(client, /body\.textContent = String\(msg\.content/);
  assert.doesNotMatch(client, /fetch\(['"]https:\/\/api\.openai\.com/);
});
