import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('creator page is reachable from navigation and page renderer', () => {
  assert.match(html, /\['about','ℹ️','دربارهٔ سازنده'\]/);
  assert.match(html, /about:renderAbout/);
  assert.match(html, /function renderAbout\(\)/);
  assert.match(html, /محمد فرخی/);
});

test('footer exposes working in-app navigation and repository link', () => {
  assert.match(html, /class="footer site-footer"/);
  assert.match(html, /data-page="about">دربارهٔ سازنده/);
  assert.match(html, /https:\/\/github\.com\/emamzaman313\/rahe-talabegi/);
});

test('refreshed UI keeps mobile layout and reduced-motion support', () => {
  assert.match(html, /id="hamghadam-ui-refresh"/);
  assert.match(html, /@media\(max-width:640px\)/);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /\.btn\.primary:hover/);
});
