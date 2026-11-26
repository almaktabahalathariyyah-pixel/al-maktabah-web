/**
 * Groups multi-volume / multi-episode books belonging to the same series
 * (e.g. "ตอนที่ 1..13", "เล่มที่ 1..4", "ภาคที่ 1..3", "Volume 1..2",
 * "Part 1..8", "Book 01..08", "(ญุซที่ 1..2)", "EP 1..10") so BookDetail can
 * display them together as one album/series.
 */

import { normalizeSearch } from './searchMatch.js';

const SERIES_PATTERNS = [
  // Thai episodes: "... ตอนที่ 13", "... ตอน 2", "... (ตอนที่ 1)"
  {
    re: /^(.*?)\s*(?:[-–—:(]\s*)?ตอน\s*(?:ที่)?\s*0*(\d+)\s*\)?(?:\s*(.*))?$/u,
    makeLabel: (n) => `ตอนที่ ${n}`,
    unit: 'ตอน',
  },
  // Thai volumes: "... เล่มที่ 1", "... เล่ม 2"
  {
    re: /^(.*?)\s*(?:[-–—:(]\s*)?เล่ม\s*(?:ที่)?\s*0*(\d+)\s*\)?(?:\s*(.*))?$/u,
    makeLabel: (n) => `เล่มที่ ${n}`,
    unit: 'เล่ม',
  },
  // Thai parts/seasons: "... ภาคที่ 1", "... ภาค 2"
  {
    re: /^(.*?)\s*(?:[-–—:(]\s*)?ภาค\s*(?:ที่)?\s*0*(\d+)\s*\)?(?:\s*(.*))?$/u,
    makeLabel: (n) => `ภาคที่ ${n}`,
    unit: 'ภาค',
  },
  // Thai sets: "... ชุดที่ 1", "... ชุด 2"
  {
    re: /^(.*?)\s*(?:[-–—:(]\s*)?ชุด\s*(?:ที่)?\s*0*(\d+)\s*\)?(?:\s*(.*))?$/u,
    makeLabel: (n) => `ชุดที่ ${n}`,
    unit: 'ชุด',
  },
  // Thai Juz: "... (ญุซที่ 1)", "... ญุซ 2"
  {
    re: /^(.*?)\s*\(?\s*ญุซ[อ์]?\s*(?:ที่)?\s*0*(\d+)\s*\)?(?:\s*(.*))?$/u,
    makeLabel: (n) => `ญุซที่ ${n}`,
    unit: 'ญุซ',
  },
  // English Episode / EP: "... EP 1", "... EP.02", "... Episode 3"
  {
    re: /^(.*?)\s*(?:[-–—:(]\s*)?(?:Episode|Ep\.?)\s*0*(\d+)\s*\)?(.*)$/i,
    makeLabel: (n) => `EP ${n}`,
    unit: 'ตอน',
  },
  // English Book N: "Initiation of Hanbali Book 07 : ..."
  {
    re: /^(.*?)\s+Book\s+0*(\d+)\b(.*)$/i,
    makeLabel: (n) => `Book ${n}`,
    unit: 'เล่ม',
  },
  // English Volume / Vol: "... Volume 1", "... (Volume 2)", "... Vol 3", "... - Volume 1"
  {
    re: /^(.*?)\s*(?:[-–—:(]\s*)?(?:Volume|Vol\.?)\s+0*(\d+)\s*\)?(.*)$/i,
    makeLabel: (n) => `Volume ${n}`,
    unit: 'เล่ม',
  },
  // English Part: "... Part 1"
  {
    re: /^(.*?)\s*(?:[-–—:(]\s*)?Part\s+0*(\d+)\s*\)?(.*)$/i,
    makeLabel: (n) => `Part ${n}`,
    unit: 'ตอน',
  },
];

/** Extracts series identity and volume/episode number from a book title, or null if standalone. */
export function parseSeries(title) {
  const raw = String(title ?? '').trim();
  if (!raw) return null;

  for (const { re, makeLabel, unit } of SERIES_PATTERNS) {
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
      unit,
    };
  }
  return null;
}

/**
 * Finds every book in `allBooks` that shares the same series as `book`, sorted
 * by volume/episode number ascending. Returns [] when `book` is standalone or has no siblings.
 */
export function findSeriesBooks(book, allBooks) {
  const info = parseSeries(book?.title);
  if (!info || !Array.isArray(allBooks)) return [];

  const matches = [];
  const seen = new Set();
  for (const candidate of allBooks) {
    if (!candidate?.id || seen.has(String(candidate.id))) continue;
    const cInfo = parseSeries(candidate?.title);
    if (!cInfo || cInfo.baseNorm !== info.baseNorm) continue;
    seen.add(String(candidate.id));
    matches.push({
      book: candidate,
      volume: cInfo.volume,
      label: cInfo.label,
      unit: cInfo.unit,
      base: info.base,
    });
  }

  if (matches.length < 2) return [];
  matches.sort((a, b) => a.volume - b.volume || String(a.book.id).localeCompare(String(b.book.id)));
  return matches;
}

/**
 * Collapses multi-episode / multi-volume books in a shelf list into single album
 * entries while leaving standalone books untouched. Preserves the relative order
 * of the first-encountered book of each series.
 */
export function groupBooksIntoAlbums(books) {
  if (!Array.isArray(books) || books.length === 0) return [];

  // First pass: collect siblings by baseNorm
  const groups = new Map();
  for (const book of books) {
    const info = parseSeries(book?.title);
    if (!info) continue;
    let bucket = groups.get(info.baseNorm);
    if (!bucket) {
      bucket = { base: info.base, baseNorm: info.baseNorm, unit: info.unit, items: [] };
      groups.set(info.baseNorm, bucket);
    }
    bucket.items.push({ book, volume: info.volume, label: info.label, unit: info.unit });
  }

  // Sort items inside each multi-item album ascending by episode/volume number
  for (const bucket of groups.values()) {
    if (bucket.items.length >= 2) {
      bucket.items.sort(
        (a, b) => a.volume - b.volume || String(a.book.id).localeCompare(String(b.book.id))
      );
    }
  }

  // Second pass: emit entries in original shelf order
  const emittedAlbums = new Set();
  const entries = [];
  for (const book of books) {
    const info = parseSeries(book?.title);
    const bucket = info ? groups.get(info.baseNorm) : null;
    if (bucket && bucket.items.length >= 2) {
      if (emittedAlbums.has(bucket.baseNorm)) continue;
      emittedAlbums.add(bucket.baseNorm);
      // Prefer Episode/Volume 1 with a cover as the album's front cover
      const coverItem =
        bucket.items.find((it) => Boolean(it.book?.coverUrl)) || bucket.items[0];
      entries.push({
        kind: 'album',
        id: `album:${bucket.baseNorm}`,
        title: bucket.base,
        unit: bucket.unit,
        coverBook: coverItem.book,
        author: coverItem.book?.author,
        items: bucket.items,
      });
    } else {
      entries.push({
        kind: 'book',
        id: String(book.id),
        book,
      });
    }
  }
  return entries;
}
