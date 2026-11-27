'use client';

import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { readCatalogRev } from './catalogRev';

/**
 * The whole book list, and the localStorage copy that keeps re-reading it off
 * the daily quota.
 *
 * Search and filters run client-side over the whole shelf, so every visit
 * used to re-read every book from Firestore — on a Spark-tier daily quota, a
 * couple hundred ordinary page loads was enough to exhaust it with no bug
 * involved at all.
 *
 * Whether the cached copy is still good is settled by ONE document read: the
 * catalogue revision, bumped by every admin write. Same number, and the
 * caller gets the cache having read nothing else; different, and it refetches.
 * So a quiet day costs 1 read per visit instead of 432, and an edit still
 * reaches everyone on their next visit rather than a day later.
 *
 * The expiry is only a backstop for the case where a bump was lost, or where
 * the revision itself could not be read.
 *
 * The shelf and the admin forms share this one cache deliberately. They want
 * the same 'full' list, and a second copy would both double the localStorage
 * a browser spends on it and let the two drift apart on the next change to
 * the shape.
 */
export const CACHE_VERSION = 3;
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const cacheKey = (scope) => `al-maktabah:books:${scope}:v${CACHE_VERSION}`;

// In-memory cache avoids re-parsing JSON from localStorage on back-navigation
// within the same tab session (0ms shelf restore).
const memoryCache = new Map();

/**
 * Strips bulky fields that are never needed on the homepage shelf or admin
 * dropdowns (such as long descriptions or OCR dumps) so 2,000+ books fit
 * comfortably inside the ~5MB localStorage budget without silently evicting.
 * Detail pages and the PDF reader always fetch the full document by ID.
 */
function slimBook(book) {
  const {
    id,
    title,
    author,
    translator,
    publisher,
    category,
    type,
    language,
    year,
    coverUrl,
    restricted,
    createdAt,
    driveUrl,
    sourceFile,
    sizeBytes,
    downloadCount,
  } = book;
  const out = { id, title, createdAt };
  if (author) out.author = author;
  if (translator) out.translator = translator;
  if (publisher) out.publisher = publisher;
  if (category) out.category = category;
  if (type) out.type = type;
  if (language) out.language = language;
  if (year) out.year = year;
  if (coverUrl) out.coverUrl = coverUrl;
  if (restricted) out.restricted = true;
  if (driveUrl) out.driveUrl = driveUrl;
  if (sourceFile) out.sourceFile = sourceFile;
  if (sizeBytes) out.sizeBytes = sizeBytes;
  if (downloadCount) out.downloadCount = downloadCount;
  return out;
}

export function readBookCache(scope) {
  if (typeof window === 'undefined') return null;
  if (memoryCache.has(scope)) return memoryCache.get(scope);
  try {
    const raw = window.localStorage.getItem(cacheKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.books) || typeof parsed.fetchedAt !== 'number') return null;
    memoryCache.set(scope, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function writeBookCache(scope, books, rev) {
  if (typeof window === 'undefined') return;
  const entry = { books: books.map(slimBook), rev, fetchedAt: Date.now() };
  memoryCache.set(scope, entry);
  const payload = JSON.stringify(entry);
  try {
    window.localStorage.setItem(cacheKey(scope), payload);
  } catch {
    // Quota exceeded: clear older cache versions and the alternate scope, then retry once.
    try {
      const otherScope = scope === 'full' ? 'public' : 'full';
      window.localStorage.removeItem(cacheKey(otherScope));
      for (let v = 1; v < CACHE_VERSION; v += 1) {
        window.localStorage.removeItem(`al-maktabah:books:public:v${v}`);
        window.localStorage.removeItem(`al-maktabah:books:full:v${v}`);
      }
      window.localStorage.setItem(cacheKey(scope), payload);
    } catch {
      // Storage disabled (private browsing) or still full — memoryCache still serves this tab.
    }
  }
}

/** Normalizes the Timestamp to millis so cached books are plain JSON. */
export function toBook(doc) {
  const data = doc.data();
  const createdAt =
    typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : Date.now();
  return { id: doc.id, ...data, createdAt };
}

/**
 * Every book, as plain objects, for the admin screens that need the shelf as
 * a whole rather than one page of it — the form's dropdowns, which are built
 * from the values already in use, and the bulk uploader's has-this-been-added
 * check.
 *
 * Those screens used to call getDocs(collection(books)) directly, once per
 * open. That is the entire collection every time a book is opened for
 * editing: 374 reads today against a 50,000/day free quota, and the shelf is
 * meant to reach ~1000. An owner working through fifty books spent more than
 * a third of the day's reads on dropdown options that had not changed
 * between the first book and the last.
 *
 * The revision check costs one read and almost always answers "unchanged" —
 * and when it does not, it is because a book was just saved, which is exactly
 * when the dropdowns SHOULD be rebuilt. Unlike the shelf, this returns
 * nothing until it has the full list, since a half-filled dropdown is worse
 * than a late one.
 */
export async function loadAllBooks() {
  const rev = await readCatalogRev();
  const cached = readBookCache('full');

  if (cached && rev !== null && cached.rev === rev) return cached.books;

  // The revision was unreadable — trust a recent cache rather than spend the
  // collection proving it was fine.
  if (cached && rev === null && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.books;
  }

  const snap = await getDocs(collection(db, 'books'));
  const books = snap.docs.map(toBook);
  writeBookCache('full', books, rev);
  return books;
}
