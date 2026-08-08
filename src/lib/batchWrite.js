import { writeBatch } from 'firebase/firestore';
import { db } from './firebase';

/**
 * A Firestore write batch holds at most 500 operations, and past that
 * `commit()` throws and NOTHING in the batch is written.
 *
 * The book-list enrich pass already knew this and chunked at 400. Every other
 * batch in the app — bulk delete, bulk edit, and the two name rewrites —
 * built one batch of whatever size the job happened to be. That is fine at
 * 432 books and stops being fine the moment the shelf passes 500, which is
 * the direction it is going.
 *
 * The bulk delete was the worst of them: it removes the Drive copies BEFORE
 * writing, so a batch that threw would have left the files deleted and the
 * records still on the shelf, pointing at nothing.
 *
 * 400, not 500: the same margin the enrich pass chose, and a batch entry can
 * be more than one operation.
 */
const CHUNK = 400;

/**
 * Applies `op(batch, item)` to every item, committing every 400.
 *
 * Not atomic across chunks — nothing here was atomic across 500 either, and
 * every caller is a bulk edit where a partial result is recoverable by
 * repeating it. Returns how many items were written.
 */
export async function commitInChunks(items, op) {
  const list = [...items];
  for (let i = 0; i < list.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const item of list.slice(i, i + CHUNK)) op(batch, item);
    await batch.commit();
  }
  return list.length;
}

export default commitInChunks;
