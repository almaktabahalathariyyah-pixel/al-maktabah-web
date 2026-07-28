/**
 * Fills the catalogue: category, type, pages, year, publisher.
 *
 *   node scripts/fill-catalog.mjs "D:/Al-Maktabah Al-Athariyaah" book-catalog.csv
 *
 * Rules this follows, in order of importance:
 *
 *   1. Never overwrite a value the owner typed. Blanks only.
 *   2. Only ever write a category/type that exists in the site's dropdown,
 *      taken from scripts/vocabulary.mjs.
 *   3. Where a value cannot be established, leave it blank. A blank is easy
 *      to spot and fix; a confident wrong answer has to be found first.
 *
 * Existing values that predate the current vocabulary get normalised — the
 * earlier pass wrote 'ฟิกฮ์' and 'อะกีดะฮ์' before those lists existed.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CATEGORIES, TYPES, classifyCategory } from './vocabulary.mjs';

const folder = process.argv[2];
const csvFile = process.argv[3] || 'book-catalog.csv';
const outFile = process.argv[4] || csvFile;

if (!folder || !fs.existsSync(folder)) {
  console.error('Usage: node scripts/fill-catalog.mjs <folder> [in.csv] [out.csv]');
  process.exit(1);
}

// ------------------------------------------------------------------- csv ---

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\r') { /* ignore */ }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.length > 1);
}

const toCsv = (rows) =>
  '\uFEFF' +
  rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');

// -------------------------------------------------------------- normalise ---

/**
 * Values written before the site's vocabulary existed, mapped onto it.
 * Note ฎ vs ฏ in ฏอลิบุลอิลม์ — different letters that look alike, and the
 * dropdown only accepts one of them.
 */
const CATEGORY_ALIASES = {
  'อะกีดะฮ์': 'อะกีดะฮฺ',
  'หะดีษ': 'หะดีษและซุนนะฮฺ',
  'ฟิกฮ์': 'ฟิกฮฺและอิบาดะฮฺ',
  'ฟิกฮฺ': 'ฟิกฮฺและอิบาดะฮฺ',
  'ตัฟซีร': 'อัลกุรอานและตัฟซีร',
  'ฟัตวา': 'ถาม-ตอบ',
  'ชีวประวัติ': 'ชีวประวัติและประวัติศาสตร์',
  'คุตบะฮ์': 'เบ็ดเตล็ด',
  'บทกวี': 'เบ็ดเตล็ด',
  'ผู้แสวงหาความรู้ (ฎอลิบุลอิลม์)': 'ผู้แสวงหาความรู้ (ฏอลิบุลอิลม์)',
  'อเทวนิยมและลัทธิบูชาวิทยาศาสตร์': 'อเทวนิยมและลัทธิบูชาวิทยาศาสตร์',
};

const normaliseCategory = (value) => {
  const v = (value || '').trim();
  if (!v) return '';
  if (CATEGORIES.includes(v)) return v;
  return CATEGORY_ALIASES[v] || v;
};

// ----------------------------------------------------------------- pages ---

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'maktabah-fill-'));

