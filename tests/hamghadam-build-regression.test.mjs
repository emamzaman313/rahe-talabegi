import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const planner = fs.readFileSync(path.join(root, 'src/planner-calendar.js'), 'utf8');
const suite = fs.readFileSync(path.join(root, 'src/hamghadam-suite.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'src/hamghadam-admin-console.js'), 'utf8');

test('regression: calendar CSS string is closed before the next style rule', () => {
  assert.match(planner, /\.hg-cal-event time\{[^\n]*color:var\(--muted\)\}",\s*\n\s*"\.hg-cal-move/);
});

test('regression: chat composer HTML starts a template literal rather than raw JSX', () => {
  assert.match(suite, /const messageComposer=canSend\?`<form class="hgd-form" data-hgd-form="send-chat-message">/);
  assert.doesNotMatch(suite, /const messageComposer=canSend\?<form/);
});

test('navigation groups retain all pages and directly open online tabs without a timing race', () => {
  const nav = shell.match(/const NAV=\[(.*?)\];/s)?.[1] || '';
  const groups = shell.match(/const NAV_GROUPS=\[(.*?)\];/s)?.[1] || '';
  for (const [, page] of nav.matchAll(/\['([^']+)'/g)) assert.ok(groups.includes(page), `navigation page ${page} must remain reachable`);
  assert.match(shell, /function openOnlineTab\(tab\)[\s\S]*?hgd:open-tab/);
  assert.doesNotMatch(shell, /setTimeout\(\(\)=>document\.querySelector\('\[data-hgd-tab=/);
  assert.match(suite, /const TAB_GROUPS = \[/);
  assert.match(suite, /if\(contains\)group\.open=true/);
});

test('admin navigation groups retain every management tool and bundle fonts through Vite', () => {
  const tabs = admin.match(/const TAB=\[(.*?)\];/s)?.[1] || '';
  const groups = admin.match(/const TAB_GROUPS=\[(.*?)\];/s)?.[1] || '';
  for (const [, page] of tabs.matchAll(/\['([^']+)'/g)) assert.ok(groups.includes(page), `admin tab ${page} must remain reachable`);
  assert.match(admin, /data-admin-tab="\$\{id\}"/);
  assert.doesNotMatch(adminHtml, /node_modules\/@fontsource/);
  assert.match(admin, /import '@fontsource\/vazirmatn\/400\.css'/);
});
