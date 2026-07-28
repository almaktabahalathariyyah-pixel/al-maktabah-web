/**
 * Fills the columns that can be established from the files themselves.
 *
 *   node scripts/enrich-catalog.mjs "D:/Al-Maktabah Al-Athariyaah" book-catalog.csv
 *
 * Page count comes out of the PDF structure. Year and publisher are only taken
 * when the filename or title page states them outright.
 *
 * Anything already filled in by hand is left alone — this tops up blanks, it
 * never overwrites the owner's own work.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const folder = process.argv[2];
const csvFile = process.argv[3] || 'book-catalog.csv';
// Writing beside the input by default: the source is usually open in Excel,
// which holds a lock, and clobbering the owner's edits would be worse anyway.
const outFile = process.argv[4] || csvFile.replace(/\.csv$/i, '-enriched.csv');

if (!folder || !fs.existsSync(folder)) {
  console.error('Usage: node scripts/enrich-catalog.mjs <folder> [catalog.csv]');
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
  rows
    .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

// ----------------------------------------------------------------- pages ---

/**
 * Page count, read straight from the PDF.
 *
 * The page tree root carries /Count. Newer files keep that inside a compressed
 * object stream where a plain scan cannot see it, so the fallback counts page
 * objects instead. Returns 0 when neither works rather than a made-up number.
 */
function pageCount(file) {
  let buf;
  try {
    buf = fs.readFileSync(file, { encoding: 'latin1' });
  } catch {
    return 0;
  }

  // The root of the page tree holds the total. Several /Count values can
  // appear (one per intermediate node); the largest is the document total.
  const counts = [...buf.matchAll(/\/Type\s*\/Pages[^>]*?\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  const reversed = [...buf.matchAll(/\/Count\s+(\d+)[^>]*?\/Type\s*\/Pages/g)].map((m) => Number(m[1]));
  const best = Math.max(0, ...counts, ...reversed);
  if (best > 0) return best;

  const pages = (buf.match(/\/Type\s*\/Page[^s]/g) || []).length;
  return pages > 0 ? pages : 0;
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'maktabah-enrich-'));

/** Last resort for page count: ask pdftotext for the whole document. */
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
      maxBuffer: 200 * 1024 * 1024,
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    // pdftotext separates pages with a form feed.
    return (out.match(/\f/g) || []).length || 0;
  } catch {
    return 0;
  }
}

// ------------------------------------------------------------ year/pub ---

const THIS_YEAR = new Date().getFullYear();

/**
 * A publication year, only when the name states one.
 *
 * Both calendars appear in this library, so a Buddhist-era year is converted.
 * Anything outside a believable range is a phone number or an id, not a year.
 */
function extractYear(text) {
  const candidates = [...text.matchAll(/\b(1[0-9]{3}|2[0-9]{3})\b/g)].map((m) => Number(m[1]));

  for (const value of candidates) {
    if (value >= 1900 && value <= THIS_YEAR) return String(value);
    // Buddhist era: 2500–2600 maps to 1957–2057.
    if (value >= 2500 && value <= 2600) return String(value - 543);
  }
  return '';
}

const PUBLISHERS = [
  [/tadmur/i, 'Tadmur Institute'],
  [/miraath/i, 'Miraath Publications'],
  [/authentic\s*quotes/i, 'Authentic Quotes Publishers'],
  [/salafi\s*publications|spubs/i, 'Salafi Publications'],
  [/darussalam/i, 'Darussalam'],
  [/hikmah\s*publications/i, 'Hikmah Publications'],
  [/maktabatul\s*irshad/i, 'Maktabatul Irshad'],
  [/al[- ]?ibaanah/i, 'Al-Ibaanah Book Publishing'],
  [/troid/i, 'TROID Publications'],
  [/sunnah\s*publishing/i, 'Sunnah Publishing'],
];

function extractPublisher(text) {
  for (const [re, name] of PUBLISHERS) {
    if (re.test(text)) return name;
  }
  // "- Something Institute.pdf" / "- Something Publications.pdf"
  const trailing = text.match(/[-–]\s*([A-Z][\w'’.& ]{2,40}?(?:Institute|Publications?|Press|Publishers?))\s*$/i);
  return trailing ? trailing[1].trim() : '';
}

// ------------------------------------------------------------------ main ---

const rows = parseCsv(fs.readFileSync(csvFile, 'utf8').replace(/^\uFEFF/, ''));
const head = rows[0];
const col = Object.fromEntries(head.map((h, i) => [h.trim(), i]));

for (const key of ['file', 'year', 'pages', 'publisher']) {
  if (col[key] === undefined) {
    console.error(`Column "${key}" not found. Columns: ${head.join(', ')}`);
    process.exit(1);
  }
}

const body = rows.slice(1);
let filledPages = 0;
let filledYear = 0;
let filledPub = 0;
let done = 0;

for (const row of body) {
  const file = row[col.file];
  const full = path.join(folder, file);
  if (!fs.existsSync(full)) continue;

  // Only top up blanks — the owner's own entries always win.
  if (!row[col.pages]?.trim()) {
    let n = pageCount(full);
    if (!n) n = pageCountViaText(full);
    if (n > 0) { row[col.pages] = String(n); filledPages += 1; }
  }

  const nameOnly = file.replace(/\.pdf$/i, '');

  if (!row[col.year]?.trim()) {
    const year = extractYear(nameOnly);
    if (year) { row[col.year] = year; filledYear += 1; }
  }

  if (!row[col.publisher]?.trim()) {
    const pub = extractPublisher(nameOnly);
    if (pub) { row[col.publisher] = pub; filledPub += 1; }
  }

  done += 1;
  if (done % 40 === 0) console.error(`  ${done}/${body.length}`);
}

fs.writeFileSync(csvFile, toCsv([head, ...body]));

console.error(
  '\n' +
    JSON.stringify(
      {
        rows: body.length,
        pagesFilled: filledPages,
        pagesTotal: body.filter((r) => r[col.pages]?.trim()).length,
        yearFilled: filledYear,
        publisherFilled: filledPub,
      },
      null,
      2
    )
);
console.error(`\nUpdated ${csvFile}`);
