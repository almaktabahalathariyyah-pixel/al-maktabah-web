'use client';

import { doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

/** Telegram fetches a document by URL up to 20MB — and hands it back up to 20MB. */
export const MIRROR_LIMIT = 20 * 1024 * 1024;

export function canMirror(sizeBytes) {
  return Number(sizeBytes) > 0 && Number(sizeBytes) <= MIRROR_LIMIT;
}

/** "12.34 MB" as stored on older books → bytes. */
export function parseSize(text) {
  if (!text) return 0;
  const match = String(text).match(/([\d.]+)\s*(KB|MB|GB)/i);
  if (!match) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  const factor = unit === 'GB' ? 1024 ** 3 : unit === 'MB' ? 1024 ** 2 : 1024;
  return Number.isFinite(value) ? value * factor : 0;
}

/** Best available byte count for a book, new field first then the old string. */
export function bookSizeBytes(book) {
  return Number(book?.sizeBytes) || parseSize(book?.size);
}

/**
 * Asks the server to copy a book's Drive file into the Telegram channel, then
 * records the resulting file id on the book.
 *
 * The write happens here rather than in the route because the browser is
 * already signed in as the owner, so the security rules cover it — no service
 * account, no second set of credentials.
 *
 * Resolves to { ok, fileId } or { ok: false, error }.
 */
export async function mirrorToTelegram({ idToken, bookId, driveUrl, title, sizeBytes, persist = true }) {
  if (!driveUrl) return { ok: false, error: 'เล่มนี้ยังไม่มีไฟล์ใน Google Drive' };
  if (sizeBytes > MIRROR_LIMIT) {
    return {
      ok: false,
      error: `ไฟล์ ${(sizeBytes / 1024 / 1024).toFixed(1)}MB ใหญ่เกิน 20MB — สำรองไม่ได้`,
      tooBig: true,
    };
  }

  try {
    const res = await fetch('/api/admin/mirror-telegram', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ driveUrl, title, sizeBytes }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { ok: false, error: data.error || 'สำรองไม่สำเร็จ' };
    }

    if (persist && bookId) {
      await updateDoc(doc(db, 'books', bookId), {
        telegramFileId: data.fileId,
        telegramMirroredAt: new Date(),
      });
    }

    return { ok: true, fileId: data.fileId };
  } catch (err) {
    console.error('Mirror failed:', err);
    return { ok: false, error: err.message };
  }
}
