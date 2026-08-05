import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';
import { asList } from './people';

/**
 * Rewrites one name across every book crediting it.
 *
 * The names page and the books used to drift apart the moment a name was
 * corrected: fixing a typo there left every book still carrying the typo, and
 * the reader-facing filters group by the value ON the book, so the old
 * spelling stayed on the shelf as its own separate author.
 *
 * `author` and `translator` hold an array, but books saved before multi-person
 * support hold a bare string — both shapes are still out there, so both are
 * queried. `publisher` is only ever a string.
 */
async function booksUsing(field, name, isMulti) {
  const base = collection(db, 'books');
  const queries = isMulti
    ? [query(base, where(field, 'array-contains', name)), query(base, where(field, '==', name))]
    : [query(base, where(field, '==', name))];

  const found = new Map();
  for (const q of queries) {
    const snap = await getDocs(q);
    snap.forEach((d) => found.set(d.id, d.data()));
  }
  return found;
}

/** Returns how many books were rewritten. */
export async function renameInBooks({ field, from, to, isMulti }) {
  const found = await booksUsing(field, from, isMulti);
  if (found.size === 0) return 0;

  const batch = writeBatch(db);
  for (const [id, data] of found) {
    // A book already crediting both spellings must not end up crediting the
    // surviving name twice.
    const next = isMulti
      ? [...new Set(asList(data[field]).map((v) => (v === from ? to : v)))]
      : to;
    batch.update(doc(db, 'books', id), { [field]: next });
  }
  await batch.commit();
  return found.size;
}
