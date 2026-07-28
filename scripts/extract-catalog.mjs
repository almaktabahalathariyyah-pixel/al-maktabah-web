/**
 * Builds a metadata catalogue for a folder of PDFs.
 *
 *   node scripts/extract-catalog.mjs "D:/Al-Maktabah Al-Athariyaah"
 *
 * Reads the first pages of every PDF with pdftotext and works out what each
 * book actually is. Filenames alone are not enough — plenty of them are just
 * digits — but the title page almost always says.
 *
 * The output feeds the admin bulk uploader, which pre-fills the form so the
 * owner reviews rather than types.
 *
 * Nothing here invents information. A field it cannot establish is left empty
 * and the book is flagged for review, because a wrong attribution on a
 * religious text is worse than a blank one.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const folder = process.argv[2];
const outFile = process.argv[3] || 'book-catalog.json';

if (!folder || !fs.existsSync(folder)) {
  console.error('Usage: node scripts/extract-catalog.mjs <folder> [out.json]');
  process.exit(1);
}

// ---------------------------------------------------------------- script ---

const THAI = /[\u0E00-\u0E7F]/;
const ARABIC = /[\u0600-\u06FF\u0750-\u077F]/;

/** Which script dominates — counted, not just "contains", so a bismillah
 *  on an English title page does not make the book Arabic. */
function detectLanguage(text) {
  const thai = (text.match(/[\u0E00-\u0E7F]/g) || []).length;
  const arabic = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;

  const total = thai + arabic + latin;
  // A filename alone can be short, and for a scanned book it is all there is.
  if (total < 6) return { language: '', confidence: 'low' };

  if (thai / total > 0.25) return { language: 'ไทย', confidence: 'high' };
  if (arabic / total > 0.5) return { language: 'อาหรับ', confidence: 'high' };
  if (latin / total > 0.5) return { language: 'อังกฤษ', confidence: 'high' };
  return { language: '', confidence: 'low' };
}

