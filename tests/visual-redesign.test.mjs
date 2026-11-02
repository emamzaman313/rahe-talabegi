import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('new visual system is present and defines light and dark palettes', () => {
  assert.match(html, /id="hamghadam-visual-rebuild"/);
  assert.match(html, /--teal:#5b55e7/);
  assert.match(html, /\.dark\s*\{/);
  assert.match(html, /@media\(max-width:640px\)/);
});

test('redesign retains the original app shell and navigation hooks', () => {
  for (const value of ['id="nav"', 'id="main"', 'data-act="go"', 'data-page="home"', 'id="global-search"']) {
    assert.ok(html.includes(value), 'missing existing app hook: ' + value);
  }
});

test('all original feature modules remain connected', () => {
  for (const path of [
    'src/support-chat.js', 'src/bidayat-al-nahw-ui.js', 'src/hamghadam-auth.js',
    'src/public-chat.js', 'src/smart-planner.js', 'src/task-reminders.js',
    'src/planner-calendar.js', 'src/hamghadam-suite.js', 'src/ai-assistant.js',
    'src/public-chat-moderation.js'
  ]) assert.ok(html.includes(path), 'missing feature module: ' + path);
});

test('creator profile is fully removed while app navigation remains', () => {
  assert.doesNotMatch(html, /دربارهٔ سازنده|دربارهٔ برنامه|function renderAbout|about:renderAbout/);
  assert.match(html, /data-page="home"/);
  assert.match(html, /data-page="settings"/);
});
test('modern minimal visual layer is present', () => {
  assert.match(html, /hamghadam-modern-minimal/);
  assert.match(html, /backdrop-filter:blur\(20px\)/);
  assert.match(html, /prefers-reduced-motion/);
});
