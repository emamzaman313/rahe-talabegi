import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/hamghadam-visual-system.css', import.meta.url), 'utf8');

test('v3 visual foundation is loaded after the legacy styles', () => {
  assert.match(html, /hamghadam-visual-system\.css\?v=3/);
  assert.match(css, /--teal:#6258e8/);
  assert.match(css, /linear-gradient\(118deg,#24264d 0%,#554bd0 56%,#169c91 100%\)/);
});

test('responsive navigation and phone layouts are defined', () => {
  assert.match(css, /@media\(max-width:1050px\)/);
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /overflow-x:auto/);
});

test('dark theme, keyboard focus and reduced motion remain supported', () => {
  assert.match(css, /\.dark\{/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:reduce/);
});

test('existing app shell and feature entry points remain intact', () => {
  for (const hook of ['id="nav"', 'id="main"', 'data-page="home"', 'id="global-search"']) {
    assert.ok(html.includes(hook), 'missing app hook: ' + hook);
  }
  for (const module of ['src/hamghadam-auth.js', 'src/public-chat.js', 'src/smart-planner.js', 'src/hamghadam-suite.js', 'src/ai-assistant.js']) {
    assert.ok(html.includes(module), 'missing feature module: ' + module);
  }
});
