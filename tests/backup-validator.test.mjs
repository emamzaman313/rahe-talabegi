import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const desktopHtml = fs.readFileSync(path.join(root, 'source/rahe-talabegi-desktop.html'), 'utf8');
const nativeHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const rahdan = fs.readFileSync(path.join(root, 'source/rahdan.html'));

function validatorFrom(html) {
  const match = html.match(/function isValidBackup\(x\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(match, 'backup validator must be present');
  return vm.runInNewContext(`(function isValidBackup(x){${match[1]}\n})`);
}

test('standalone HTML inline JavaScript parses', () => {
  const script = desktopHtml.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  assert.ok(script);
  assert.doesNotThrow(() => new vm.Script(script));
});

test('Android copy retains complete program modules and Rahdan embedding', () => {
  assert.match(nativeHtml, /function renderSupport\(\)/);
  assert.match(nativeHtml, /function renderRahdan\(\)/);
  assert.match(nativeHtml, /const RAHDAN_B64=/);
  const encoded = nativeHtml.match(/const RAHDAN_B64='([A-Za-z0-9+/=]+)'/);
  assert.ok(encoded, 'embedded Rahdan base64 must exist');
  assert.deepEqual(Buffer.from(encoded[1], 'base64'), rahdan, 'embedded Rahdan file must remain byte-identical');
});

test('backup validator accepts an exported-shaped backup and rejects malformed data', () => {
  const validate = validatorFrom(desktopHtml);
  const good = { version:1, profile:{}, ui:{}, goals:[], tasks:[], books:[], notes:[], cards:[], mistakes:[], goalsArchive:[], daily:{}, reflections:{}, contentDone:[], bookmarks:[], mediaAudits:[], amrRecords:[], familyPlans:[], sources:[] };
  assert.equal(validate(good), true);
  assert.equal(validate({ ...good, tasks:[null] }), false);
  assert.equal(validate({ ...good, version:99 }), false);
  assert.equal(validate({ ...good, daily:[] }), false);
});
