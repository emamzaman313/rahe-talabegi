import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/hamghadam-auth.js', import.meta.url), 'utf8');

test('profile hydration has a bounded deadline and failed hydration can retry', () => {
  assert.match(source, /withDeadline\(supabase\.from\('profiles'\)\.select\(PROFILE_COLUMNS\)/);
  assert.match(source, /lastHydratedUserId = null;\s*notice = `وارد حساب شدی/);
});

test('discussion group discovery does not block successful sign-in', () => {
  assert.match(source, /if\(profile\?\.stage_confirmed\)void loadGroups\(\);/);
  assert.match(source, /data-onboarding-skip/);
  assert.match(source, /localStorage\.setItem\(skipKey,'1'\)/);
  assert.match(source, /withDeadline\(supabase\.rpc\('list_discussion_group_options'\)/);
});

test('resending verification and group actions have deadlines', () => {
  assert.match(source, /withDeadline\(pendingMode === 'recovery'/);
  assert.match(source, /withDeadline\(supabase\.rpc\('select_discussion_group'/);
});
