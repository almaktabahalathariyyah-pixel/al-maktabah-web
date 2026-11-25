/**
 * Per-book reading bookmark stored in localStorage so a reader coming back to a
 * 300-page PDF can jump straight to where they left off.
 */

const PREFIX = 'maktabah_progress_v1_';

export function getReadingProgress(bookId) {
  if (typeof window === 'undefined' || !bookId) return null;
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${bookId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const page = Number(parsed?.page);
    if (!Number.isFinite(page) || page < 1) return null;
    return {
      page,
      totalPages: Number(parsed?.totalPages) || 0,
      updatedAt: Number(parsed?.updatedAt) || 0,
    };
  } catch {
    return null;
  }
}

export function saveReadingProgress(bookId, { page, totalPages = 0 }) {
  if (typeof window === 'undefined' || !bookId) return;
  const p = Math.max(1, Math.floor(Number(page) || 0));
  if (!p) return;
  try {
    window.localStorage.setItem(
      `${PREFIX}${bookId}`,
      JSON.stringify({ page: p, totalPages: Number(totalPages) || 0, updatedAt: Date.now() })
    );
  } catch {
    /* private mode or quota full */
  }
}

export function clearReadingProgress(bookId) {
  if (typeof window === 'undefined' || !bookId) return;
  try {
    window.localStorage.removeItem(`${PREFIX}${bookId}`);
  } catch {
    /* ignore */
  }
}
