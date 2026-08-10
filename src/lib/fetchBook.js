import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * One book by id, or null when this reader cannot have it.
 *
 * Null covers two cases on purpose, because firestore.rules refuses to tell
 * them apart:
 *
 *   allow get: if resource.data.restricted != true || isApproved() || isAdmin();
 *
 * For a book that is not there, `resource` is null, `resource.data` fails, and
 * the read is denied — the same permission-denied a guest gets for a
 * restricted title. That is the point. If a missing id answered "not found"
 * while a restricted one answered "denied", anyone could walk the id space and
 * learn exactly which titles are restricted, which is the one thing the
 * neutral card on the shared link is there to avoid.
 *
 * So denial is an ordinary answer here, not a fault, and logging it as one
 * only buried the faults that matter — every mistyped or stale /book/ link
 * wrote a red permission-denied into the console. Anything that is NOT a
 * denial still gets logged: those are real (offline, quota, a broken rule
 * deploy) and worth seeing.
 */
export async function fetchBookOrNull(id, context = 'book') {
  try {
    const snap = await getDoc(doc(db, 'books', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    if (error?.code !== 'permission-denied') {
      console.error(`Error loading ${context}:`, error);
    }
    return null;
  }
}
