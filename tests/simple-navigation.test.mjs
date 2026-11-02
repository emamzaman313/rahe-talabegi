import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('home gives first-time users four clear starting actions', () => {
  assert.match(html, /امروز می‌خواهی چه کار کنی؟/);
  assert.match(html, /برنامه‌ریزی/);
  assert.match(html, /درس خواندن/);
  assert.match(html, /یادگیری عربی/);
  assert.match(html, /data-online-tab="chats"/);
});

test('navigation uses short everyday labels and keeps advanced pages grouped', () => {
  assert.match(html, /const NAV_GROUPS=\[\['شروع کن'/);
  assert.match(html, /\['بیشتر',\['sources','support','settings'\]\]/);
  assert.match(html, /'برنامه من'/);
  assert.match(html, /'کارهای امروز'/);
});

test('simple home keeps existing task actions and profile setup', () => {
  assert.match(html, /btn\('task-toggle'/);
  assert.match(html, /data-form="profile"/);
  assert.match(html, /id="hamghadam-simple-ui"/);
});
