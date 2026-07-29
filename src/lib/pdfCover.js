'use client';

/**
 * Renders the first page of a PDF into a cover image, in the browser.
 *
 * The whole library is scanned or laid out with a real title page, so page one
 * IS the cover — there is nothing to design and nothing for the owner to hunt
 * down. Doing it here rather than on the server keeps the file bytes on the
 * machine that already has them; only a ~100KB JPEG is uploaded.
 */

const COVER_WIDTH = 700; // enough for a retina card, small enough to stay light
const JPEG_QUALITY = 0.82;

let pdfjs = null;

/**
 * pdf.js is ~1MB and only the bulk uploader needs it, so it is imported on
 * first use rather than shipped to every reader.
 */
async function loadPdfjs() {
  if (pdfjs) return pdfjs;

  const lib = await import('pdfjs-dist');
  // The worker has to be resolved through a CDN or copied to public.
  // Using unpkg ensures it matches the exact version without Webpack import.meta.url issues.
  lib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${lib.version}/build/pdf.worker.min.mjs`;

  pdfjs = lib;
  return pdfjs;
}

/**
 * First page of `file` as a JPEG Blob, or null when the PDF cannot be rendered.
 *
 * Returning null rather than throwing is deliberate: a missing cover is a
 * cosmetic gap, and it must never fail an upload that otherwise worked.
 */
export async function renderFirstPage(file) {
  let doc = null;

  try {
    const lib = await loadPdfjs();
    const buffer = await file.arrayBuffer();

    doc = await lib.getDocument({
      data: buffer,
      // These files come from many sources; a missing font or a broken xref
      // should degrade, not abort.
      disableFontFace: false,
      isEvalSupported: false,
    }).promise;

    const page = await doc.getPage(1);

    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: COVER_WIDTH / base.width });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);

    const context = canvas.getContext('2d', { alpha: false });
    // Pages with transparency would otherwise render onto black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: context, viewport, canvas }).promise;

    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );

    // Free the bitmap immediately; 362 of these would otherwise pile up.
    canvas.width = 0;
    canvas.height = 0;

    return blob;
  } catch (err) {
    console.warn('Could not render cover for', file.name, err?.message || err);
    return null;
  } finally {
    try {
      await doc?.destroy();
    } catch {
      /* already gone */
    }
  }
}

/**
 * Renders the cover and stores it in the Telegram channel.
 *
 * Returns { url, error } rather than a bare string. The old version collapsed
 * every failure — unrenderable PDF, expired token, storage refusing the file —
 * into '' and a console.warn, so a run of 362 books could finish reporting
 * "อัปโหลดสำเร็จ" with not one cover saved and nothing on screen saying why.
 * The caller now has something to show.
 *
 * Deliberately NOT Drive: that quota is reserved for the books themselves, and
 * a few hundred cover JPEGs would compete for room more books could use.
 * Telegram hosts them for free and counts against nothing.
 */
export async function makeCover(file, { idToken } = {}) {
  const blob = await renderFirstPage(file);
  if (!blob) return { url: '', error: 'อ่านหน้าแรกของ PDF ไม่ได้' };

  if (!idToken) return { url: '', error: 'ไม่มีสิทธิ์อัปโหลดรูปปก' };

  try {
    const form = new FormData();
    form.append('image', blob, 'cover.jpg');

    const res = await fetch('/api/admin/upload-cover', {
      method: 'POST',
      headers: { Authorization: `Bearer ${idToken}` },
      body: form,
    });

    const data = await res.json().catch(() => null);
    if (data?.success) return { url: data.url, error: '' };

    return { url: '', error: data?.error || `เก็บรูปปกไม่สำเร็จ (${res.status})` };
  } catch (err) {
    console.warn('Could not upload cover for', file.name, err?.message || err);
    return { url: '', error: 'เชื่อมต่อเพื่ออัปโหลดรูปปกไม่สำเร็จ' };
  }
}
