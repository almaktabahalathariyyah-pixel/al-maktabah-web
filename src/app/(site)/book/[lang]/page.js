import { redirect, notFound } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getLangPath } from '@/lib/langPath';

/**
 * Keeps the pre-language URLs alive: /book/<id> → /book/<lang>/<id>.
 *
 * This deliberately lives at [lang] rather than at a sibling [id] route.
 * Next.js refuses two different slug names on the same path segment, and
 * having both /book/[id] and /book/[lang]/[id] made `next start` throw
 * "You cannot use different slug names for the same dynamic path" on EVERY
 * request — the build succeeded and the deployed site served nothing but 500s.
 *
 * A single segment under /book can only be a legacy id, so it is resolved
 * here. redirect() and notFound() signal by throwing, so they must stay
 * outside the try — a catch around them swallows the navigation.
 */
export default async function LegacyBookRedirect({ params }) {
  const { lang: id } = await params;

  let language = null;
  let found = false;

  try {
    const snap = await getDoc(doc(db, 'books', id));
    if (snap.exists()) {
      found = true;
      language = snap.data().language;
    }
  } catch (error) {
    console.error('Error resolving legacy book URL:', error);
  }

  if (!found) notFound();

  redirect(`/book/${getLangPath(language)}/${id}`);
}
