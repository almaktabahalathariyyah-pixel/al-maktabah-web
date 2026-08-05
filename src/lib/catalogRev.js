import { doc, getDoc, setDoc, increment } from 'firebase/firestore';
import { db } from './firebase';

/**
 * A single number that changes whenever the shelf does.
 *
 * The homepage keeps the whole book list in localStorage, because search and
 * filters run over all of it and re-reading 400+ documents on every visit
 * exhausts a Spark-tier daily quota on ordinary traffic alone. The cost of
 * that cache was staleness: an edit made here took up to a day to reach a
 * reader who had already visited.
 *
 * This is the cheapest possible fix — ONE document read per visit tells the
 * shelf whether its cache is still good. Unchanged, and it reads nothing
 * else; changed, and it refetches. So a reader pays 1 read instead of 432 on
 * a quiet day, and still never sees yesterday's catalogue.
 *
 * Failing to bump is the only real hazard, so this is called from inside the
 * write helpers wherever possible rather than left to each caller. The cache
 * also keeps its own expiry as a backstop for exactly that case.
 */
const REV_REF = () => doc(db, 'config', 'catalog');

/** The current revision, or 0 when the document does not exist yet. */
export async function readCatalogRev() {
  try {
    const snap = await getDoc(REV_REF());
    return snap.exists() ? Number(snap.data()?.rev) || 0 : 0;
  } catch (error) {
    // A reader who cannot read this should get books, not an error page, so
    // treat it as "unknown" — the caller falls back to its own expiry.
    console.warn('Could not read catalog revision:', error);
    return null;
  }
}

/**
 * Marks the shelf as changed. Owner-only per the rules; never awaited for
 * correctness by the caller, because failing to bump must not fail the edit
 * that prompted it.
 */
export async function bumpCatalogRev() {
  try {
    await setDoc(REV_REF(), { rev: increment(1), changedAt: new Date() }, { merge: true });
  } catch (error) {
    console.warn('Could not bump catalog revision:', error);
  }
}
