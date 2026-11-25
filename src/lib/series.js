/**
 * Groups multi-volume books belonging to the same series (e.g. "เล่มที่ 1..4",
 * "Volume 1..2", "Part 1..8", "Book 01..08", "(ญุซที่ 1..2)") so BookDetail can
 * offer direct links between volumes without extra Firestore reads.
 */

import { normalizeSearch } from './searchMatch';

const SERIES_PATTERNS = [
  // Thai: "... เล่มที่ 1" / "... เล่ม 2"
  { re: /^(.*?)\s*เล่ม\s*ที่?\s*(\d+)(?:\s*(.*))?$/u, makeLabel: (n) => `เล่มที่ ${n}` },
  // Thai Juz: "... (ญุซที่ 1)" / "... ญุซ 2"
  { re: /^(.*?)\s*\(?\s*ญุซ[อ์]?\s*ที่?\s*(\d+)\s*\)?(?:\s*(.*))?$/u, makeLabel: (n) => `ญุซที่ ${n}` },
  // English Book N: "Initiation of Hanbali Book 07 : ..."
  { re: /^(.*?)\s+Book\s+0*(\d+)\b(.*)$/i, makeLabel: (n) => `Book ${n}` },
  // English Volume / Vol: "... Volume 1", "... (Volume 2)", "... Vol 3", "... - Volume 1"
  { re: /^(.*?)\s*(?:[-–—:(]\s*)?(?:Volume|Vol\.?)\s+0*(\d+)\s*\)?(.*)$/i, makeLabel: (n) => `Volume ${n}` },
  // English Part: "... Part 1"
  { re: /^(.*?)\s*(?:[-–—:(]\s*)?Part\s+0*(\d+)\s*\)?(.*)$/i, makeLabel: (n) => `Part ${n}` },
];

/** Extracts series identity and volume number from a book title, or null if standalone. */
export function parseSeries(title) {
  const raw = String(title ?? '').trim();
  if (!raw) return null;

  for (const { re, makeLabel } of SERIES_PATTERNS) {
    const m = raw.match(re);
    if (!m) continue;
    const base = m[1].replace(/[-–—:\s(]+$/g, '').trim();
    const volume = Number(m[2]);
    if (!base || base.length < 4 || !Number.isFinite(volume)) continue;
    return {
      base,
      baseNorm: normalizeSearch(base),
      volume,
      label: makeLabel(volume),
    };
  }
  return null;
}

/**
 * Finds every book in `allBooks` that shares the same series as `book`, sorted
 * by volume number ascending. Returns [] when `book` is standalone or has no siblings.
 */
export function findSeriesBooks(book, allBooks) {
  const info = parseSeries(book?.title);
  if (!info || !Array.isArray(allBooks)) return [];

  const matches = [];
  for (const candidate of allBooks) {
    const cInfo = parseSeries(candidate?.title);
    if (!cInfo || cInfo.baseNorm !== info.baseNorm) continue;
    matches.push({ book: candidate, volume: cInfo.volume, label: cInfo.label });
  }

  if (matches.length < 2) return [];
  matches.sort((a, b) => a.volume - b.volume || String(a.book.id).localeCompare(String(b.book.id)));
  return matches;
}
