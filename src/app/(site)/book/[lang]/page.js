import { redirect, notFound } from 'next/navigation';
import { fetchBookOrNull } from '@/lib/fetchBook';
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

  // Null covers "no such id" and "not readable by whoever asked" alike, and
  // the legacy URL answers the same way to both: a 404. redirect() and
  // notFound() signal by throwing, so they stay outside any try.
  const book = await fetchBookOrNull(id, 'legacy book URL');

  if (!book) notFound();

  redirect(`/book/${getLangPath(book.language)}/${id}`);
}
