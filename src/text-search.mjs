export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ک/g, 'ك')
    .replace(/ی/g, 'ي')
    .replace(/[\u200c\u200e\u200f\u202a-\u202e]/g, ' ')
    .toLocaleLowerCase('ar')
    .replace(/\s+/g, ' ')
    .trim();
}

export function searchBookPages(pages, query, limit = 80) {
  const q = normalizeSearchText(query);
  if (!q) return [];
  const results = [];
  for (const page of pages || []) {
    const text = normalizeSearchText(page.text);
    let from = 0;
    while (results.length < limit) {
      const index = text.indexOf(q, from);
      if (index < 0) break;
      const start = Math.max(0, index - 110);
      const end = Math.min(String(page.text || '').length, index + q.length + 150);
      results.push({ page: page.page, index, snippet: String(page.text || '').slice(start, end).replace(/\s+/g, ' ').trim() });
      from = index + Math.max(1, q.length);
    }
    if (results.length >= limit) break;
  }
  return results;
}
