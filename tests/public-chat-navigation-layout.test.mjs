import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const chat = fs.readFileSync(path.join(root, 'src/public-chat.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src/public-chat.css'), 'utf8');

test('public chat opens the room directory instead of auto-entering the first room', () => {
  assert.match(chat, /await loadRooms\(\);activeRoomId=null;messages=\[\];reactions=\[\];replyTarget=null;/);
  assert.match(chat, /اتاق‌های همگانی/);
  assert.match(chat, /یکی از اتاق‌های فهرست را انتخاب کن/);
  assert.doesNotMatch(chat, /await selectRoom\(rooms\.find\(r=>r\.id===activeRoomId\)\?\.id\|\|rooms\[0\]\.id/);
});

test('public chat has an explicit home button and a usage hint', () => {
  assert.match(chat, /data-hc="close" aria-label="بازگشت به خانه">⌂ خانه/);
  assert.match(chat, /نکته: برای دیدن پیام‌ها، یکی از اتاق‌های همگانی را انتخاب کن/);
});

test('RTL message layout prevents horizontal clipping and preserves mixed-direction text', () => {
  assert.match(styles, /\.hc-message-list\{direction:rtl;overflow-y:auto;overflow-x:hidden/);
  assert.match(styles, /\.hc-text\{direction:auto;unicode-bidi:plaintext/);
  assert.match(styles, /\.hc-message-body,\.hc-bubble,\.hc-text\{min-width:0;max-width:100%/);
});
