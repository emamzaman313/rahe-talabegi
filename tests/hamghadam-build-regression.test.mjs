import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const planner = fs.readFileSync(path.join(root, 'src/planner-calendar.js'), 'utf8');
const suite = fs.readFileSync(path.join(root, 'src/hamghadam-suite.js'), 'utf8');

test('regression: calendar CSS string is closed before the next style rule', () => {
  assert.match(planner, /\.hg-cal-event time\{[^\n]*color:var\(--muted\)\}",\s*\n\s*"\.hg-cal-move/);
});

test('regression: chat composer HTML starts a template literal rather than raw JSX', () => {
  assert.match(suite, /const messageComposer=canSend\?`<form class="hgd-form" data-hgd-form="send-chat-message">/);
  assert.doesNotMatch(suite, /const messageComposer=canSend\?<form/);
});
