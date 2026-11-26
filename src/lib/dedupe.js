/**
 * Detects duplicate books (different spellings / transliterations / subtitles for
 * the same book or same series volume) and duplicate person/publisher names
 * across the catalog so admins can review and merge them cleanly.
 */

import { parseSeries } from './series.js';
import { asList } from './people.js';

/** Extracts Google Drive file ID from a Drive URL if present. */
export function extractDriveId(url) {
  const s = String(url ?? '').trim();
  if (!s) return '';
  const m =
    s.match(/\/d\/([a-zA-Z0-9_-]{15,})/) ||
    s.match(/[?&]id=([a-zA-Z0-9_-]{15,})/);
  return m ? m[1] : '';
}

/**
 * Aggressive transliteration & spelling normalizer for Islamic titles (EN/TH/AR).
 * Turns "Majmūʿ al-Fatāwā" and "Majmu' al-Fatawa" into the exact same key.
 */
export function canonicalTitleKey(raw) {
  let s = String(raw ?? '').trim().normalize('NFD');
  // Strip combining Latin diacritics (macrons, underdots, etc.)
  s = s.replace(/[\u0300-\u036f]/g, '');
  // Strip Arabic harakat & tatweel
  s = s.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  // Normalize Arabic alef/taa marbuta/yaa variants
  s = s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  // Lowercase
  s = s.toLowerCase();
  // Remove ayn/hamza/apostrophe/punctuation/brackets/dashes
  s = s.replace(/[ʿʾʻʼ'’`´"“”.,:;!?()[\]{}<>/\\|–—\-_~•·ฯๆ์]/g, ' ');
  // Normalize common English/Arabic transliteration variants
  s = s
    .replace(/\b(?:al|ar|as|ash|at|ad|an|az|adh|ath)\s+/g, 'al')
    .replace(/\b(?:shaikh|sheikh|shakyh|shiekh)\b/g, 'shaykh')
    .replace(/\b(?:mohammed|mohammad|mohamed|muhammed|muhamad)\b/g, 'muhammad')
    .replace(/\b(?:koran|quraan|qur\s*an)\b/g, 'quran')
    .replace(/\b(?:islaam)\b/g, 'islam')
    .replace(/\b(?:allaah)\b/g, 'allah')
    .replace(/\b(?:tawheed|tauheed|tauhid)\b/g, 'tawhid')
    .replace(/\b(?:aqeedah|aqeeda|aqida)\b/g, 'aqidah')
    .replace(/\b(?:sunna)\b/g, 'sunnah')
    .replace(/\b(?:hadith|hadeeth|ahadith|ahadeeth)\b/g, 'hadith')
    .replace(/\b(?:bin)\b/g, 'ibn')
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/uu/g, 'u')
    .replace(/ii/g, 'i')
    .replace(/yy/g, 'y');
  // Normalize common Thai Islamic spelling variants
  s = s
    .replace(/(?:ชัยค์|ชัยคฺ|ไชค|เชค|ชีค|ชัค)/g, 'เชค')
    .replace(/(?:มูฮัมมัด|มุหัมมัด|มูหัมมัด|มุฮำหมัด)/g, 'มุฮัมมัด')
    .replace(/(?:อิบนิ|อิบนฺ|บิน)\s*/g, 'อิบนุ')
    .replace(/อัล\s+/g, 'อัล')
    .replace(/ฮฺ/g, 'ฮ')
    .replace(/ฯ/g, '');
  return s.replace(/\s+/g, '').trim();
}

/**
 * Scores a book record so the richest copy (has cover + has file + more metadata)
 * is suggested as the primary copy to keep.
 */
function qualityScore(book) {
  let score = 0;
  if (book.coverUrl) score += 40;
  if (book.driveUrl) score += 25;
  if (book.telegramFileId || book.telegramUrl) score += 20;
  if (book.pages) score += 5;
  if (book.size) score += 5;
  if (book.description) score += 5;
  if (asList(book.author).length > 0) score += 5;
  if (book.publisher) score += 3;
  if (book.category) score += 3;
  return score;
}

/**
 * Finds groups of books that appear to be duplicates of the same book:
 * 1. Same Google Drive file ID
 * 2. Same series base + same volume/episode number (even if one has a subtitle!)
 * 3. Same canonical normalized title
 */
export function findDuplicateBooks(books) {
  if (!Array.isArray(books) || books.length < 2) return [];

  // Union-Find so overlapping signals merge cleanly into one group
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  for (const b of books) {
    parent.set(String(b.id), String(b.id));
  }

  const byDrive = new Map();
  const bySeriesVol = new Map();
  const byTitle = new Map();
  const reasons = new Map(); // id -> Set<reason>

  const markReason = (id, r) => {
    let set = reasons.get(id);
    if (!set) {
      set = new Set();
      reasons.set(id, set);
    }
    set.add(r);
  };

  for (const book of books) {
    const id = String(book.id);

    // 1. Drive ID
    const did = extractDriveId(book.driveUrl);
    if (did) {
      if (byDrive.has(did)) {
        const other = byDrive.get(did);
        union(other, id);
        markReason(other, 'ไฟล์ Drive เดียวกัน');
        markReason(id, 'ไฟล์ Drive เดียวกัน');
      } else {
        byDrive.set(did, id);
      }
    }

    // 2. Series base + volume number (catches "Majmu' al-Fatawa - Volume 2" vs "Majmūʿ al-Fatāwā - Volume 2: Tawḥīd...")
    const series = parseSeries(book.title);
    if (series) {
      const sKey = `${canonicalTitleKey(series.base)}::v${series.volume}`;
      if (sKey.length > 5) {
        if (bySeriesVol.has(sKey)) {
          const other = bySeriesVol.get(sKey);
          union(other, id);
          markReason(other, `ชื่อชุดและ${series.label}ซ้ำกัน`);
          markReason(id, `ชื่อชุดและ${series.label}ซ้ำกัน`);
        } else {
          bySeriesVol.set(sKey, id);
        }
      }
    }

    // 3. Canonical full title (for standalone books or identical series titles)
    const tKey = canonicalTitleKey(book.title);
    if (tKey.length >= 6) {
      if (byTitle.has(tKey)) {
        const other = byTitle.get(tKey);
        union(other, id);
        markReason(other, 'ชื่อเรื่องใกล้เคียง/สะกดต่างกัน');
        markReason(id, 'ชื่อเรื่องใกล้เคียง/สะกดต่างกัน');
      } else {
        byTitle.set(tKey, id);
      }
    }
  }

  const buckets = new Map();
  for (const book of books) {
    const root = find(String(book.id));
    let list = buckets.get(root);
    if (!list) {
      list = [];
      buckets.set(root, list);
    }
    list.push(book);
  }

  const groups = [];
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    // Put best copy first
    list.sort((a, b) => qualityScore(b) - qualityScore(a) || String(a.title || '').localeCompare(String(b.title || ''), 'th'));
    const groupReasons = new Set();
    for (const b of list) {
      for (const r of reasons.get(String(b.id)) || []) groupReasons.add(r);
    }
    groups.push({
      key: String(list[0].id),
      books: list,
      reasons: [...groupReasons],
    });
  }

  groups.sort((a, b) => b.books.length - a.books.length || String(a.books[0].title || '').localeCompare(String(b.books[0].title || ''), 'th'));
  return groups;
}

