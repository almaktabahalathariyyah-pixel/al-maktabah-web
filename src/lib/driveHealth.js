/**
 * Is a Google Drive file actually servable right now?
 *
 * Drive enforces a rolling per-file download quota. When a title gets popular
 * the link stops returning the PDF and starts returning an HTML page saying
 * "Sorry, you can't view or download this file at this time" — with a 200
 * status. Redirecting the reader blindly means they meet that page instead of
 * the book, and the site looks broken rather than busy.
 *
 * So we look first, and the caller decides what to do with the answer.
 */

export const BLOCK_REASONS = {
  quota: 'quota',      // daily download limit reached — comes back on its own
  permission: 'permission', // file is not shared publicly (or was unshared)
  missing: 'missing',  // deleted, or the wrong account owns it
  network: 'network',  // Drive did not answer in time
};

/** Direct-download form; /view would hand back a viewer page, not the file. */
export function driveDownloadUrl(driveId) {
  return `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=t`;
}

export function drivePreviewUrl(driveId) {
  return `https://drive.google.com/file/d/${driveId}/preview`;
}

/**
 * Fetches the first couple of kilobytes and reads what came back.
 *
 * Costs one round trip before every open. That is the price of failing over
 * automatically instead of showing the reader Google's error page.
 */
export async function probeDrive(driveId, { timeoutMs = 6000 } = {}) {
  const url = driveDownloadUrl(driveId);

  try {
    const res = await fetch(url, {
      headers: { Range: 'bytes=0-2047' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status === 404) return { ok: false, reason: BLOCK_REASONS.missing };
    if (res.status === 403) return { ok: false, reason: BLOCK_REASONS.quota };

    const type = (res.headers.get('content-type') || '').toLowerCase();

    // A PDF (or an opaque binary) means Drive is willing to serve it.
    if (type.includes('pdf') || type.includes('octet-stream') || type.includes('binary')) {
      return { ok: true };
    }

    // Anything HTML is an interstitial. Which one matters.
    if (type.includes('text/html')) {
      const body = await res.text().catch(() => '');
      if (/quota|too many users|can't view or download|cannot be downloaded/i.test(body)) {
        return { ok: false, reason: BLOCK_REASONS.quota };
      }
      if (/sign in|permission|request access|need access/i.test(body)) {
        return { ok: false, reason: BLOCK_REASONS.permission };
      }
      // Unrecognised interstitial: treat as a quota block, which is both the
      // most common cause and the one that recovers by itself.
      return { ok: false, reason: BLOCK_REASONS.quota };
    }

    if (!res.ok && res.status !== 206) {
      return { ok: false, reason: BLOCK_REASONS.network };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: BLOCK_REASONS.network };
  }
}