/** Page count from the PDF page tree; 0 when it cannot be read. */
function pageCount(file) {
  let buf;
  try {
    buf = fs.readFileSync(file, { encoding: 'latin1' });
  } catch {
    return 0;
  }

  const forward = [...buf.matchAll(/\/Type\s*\/Pages\b[\s\S]{0,400}?\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  const backward = [...buf.matchAll(/\/Count\s+(\d+)[\s\S]{0,400}?\/Type\s*\/Pages\b/g)].map((m) => Number(m[1]));
  const best = Math.max(0, ...forward, ...backward);
  if (best > 0 && best < 20000) return best;

  const pages = (buf.match(/\/Type\s*\/Page[^s]/g) || []).length;
  return pages > 0 && pages < 20000 ? pages : 0;
}

/** Fallback: pdftotext separates pages with a form feed. */
function pageCountViaText(file) {
  const needsCopy = /[^\x20-\x7E]/.test(file);
  let target = file;
  try {
    if (needsCopy) {
      target = path.join(TMP, 'in.pdf');
      fs.copyFileSync(file, target);
    }
    const out = execFileSync('pdftotext', ['-enc', 'UTF-8', target, '-'], {
      encoding: 'utf8',
      maxBuffer: 300 * 1024 * 1024,
      timeout: 180000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return (out.match(/\f/g) || []).length;
  } catch {
    return 0;
  }
}

// --------------------------------------------------------- year/publisher ---

const THIS_YEAR = new Date().getFullYear();

/** A year only when the name states one; Buddhist era converted. */
function extractYear(text) {
  for (const m of text.matchAll(/\b(1[89][0-9]{2}|2[0-9]{3})\b/g)) {
    const value = Number(m[1]);
    if (value >= 2500 && value <= 2600) return String(value - 543);
    if (value >= 1900 && value <= THIS_YEAR) return String(value);
  }
  return '';
}

const PUBLISHERS = [
  [/tadmur/i, 'Tadmur Institute'],
  [/miraath/i, 'Miraath Publications'],
  [/authentic\s*quotes/i, 'Authentic Quotes Publishers'],
  [/salafi\s*publications|\bspubs\b/i, 'Salafi Publications'],
  [/darussalam/i, 'Darussalam'],
  [/hikmah\s*publications/i, 'Hikmah Publications'],
  [/maktabatul\s*irshad/i, 'Maktabatul Irshad'],
  [/al[- ]?ibaanah/i, 'Al-Ibaanah Book Publishing'],
  [/troid/i, 'TROID Publications'],
  [/sunnah\s*publishing/i, 'Sunnah Publishing'],
  [/dakwah\s*corner/i, 'Dakwah Corner Bookstore'],
];

function extractPublisher(text) {
  for (const [re, name] of PUBLISHERS) if (re.test(text)) return name;
  const trailing = text.match(/[-–]\s*([A-Z][\w'’.& ]{2,40}?(?:Institute|Publications?|Press|Publishers?))\s*$/i);
  return trailing ? trailing[1].trim() : '';
}

/**
 * Format, inferred from length.
 *
 * A dozen pages is a leaflet or an article, not a book. This is a heuristic and
 * says so — but it is the same call a librarian makes from the spine.
 */
function classifyType(pages) {
  if (!pages) return '';
  if (pages <= 12) return 'บทความ';
  return 'หนังสือ';
}

// ------------------------------------------------------------------ main ---

const rows = parseCsv(fs.readFileSync(csvFile, 'utf8').replace(/^\uFEFF/, ''));
const head = rows[0].map((h) => h.trim());
const col = Object.fromEntries(head.map((h, i) => [h, i]));

for (const key of ['file', 'title', 'category', 'type', 'year', 'pages', 'publisher']) {
  if (col[key] === undefined) {
    console.error(`Column "${key}" missing. Found: ${head.join(', ')}`);
    process.exit(1);
  }
}

const body = rows.slice(1);
const blank = (row, key) => !String(row[col[key]] ?? '').trim();
const stats = { pages: 0, year: 0, publisher: 0, category: 0, type: 0, normalised: 0, noCategory: [] };

let done = 0;
for (const row of body) {
  const file = row[col.file];
  const full = path.join(folder, file);
  const nameOnly = file.replace(/\.pdf$/i, '').replace(/[_]+/g, ' ');
  const subject = `${nameOnly}\n${row[col.title] || ''}`;

  // Bring older values onto the current vocabulary.
  const before = row[col.category];
  const after = normaliseCategory(before);
  if (after !== before) { row[col.category] = after; stats.normalised += 1; }

  if (fs.existsSync(full)) {
    if (blank(row, 'pages')) {
      const n = pageCount(full) || pageCountViaText(full);
      if (n > 0) { row[col.pages] = String(n); stats.pages += 1; }
    }
    if (blank(row, 'year')) {
      const y = extractYear(nameOnly);
      if (y) { row[col.year] = y; stats.year += 1; }
    }
    if (blank(row, 'publisher')) {
      const p = extractPublisher(nameOnly);
      if (p) { row[col.publisher] = p; stats.publisher += 1; }
    }
  }

  if (blank(row, 'category')) {
    const guess = classifyCategory(subject);
    if (guess) { row[col.category] = guess; stats.category += 1; }
    else stats.noCategory.push(file);
  }

  if (blank(row, 'type')) {
    const t = classifyType(Number(row[col.pages]) || 0);
    if (t) { row[col.type] = t; stats.type += 1; }
  }

  done += 1;
  if (done % 40 === 0) console.error(`  ${done}/${body.length}`);
}

fs.writeFileSync(outFile, toCsv([head, ...body]));

const filled = (key) => body.filter((r) => String(r[col[key]] ?? '').trim()).length;
const invalid = body.filter((r) => r[col.category] && !CATEGORIES.includes(r[col.category]));
const badType = body.filter((r) => r[col.type] && !TYPES.includes(r[col.type]));

console.error('\n' + JSON.stringify({
  rows: body.length,
  addedThisRun: { pages: stats.pages, year: stats.year, publisher: stats.publisher, category: stats.category, type: stats.type },
  normalisedOldValues: stats.normalised,
  nowFilled: {
    title: filled('title'), category: filled('category'), type: filled('type'),
    pages: filled('pages'), year: filled('year'), publisher: filled('publisher'),
    author: filled('author'), language: filled('language'),
  },
  stillBlankCategory: stats.noCategory.length,
  valuesOutsideVocabulary: { category: invalid.length, type: badType.length },
}, null, 2));

if (invalid.length) {
  console.error('\nCategories not in the site list:');
  [...new Set(invalid.map((r) => r[col.category]))].forEach((v) => console.error('  ' + v));
}
if (stats.noCategory.length) {
  fs.writeFileSync('catalog-needs-category.txt', stats.noCategory.join('\n'));
  console.error(`\n${stats.noCategory.length} files still need a category → catalog-needs-category.txt`);
}
console.error(`\nWrote ${outFile}`);
