import {
  collection, addDoc, doc, updateDoc, setDoc, increment,
  query, where, getDocs, documentId,
} from 'firebase/firestore';
import { db } from './firebase';

/** YYYY-MM-DD in the reader's own timezone — the library is Thai-facing. */
export function dayKey(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Records one open or download.
 *
 * Three writes, each with a different lifetime:
 *   downloads/<auto>  the raw event, for "who read what"
 *   books/<id>        the per-book counter shown in the admin table
 *   stats/<day>       a pre-aggregated daily total
 *
 * The daily rollup exists so the dashboard can draw a chart from ~30 documents
 * instead of scanning every event ever recorded — that scan gets slower and
 * more expensive every single day the library is used.
 *
 * Statistics must never block a reader, so failures are logged, not thrown.
 */
export async function recordAccess({ bookId, userId, type }) {
  const today = dayKey();

  const results = await Promise.allSettled([
    addDoc(collection(db, 'downloads'), {
      bookId,
      userId,
      type,
      day: today,
      timestamp: new Date(),
    }),
    updateDoc(doc(db, 'books', bookId), { downloadCount: increment(1) }),
    setDoc(
      doc(db, 'stats', today),
      { total: increment(1), [type]: increment(1), day: today },
      { merge: true }
    ),
  ]);

  results
    .filter((r) => r.status === 'rejected')
    .forEach((r) => console.error('Stats write failed:', r.reason));
}

/**
 * The books one reader opened, most recent first, with their titles.
 *
 * The ledger has recorded who opened what since the day it was written, but
 * only the owner could ever read it — so a reader had no way back to the book
 * they were halfway through except to search for it again. The rules now let
 * a reader query their OWN events, and this is that query.
 *
 * Titles come from one batched lookup rather than a read per event, and the
 * ledger holds an event per open, so the same book read five times is folded
 * back to one entry before any of that is paid for.
 */
export async function recentlyOpened(userId, { max = 6 } = {}) {
  if (!userId) return [];

  const snap = await getDocs(query(collection(db, 'downloads'), where('userId', '==', userId)));

  const events = [];
  snap.forEach((d) => events.push(d.data()));
  events.sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));

  // Most recent open wins; a book opened twice is still one book.
  const seen = new Map();
  for (const event of events) {
    if (event.bookId && !seen.has(event.bookId)) seen.set(event.bookId, event);
    if (seen.size >= max) break;
  }
  if (seen.size === 0) return [];

  // 'in' takes at most 30, and `max` is well under that.
  const ids = [...seen.keys()];
  const books = new Map();
  const bookSnap = await getDocs(
    query(collection(db, 'books'), where(documentId(), 'in', ids))
  );
  bookSnap.forEach((d) => books.set(d.id, { id: d.id, ...d.data() }));

  // A book deleted since it was read leaves an event pointing at nothing.
  return ids.filter((id) => books.has(id)).map((id) => ({
    ...books.get(id),
    openedAt: seen.get(id).timestamp?.toDate?.() || null,
  }));
}
