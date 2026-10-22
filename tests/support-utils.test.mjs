import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, isValidSupabaseConfig, normalizeMessage, isSupportAgent, statusLabel } from '../src/support-utils.mjs';

test('escapes untrusted message content before rendering HTML', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)> & "text"'), '&lt;img src=x onerror=alert(1)&gt; &amp; &quot;text&quot;');
});

test('rejects missing or placeholder Supabase client configuration', () => {
  assert.equal(isValidSupabaseConfig('', ''), false);
  assert.equal(isValidSupabaseConfig('https://YOUR-PROJECT.supabase.co', 'YOUR-PUBLISHABLE-KEY'), false);
  assert.equal(isValidSupabaseConfig('https://sample-project.supabase.co', 'sb_publishable_1234567890abcdef'), true);
});

test('normalizes and bounds outgoing message body', () => {
  assert.equal(normalizeMessage('  سلام\r\nدنیا  '), 'سلام\nدنیا');
  assert.equal(normalizeMessage(' \n '), '');
  assert.equal(normalizeMessage('x'.repeat(5001)), null);
});

test('only accepts the trusted app_metadata support role', () => {
  assert.equal(isSupportAgent({ app_metadata: { role: 'support' } }), true);
  assert.equal(isSupportAgent({ user_metadata: { role: 'support' } }), false);
  assert.equal(isSupportAgent({ app_metadata: { role: 'user' }, user_metadata: { role: 'support' } }), false);
});

test('maps known support statuses to Persian labels and handles unknown values', () => {
  assert.equal(statusLabel('open'), 'باز');
  assert.equal(statusLabel('answered'), 'پاسخ داده شده');
  assert.equal(statusLabel('closed'), 'بسته');
  assert.equal(statusLabel('unexpected'), 'نامشخص');
});
