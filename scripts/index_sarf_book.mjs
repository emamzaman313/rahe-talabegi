import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/index_sarf_book.mjs <path-to-sarf-pdf>');
  process.exit(2);
}

const standardFontDataUrl = pathToFileURL(path.join(root, 'node_modules/pdfjs-dist/standard_fonts') + path.sep).href;
const bytes = new Uint8Array(await fs.readFile(path.resolve(input)));
const pdf = await getDocument({ data: bytes, standardFontDataUrl, useSystemFonts: true }).promise;
const pages = [];
const unindexedPages = [];

for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
  const page = await pdf.getPage(pageNumber);
  const content = await page.getTextContent();
  const text = content.items.map((item) => `${item.str}${item.hasEOL ? '\n' : ' '}`).join('')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .trim();
  if (text) pages.push({ page: pageNumber, text });
  else unindexedPages.push(pageNumber);
}

// The scanned cover is a blank watermark to the PDF text extractor; transcribe its visible title line.
if (unindexedPages[0] === 1) {
  pages.unshift({ page: 1, text: 'دانش صرف سید حمید جزایری' });
  unindexedPages.shift();
}

const output = path.join(root, 'public', 'books', 'sarf-search-index.json');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify({ title: 'دانش صرف', pageCount: pdf.numPages, indexedPageCount: pages.length, unindexedPages, pages })}\n`);
console.log(`Indexed ${pages.length}/${pdf.numPages} PDF pages (${unindexedPages.length} pages had no extractable text).`);
await pdf.destroy?.();
