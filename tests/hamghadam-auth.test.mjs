import test from 'node:test';
import assert from 'node:assert/strict';
import {
  greetingName,
  normalizeDisplayName,
  normalizeFreeMinutes,
  normalizeStage,
  normalizeStudyStyle,
  profilePayload,
  trustedRole,
  roleLabel,
} from '../src/hamghadam-auth-utils.mjs';

test('normalizes display names, strips control characters, and caps length', () => {
  assert.equal(normalizeDisplayName('  علی\n  رضایی  '), 'علی رضایی');
  assert.equal(normalizeDisplayName('\u0000\u0007'), '');
  assert.equal(normalizeDisplayName('ا'.repeat(70)).length, 60);
  assert.equal(normalizeDisplayName('', 'fallback'), 'fallback');
});

test('bounds free time to the supported daily range', () => {
  assert.equal(normalizeFreeMinutes(-20), 0);
  assert.equal(normalizeFreeMinutes(2000), 1440);
  assert.equal(normalizeFreeMinutes('75.6'), 76);
  assert.equal(normalizeFreeMinutes('not-a-number', 45), 45);
});

test('allows only known study styles and supplies valid stage defaults', () => {
  assert.equal(normalizeStudyStyle('مباحثه'), 'مباحثه');
  assert.equal(normalizeStudyStyle('untrusted', 'ترکیبی'), 'ترکیبی');
  assert.equal(normalizeStage('  پایه\tدو  '), 'پایه دو');
  assert.equal(normalizeStage('', 'پایه یک'), 'پایه یک');
});

test('builds a bounded server profile from the legacy preferences form', () => {
  const form = new Map([['name', 'محمد'], ['stage', 'پایه یک'], ['freeMinutes', '90'], ['studyStyle', 'حل تمرین']]);
  const result = profilePayload({ get: (key) => form.get(key) }, {});
  assert.deepEqual(result, { display_name: 'محمد', stage: 'پایه یک', free_minutes: 90, study_style: 'حل تمرین' });
});

test('uses trusted app_metadata, never user_metadata, for roles', () => {
  assert.equal(trustedRole({ app_metadata: { role: 'support' } }), 'support');
  assert.equal(trustedRole({ user_metadata: { role: 'admin' } }), 'user');
  assert.equal(trustedRole({ app_metadata: { role: 'root' } }), 'user');
  assert.equal(roleLabel('owner'), 'مالک');
});

test('chooses profile name then email local part for greeting', () => {
  assert.equal(greetingName({ display_name: 'مریم' }, { email: 'x@example.com' }), 'مریم');
  assert.equal(greetingName({}, { email: 'x@example.com' }), 'x');
});