// Scholars and imams whose names appear on these title pages. Matching a name
// the page actually prints is identification; guessing one is not.
const AUTHOR_PATTERNS = [
  [/ibn\s+taymiyy?ah|ابن تيمية|อิบนุ ตัยมียะฮ/i, 'Ibn Taymiyyah'],
  [/ibn\s+al[- ]?qayyim|ابن القيم|อิบนุ ก็อยยิม/i, 'Ibn al-Qayyim'],
  [/ibn\s+kathir|ابن كثير|อิบนุ กะษีร/i, 'Ibn Kathir'],
  [/(as|al)[- ]?sa'?di|السعدي|อัสสะอฺดีย/i, 'Abdur-Rahman ibn Nasir as-Sa\'di'],
  [/al[- ]?'?uthaym[ie]+n|العثيمين|อุษัยมีน/i, 'Muhammad ibn Salih al-Uthaymin'],
  [/ibn\s+baa?z|ابن باز|อิบนุ บาซ/i, 'Abdul-Aziz ibn Baz'],
  [/al[- ]?albani|الألباني|อัลบานีย/i, 'Muhammad Nasir-ud-Din al-Albani'],
  [/al[- ]?fawzan|الفوزان|เฟาซาน/i, 'Salih al-Fawzan'],
  [/rabee['’]?\s*(bin|ibn)?\s*haadee|ربيع|ร่อบีอฺ/i, 'Rabee\' ibn Hadi al-Madkhali'],
  [/an[- ]?nawaw[iy]|النووي|นะวะวี/i, 'Imam an-Nawawi'],
  [/muhammad\s+(ibn|bin)\s+abdul?[- ]?wahhab|محمد بن عبد الوهاب|อับดิลวะฮาบ/i, 'Muhammad ibn Abdul-Wahhab'],
  [/al[- ]?ajurr[iy]|الآجري|อัลอาญุรรีย/i, 'Al-Ajurri'],
  [/abdur[- ]?razzaq\s+al[- ]?badr|عبد الرزاق البدر/i, 'Abdur-Razzaq al-Badr'],
  [/zakir\s+naik|ซากิร\s*ไนค/i, 'Zakir Naik'],
  [/ดิเรก\s*กุลสิริสวัสดิ/i, 'ดิเรก กุลสิริสวัสดิ์'],
  [/อิสฮาก\s*พงษ์มณี/i, 'อิสฮาก พงษ์มณี'],
];

const TYPE_PATTERNS = [
  [/\b(fatwa|fataawa|fatawa|ฟัตวา)\b/i, 'ฟัตวา'],
  [/\b(khutbah|khutba|คุตบะฮ)\b/i, 'คุตบะฮ์'],
  [/\b(tafsir|tafseer|ตัฟซีร)\b/i, 'ตัฟซีร'],
  [/\b(hadith|ahadith|หะดีษ|หะดิษ)\b/i, 'หะดีษ'],
  [/\b(aqidah|aqeedah|creed|อะกีดะฮ)\b/i, 'อะกีดะฮ์'],
  [/\b(fiqh|ฟิกฮ)\b/i, 'ฟิกฮ์'],
  [/\b(seerah|sirah|ชีวประวัติ)\b/i, 'ชีวประวัติ'],
  [/\b(poem|manzumah|บทกวี)\b/i, 'บทกวี'],
];

/** Lines that are page furniture, not the title. */
const NOISE = [
  /^\d+$/,
  /^page\s*\d+/i,
  /^(published|copyright|all rights)/i,
  /^www\./i,
  /^https?:/i,
  /^بسم الله/,
  /^\s*$/,
];

function isNoise(line) {
  return NOISE.some((re) => re.test(line.trim()));
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'maktabah-'));

/**
 * pdftotext is handed the file through an ASCII temp copy.
 *
 * On Windows the child process receives the path in the system codepage, so a
 * Thai or Arabic filename arrives as question marks and the file "does not
 * exist" — which silently looked like "this PDF has no text layer" for a third
 * of the library.
 */
function firstPagesText(file, from = 1, to = 3) {
  const needsCopy = /[^\x20-\x7E]/.test(file);
  let target = file;

  try {
    if (needsCopy) {
      target = path.join(TMP, 'in.pdf');
      fs.copyFileSync(file, target);
    }

    return execFileSync('pdftotext', ['-f', String(from), '-l', String(to), '-enc', 'UTF-8', target, '-'], {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      timeout: 45000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

/** A filename stripped of the junk that download tools leave behind. */
function cleanFilename(name) {
  return name
    .replace(/\.pdf$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s*\b(revision|final|copy|v\d+)\b\s*/gi, ' ')
    .replace(/\s*\d{6}[_ ]\d{6}\s*/g, ' ') // 260329_174913 timestamps
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** True when a filename carries no information at all. */
function isOpaqueName(name) {
  const base = name.replace(/\.pdf$/i, '');
  return (
    /^[0-9a-f]{16,}$/i.test(base) ||
    /^[\d_\-]+$/.test(base) ||
    base.replace(/[^A-Za-z\u0E00-\u0E7F\u0600-\u06FF]/g, '').length < 4
  );
}

/**
 * The title, taken from the title page when it is legible.
 * Prefers a repeated line — cover pages usually print the title more than once.
 */
function pickTitle(text, fallback) {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 6 && l.length <= 120 && !isNoise(l));

  if (lines.length === 0) return { title: fallback, source: 'filename' };

  const counts = new Map();
  lines.slice(0, 25).forEach((l) => counts.set(l, (counts.get(l) || 0) + 1));

  const repeated = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1]);

  if (repeated.length > 0) return { title: repeated[0][0], source: 'cover-repeated' };
  return { title: lines[0], source: 'cover-first' };
}

function matchFirst(patterns, text) {
  for (const [re, value] of patterns) {
    if (re.test(text)) return value;
  }
  return '';
}

// Honorifics that precede a name rather than being part of it.
const TITLES = String.raw`(?:sh|shaykh|shaikh|sheikh|imam|imām|al[- ]?'?all[aā]{1,2}mah|ustadh|ust|dr|prof)\.?\s*`;

/**
 * A byline, when the filename states one outright.
 *
 * This is reading, not guessing: it only fires on an explicit "by", "โดย" or
 * an honorific. Far more of these files name their author in the filename than
 * a fixed list of scholars could ever cover.
 */
const BYLINE_PATTERNS = [
  new RegExp(String.raw`\bby\s+(?:${TITLES})?([A-Z][\w'’\-]*(?:\s+(?:bin|ibn|abu|abd[a-z]*|[a-z]{1,3}[-'’][\w'’\-]+|al|ad|ar|as|az|el|[A-Z][\w'’\-]*)){0,5})`, 'i'),
  new RegExp(String.raw`โดย\s*(?:ชัยค์|เชค|ท่าน|อ\.|อาจารย์)?\s*([฀-๿][฀-๿\s.'’-]{2,50})`),
  // An honorific with a following name, e.g. "Sh_Abdullah_al_Fawzan".
  new RegExp(String.raw`\b(?:${TITLES})([A-Z'’][\w'’\-]*(?:\s+(?:bin|ibn|al|ad|ar|as|az|abu|abd[a-z]*|[A-Z][\w'’\-]*)){1,5})`),
];

// Words that show a capture is prose, not a name.
const NOT_A_NAME =
  /\b(this|that|these|those|work|means|decree|table|contents|publisher|publishers|rights|reserved|any|the\s+(noble|great))\b/i;

/** Cleans up a captured byline: strip separators, volume markers, extensions. */
function tidyName(raw) {
  return raw
    .replace(/[_]+/g, ' ')
    .replace(/\b(vol|volume|part|no)\b\.?\s*\d*/gi, '')
    .replace(/\.pdf$/i, '')
    .replace(/[\s,._-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractByline(text) {
  for (const re of BYLINE_PATTERNS) {
    const m = text.match(re);
    if (m?.[1]) {
      const name = tidyName(m[1]);
      // Two characters is a fragment, sixty is a sentence. Neither is a name.
      if (name.length < 3 || name.length > 60) continue;
      if (NOT_A_NAME.test(name)) continue;
      return name;
    }
  }
  return '';
}

// ------------------------------------------------------------------ main ---

const files = fs
  .readdirSync(folder)
  .filter((f) => f.toLowerCase().endsWith('.pdf'))
  .sort();

console.error(`Reading ${files.length} PDFs from ${folder}\n`);

const catalog = [];
let done = 0;

for (const file of files) {
  const full = path.join(folder, file);
  const stat = fs.statSync(full);

  // Many of these books open with a scanned cover image and only start their
  // text layer a few pages in, so an empty first page is not proof of a scan.
  // Note pdftotext returns a form feed even for an image page, which is
  // truthy — hence the trim before deciding there is nothing there.
  let text = firstPagesText(full, 1, 3).trim();
  if (text.length < 50) text = firstPagesText(full, 4, 9).trim();

  const head = text.slice(0, 4000);

  const opaque = isOpaqueName(file);
  const fromName = cleanFilename(file);
  const picked = pickTitle(head, fromName);

  // Trust the cover over an opaque filename; trust a descriptive filename
  // over a cover line that may be a header.
  const title = opaque || picked.source === 'cover-repeated' ? picked.title : fromName;

  const searchSpace = `${file}\n${head}`;
  // The filename is evidence too — often the only evidence, for a pure scan.
  const { language, confidence: langConfidence } = detectLanguage(
    head.length > 40 ? searchSpace : file
  );
  // A known scholar wins, because the canonical spelling beats whatever the
  // filename happened to use. Otherwise take a byline the FILENAME states.
  //
  // Body text is deliberately not mined for this. It produced "Allah's decree"
  // and "any means" — an honorific in a sentence is not a byline, and a wrong
  // attribution on a religious text is worse than an empty field.
  const author = matchFirst(AUTHOR_PATTERNS, searchSpace) || extractByline(cleanFilename(file));

  const type = matchFirst(TYPE_PATTERNS, searchSpace);

  // Worth a human glance when we could not establish what the book even is:
  // an uninformative filename on a scan leaves nothing to go on.
  const needsReview = !title || title.length < 4 || !language || (opaque && head.length <= 50);

  catalog.push({
    file,
    sizeBytes: stat.size,
    title,
    titleSource: opaque ? picked.source : 'filename',
    author,
    translator: '',
    language,
    type,
    description: '',
    hasText: head.length > 50,
    scanned: head.length <= 50,
    needsReview,
  });

  done += 1;
  if (done % 25 === 0) console.error(`  ${done}/${files.length}`);
}

fs.writeFileSync(outFile, JSON.stringify(catalog, null, 2));

// A spreadsheet copy, so the owner can correct 362 rows in the tool built for
// correcting 362 rows. Re-import it by saving back over the JSON, or just use
// it as a checklist.
const csvFile = outFile.replace(/\.json$/, '.csv');
const columns = ['file', 'title', 'author', 'translator', 'language', 'type', 'description'];
const escapeCsv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

fs.writeFileSync(
  csvFile,
  '﻿' + // BOM, so Excel opens Thai correctly instead of as mojibake
    [columns.join(','), ...catalog.map((b) => columns.map((c) => escapeCsv(b[c])).join(','))].join('\r\n')
);

const stats = {
  total: catalog.length,
  withTitle: catalog.filter((b) => b.title && b.title.length > 3).length,
  withAuthor: catalog.filter((b) => b.author).length,
  withLanguage: catalog.filter((b) => b.language).length,
  withType: catalog.filter((b) => b.type).length,
  scanned: catalog.filter((b) => !b.hasText).length,
  needsReview: catalog.filter((b) => b.needsReview).length,
  totalGB: (catalog.reduce((s, b) => s + b.sizeBytes, 0) / 1024 ** 3).toFixed(2),
  mirrorable: catalog.filter((b) => b.sizeBytes <= 20 * 1024 * 1024).length,
};

console.error('\n' + JSON.stringify(stats, null, 2));
console.error(`\nWrote ${outFile}`);