/**
 * Normalizes a person / translator / publisher name by stripping honorifics,
 * diacritics, punctuation, and common Thai/English transliteration variants.
 */
export function canonicalNameKey(raw) {
  let s = String(raw ?? '').trim().normalize('NFD');
  s = s.replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  s = s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  s = s.toLowerCase();
  s = s.replace(/[ʿʾʻʼ'’`´"“”.,:;!?()[\]{}<>/\\|–—\-_~•·ฯๆ์]/g, ' ');

  // Strip common honorifics & publisher prefixes so "Shaykh Ibn Baz" == "Ibn Bāz"
  // and "สำนักพิมพ์อัซซาบิกูน" == "อัซซาบิกูน"
  s = s
    .replace(/\b(?:shaykh|shaikh|sheikh|shakyh|imam|al\s*imam|allamah|al\s*allamah|hafidh|hafiz|dr|prof|ustadh|ustaz|shaykhul\s*islam|shaikhul\s*islam|al\s*hafidh|al\s*hafiz)\b/g, ' ')
    .replace(/(?:ชัยคุลอิสลาม|อัลอัลลามะฮ|อัลอัลลามะฮฺ|ชัยค์|ชัยคฺ|ชัยค|ไชค|เชค|ชีค|อิมาม|อิหม่าม|ท่าน|อาจารย์|อาจารย|อ\.|ดร\.|ผศ\.|รศ\.|ศ\.|สำนักพิมพ์|สำนักพิมพ|สนพ\.|สนพ|มูลนิธิ|ชมรม|กลุ่ม|เพจ)/g, ' ')
    .replace(/\b(?:publications|publishing|publisher|publishers|press|books|house|est|ltd|inc)\b/g, ' ')
    .replace(/\b(?:al|ar|as|ash|at|ad|an|az|adh|ath)\s+/g, 'al')
    .replace(/\b(?:mohammed|mohammad|mohamed|muhammed|muhamad)\b/g, 'muhammad')
    .replace(/\b(?:bin)\b/g, 'ibn')
    .replace(/\b(?:abdul|abd\s+al|abdal|abdul\s*)\b/g, 'abdal')
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/uu/g, 'u')
    .replace(/ii/g, 'i')
    .replace(/yy/g, 'y')
    .replace(/ah\b/g, 'a');

  // Thai name transliteration normalizations
  s = s
    .replace(/(?:มูฮัมมัด|มุหัมมัด|มูหัมมัด|มุฮำหมัด)/g, 'มุฮัมมัด')
    .replace(/(?:อิบนิ|อิบนฺ|บิน)\s*/g, 'อิบนุ')
    .replace(/(?:ศอลิห์|ศอและห์|ซอและฮ์|ซอและฮ|ซอลิห|ศอลิห)/g, 'ศอลิห')
    .replace(/(?:อุษัยมีน|อุซัยมีน|อุสัยมีน)/g, 'อุษัยมีน')
    .replace(/(?:อัลบานีย์|อัลบานี|อัลบานีย)/g, 'อัลบานี')
    .replace(/(?:ตัยมียะฮ|ตัยมียะห|ไทมียะฮ|ตัยมิยะฮ)/g, 'ตัยมียะฮ')
    .replace(/(?:เฟาซาน|ฟาวซาน)/g, 'เฟาซาน')
    .replace(/อัล\s+/g, 'อัล')
    .replace(/ฮฺ/g, 'ฮ');

  return s.replace(/\s+/g, '').trim();
}

/**
 * Finds groups of distinct spellings for the same author, translator, or publisher.
 * `field` is 'author' | 'translator' | 'publisher'.
 */
export function findDuplicateNames(books, field) {
  if (!Array.isArray(books) || books.length === 0) return [];

  const counts = new Map();
  for (const book of books) {
    for (const rawName of asList(book[field])) {
      const name = String(rawName ?? '').trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }

  const byKey = new Map();
  for (const [name, count] of counts.entries()) {
    const key = canonicalNameKey(name);
    if (key.length < 3) continue;
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = [];
      byKey.set(key, bucket);
    }
    bucket.push({ name, count });
  }

  const groups = [];
  for (const [key, variants] of byKey.entries()) {
    if (variants.length < 2) continue;
    variants.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'th'));
    const totalBooks = variants.reduce((sum, v) => sum + v.count, 0);
    groups.push({
      key,
      suggested: variants[0].name,
      variants,
      totalBooks,
    });
  }

  groups.sort((a, b) => b.totalBooks - a.totalBooks || b.variants.length - a.variants.length);
  return groups;
}
