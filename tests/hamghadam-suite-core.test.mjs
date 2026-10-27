import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HGD_FILE_LIMITS, HGD_REPORT_REASONS, HGD_ARGUMENT_TYPES, normalizeText,
  isAllowedHexColor, validateOccasion, selectActiveOccasion,
  nextReviewSchedule, validateUpload, safeLocalActionUrl,
} from '../src/hamghadam-suite-core.mjs';

test('chat/book caps match the prompt in binary MiB', () => {
  assert.equal(HGD_FILE_LIMITS.chatBytes, 50 * 1024 * 1024);
  assert.equal(HGD_FILE_LIMITS.personalBookBytes, 100 * 1024 * 1024);
});
test('report reasons cover the key prompt categories', () => {
  const keys = HGD_REPORT_REASONS.map(([key]) => key);
  for (const key of ['insult','harassment','off_topic','spam','scam','impersonation','privacy','inappropriate','hate','malicious_file','group_abuse','other']) assert.ok(keys.includes(key));
});
test('debate has explicit pro, oppose, question, rebuttal and source contribution types', () => {
  const keys = HGD_ARGUMENT_TYPES.map(([key]) => key);
  for (const key of ['support','oppose','question','rebuttal','source','summary']) assert.ok(keys.includes(key));
});
test('normalizeText removes NUL and bounds length', () => {
  assert.equal(normalizeText('  سَلام\0 دنیا  ', 20), 'سَلام دنیا');
  assert.equal(normalizeText('abcdefgh', 4), 'abcd');
});
test('hex color validation rejects CSS injection and shorthand', () => {
  assert.equal(isAllowedHexColor('#AABBCC'), true);
  assert.equal(isAllowedHexColor('#abc'), false);
  assert.equal(isAllowedHexColor('red; background:url(x)'), false);
});
test('valid occasion is normalized and accepted', () => {
  const result = validateOccasion({title:'ولادت', occasion_type:'birth', starts_at:'2026-10-27T00:00:00Z', ends_at:'2026-10-28T00:00:00Z', accent_color:'#C9A24A', background_color:'#F6F1E4'});
  assert.equal(result.ok, true);
  assert.equal(result.value.title, 'ولادت');
  assert.equal(result.value.starts_at, '2026-10-27T00:00:00.000Z');
});
test('invalid occasion dates return validation errors instead of throwing', () => {
  const result = validateOccasion({title:'شهادت', occasion_type:'martyrdom', starts_at:'not-a-date', ends_at:'not-a-date', accent_color:'#fff', background_color:'red'});
  assert.equal(result.ok, false);
  assert.ok(result.errors.length >= 2);
  assert.equal(result.value.starts_at, null);
  assert.equal(result.value.ends_at, null);
});
test('occasion end must be after its start and only known kinds are accepted', () => {
  const result = validateOccasion({title:'x', occasion_type:'surprise', starts_at:'2026-10-27T02:00:00Z', ends_at:'2026-10-27T01:00:00Z', accent_color:'#000000', background_color:'#FFFFFF'});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((x) => x.includes('پایان')));
  assert.ok(result.errors.some((x) => x.includes('نوع')));
});
test('active occasion selects highest priority among current enabled windows', () => {
  const now = new Date('2026-10-27T12:00:00Z');
  const rows = [
    {id:'old', enabled:true, priority:100, starts_at:'2026-10-01Z', ends_at:'2026-10-05Z'},
    {id:'disabled', enabled:false, priority:100, starts_at:'2026-10-26Z', ends_at:'2026-10-28Z'},
    {id:'birth', enabled:true, priority:1, starts_at:'2026-10-26T00:00:00Z', ends_at:'2026-10-29T00:00:00Z'},
    {id:'martyrdom', enabled:true, priority:2, starts_at:'2026-10-27T00:00:00Z', ends_at:'2026-10-28T00:00:00Z'},
  ];
  assert.equal(selectActiveOccasion(rows, now).id, 'martyrdom');
});
test('spaced repetition returns increasing review intervals after successful recall', () => {
  const first = nextReviewSchedule({quality:4,intervalDays:0,easeFactor:2.5,repetitions:0}, new Date('2026-10-27T12:00:00Z'));
  const second = nextReviewSchedule({quality:4,intervalDays:first.intervalDays,easeFactor:first.easeFactor,repetitions:first.repetitions}, new Date('2026-10-27T12:00:00Z'));
  assert.equal(first.intervalDays, 1);
  assert.equal(second.intervalDays, 6);
  assert.ok(Number.isFinite(Date.parse(second.dueAt)));
});
test('failed recall resets the repetition count', () => {
  const result = nextReviewSchedule({quality:1,intervalDays:30,easeFactor:2.5,repetitions:4});
  assert.equal(result.intervalDays, 1);
  assert.equal(result.repetitions, 0);
});
test('upload validation rejects empty, oversized, and wrong MIME files', () => {
  assert.equal(validateUpload(null, 100, ['application/pdf']).ok, false);
  assert.equal(validateUpload({size:0,type:'application/pdf'}, 100, ['application/pdf']).ok, false);
  assert.equal(validateUpload({size:101,type:'application/pdf'}, 100, ['application/pdf']).ok, false);
  assert.equal(validateUpload({size:50,type:'image/svg+xml'}, 100, ['application/pdf']).ok, false);
  assert.equal(validateUpload({size:50,type:'application/pdf'}, 100, ['application/pdf']).ok, true);
});
test('invite action URL rejects scheme-relative and newline URLs', () => {
  assert.equal(safeLocalActionUrl('/index.html?invite=abc'), '/index.html?invite=abc');
  assert.equal(safeLocalActionUrl('//evil.example'), null);
  assert.equal(safeLocalActionUrl('javascript:alert(1)'), null);
  assert.equal(safeLocalActionUrl('/ok\nLocation: https://evil'), null);
});
