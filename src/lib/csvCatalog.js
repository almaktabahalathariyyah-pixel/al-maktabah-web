'use client';

/**
 * Reads the metadata catalogue produced by scripts/extract-catalog.mjs and
 * matches its rows to the PDFs the owner picked.
 *
 * The catalogue is keyed by filename, which is the only thing a browser knows
 * about a local file. Everything else — title, author, category — is typed once
 * in a spreadsheet rather than 362 times in a form.
 */

/** Columns the uploader understands. Anything else in the file is ignored. */
export const CATALOG_COLUMNS = [
  'file',
  'title',
  'author',
  'translator',
  'category',
  'type',
  'publisher',
  'year',
  'pages',
  'language',
  'description',
];

/**
 * RFC 4180 parser.
 *
 * Hand-rolled because the descriptions in this catalogue contain commas,
 * quotes and newlines, and splitting on commas mangles every one of them.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let quoted = false;

  const clean = text.replace(/^﻿/, '');

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];

    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += c;
      continue;
    }

    if (c === '"') quoted = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\r') { /* handled by \n */ }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }

  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

/** Filenames vary by case and stray spaces; the key should not. */
const keyOf = (name) => String(name || '').trim().toLowerCase();

/**
 * Turns CSV text into a lookup keyed by filename.
 * Returns { rows, byFile, columns, missing } — `missing` names the expected
 * columns the file does not have, so the panel can say what is wrong.
 */
export function loadCatalog(text) {
  const parsed = parseCsv(text);
  if (parsed.length < 2) {
    return { rows: [], byFile: new Map(), columns: [], missing: CATALOG_COLUMNS };
  }

  const header = parsed[0].map((h) => h.trim().toLowerCase());
  const index = Object.fromEntries(header.map((h, i) => [h, i]));
  const missing = CATALOG_COLUMNS.filter((c) => index[c] === undefined);

  const rows = parsed.slice(1).map((cells) => {
    const row = {};
    for (const key of CATALOG_COLUMNS) {
      row[key] = index[key] === undefined ? '' : String(cells[index[key]] ?? '').trim();
    }
    return row;
  });

  const byFile = new Map();
  for (const row of rows) {
    if (row.file) byFile.set(keyOf(row.file), row);
  }

  return { rows, byFile, columns: header, missing };
}

/**
 * The catalogue row for a picked file.
 *
 * Falls back to ignoring the extension, because browsers and download tools
 * disagree about ".pdf" vs ".PDF" often enough to matter.
 */
export function matchRow(catalog, fileName) {
  if (!catalog?.byFile?.size) return null;

  const exact = catalog.byFile.get(keyOf(fileName));
  if (exact) return exact;

  const stem = keyOf(fileName).replace(/\.pdf$/i, '');
  for (const [key, row] of catalog.byFile) {
    if (key.replace(/\.pdf$/i, '') === stem) return row;
  }
  return null;
}

/** Builds the Firestore payload for one book from its catalogue row. */
export function bookFromRow(row, { file, driveUrl, telegramFileId = '', restricted = false }) {
  const pages = Number(row?.pages) || 0;
  const year = String(row?.year || '').trim();

  return {
    title: row?.title?.trim() || file.name.replace(/\.pdf$/i, ''),
    author: row?.author?.trim() || '',
    translator: row?.translator?.trim() || '',
    category: row?.category?.trim() || '',
    type: row?.type?.trim() || '',
    publisher: row?.publisher?.trim() || '',
    year,
    pages,
    language: row?.language?.trim() || '',
    description: row?.description?.trim() || '',
    restricted,
    driveUrl,
    telegramFileId,
    telegramUrl: '',
    coverUrl: '',
    downloadCount: 0,
    format: 'PDF',
    sizeBytes: file.size,
    size: `${(file.size / (1024 * 1024)).toFixed(2)} MB`,
    // Lets a re-run recognise what is already in the library.
    sourceFile: file.name,
    createdAt: new Date(),
  };
}
