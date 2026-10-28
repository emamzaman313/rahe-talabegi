import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const ai = fs.readFileSync(path.join(root, 'src/ai-assistant.js'), 'utf8');
const chat = fs.readFileSync(path.join(root, 'src/public-chat.js'), 'utf8');
const suite = fs.readFileSync(path.join(root, 'src/hamghadam-suite.js'), 'utf8');

test('AI assistant is loaded by the production app shell', () => {
  assert.match(html, /src="\.\/src\/ai-assistant\.js"/);
  assert.match(html, /src="\.\/src\/public-chat\.js"/);
  assert.match(html, /src="\.\/src\/hamghadam-suite\.js"/);
});

test('AI replies render Markdown without executing raw HTML or unsafe links', () => {
  assert.match(ai, /function escapeMarkdownHTML\(value\)/);
  assert.match(ai, /function markdownToHtml\(value\)/);
  assert.match(ai, /body\.innerHTML = markdownToHtml\(String\(msg\.content/);
  assert.match(ai, /hg-ai-copy/);
  assert.match(ai, /navigator\.clipboard/);
  assert.match(ai, /rel="noopener noreferrer"/);
  assert.match(ai, /escapeMarkdownHTML\(code\.join\('/);
  const start = ai.indexOf('function escapeMarkdownHTML(');
  const end = ai.indexOf('function renderTranscript()', start);
  assert.ok(start >= 0 && end > start, 'Markdown helper block must be present');
  const context = {};
  vm.runInNewContext(ai.slice(start, end) + '\nglobalThis.__renderMarkdown = markdownToHtml;', context);
  const tick = String.fromCharCode(96);
  const sample = '# Title\n\n<script>alert(1)</script>\n- **bold** and ' + tick + 'code' + tick + '\n\n[ok](https://example.com/path)\n[bad](javascript:alert(1))';
  const html = context.__renderMarkdown(sample);
  assert.match(html, /<h2>Title<\/h2>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/i);
  assert.match(html, /<a href="https:\/\/example\.com\/path"/);
  assert.doesNotMatch(html, /href="javascript:/i);
});

test('the Supabase chat layers preserve live rooms, group/private messaging and attachments', () => {
  assert.match(chat, /supabase\.channel\(/);
  assert.match(chat, /toggleReaction/);
  assert.match(chat, /reply_to/);
  assert.match(suite, /from\('chat_conversations'\)/);
  assert.match(suite, /from\('chat_messages'\)/);
  assert.match(suite, /upload-chat-attachment/);
});
