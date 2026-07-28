import { collection, addDoc, doc, updateDoc, setDoc, increment } from 'firebase/firestore';
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
