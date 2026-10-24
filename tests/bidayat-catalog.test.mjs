import test from 'node:test';
import assert from 'node:assert/strict';
import { BIDAYAT_AL_NAHW, flattenBidayatTopics } from '../src/bidayat-al-nahw-catalog.mjs';

test('catalog preserves the Arabic title and the source language', () => {
  assert.equal(BIDAYAT_AL_NAHW.titleArabic, 'بداية النحو');
  assert.equal(BIDAYAT_AL_NAHW.language, 'ar');
  assert.equal(BIDAYAT_AL_NAHW.sourceType, 'scanned-pdf');
});

test('catalog includes the main syntactic sections in source order', () => {
  const titles = BIDAYAT_AL_NAHW.chapters.map((chapter) => chapter.titleArabic);
  assert.deepEqual(titles.slice(0, 4), [
    'المقدمة',
    'المقصد الأول: المرفوعات',
    'المقصد الثاني: المنصوبات',
    'المقصد الثالث: المجرورات',
  ]);
  assert.ok(titles.includes('المقصد الخامس: التوابع'));
  assert.ok(titles.includes('المقصد الثامن: الأدوات'));
  assert.equal(titles.at(-1), 'المصادر والمآخذ');
});

test('catalog flattens to a stable list of chapter and topic entries', () => {
  const entries = flattenBidayatTopics();
  assert.ok(entries.some((entry) => entry.titleArabic === 'المبتدأ' && entry.kind === 'topic'));
  assert.ok(entries.some((entry) => entry.titleArabic === 'المقصد الأول: المرفوعات' && entry.kind === 'chapter'));
});

test('does not invent unverified printed page mappings for the scanned book', () => {
  const topics = flattenBidayatTopics().filter((entry) => entry.kind === 'topic');
  assert.ok(topics.length > 50);
  assert.ok(topics.every((entry) => !('printedPage' in entry)));
  assert.ok(topics.every((entry) => entry.titleArabic && entry.titlePersian));
});

test('catalog identifiers are unique for stable navigation', () => {
  const ids = flattenBidayatTopics().map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
});
