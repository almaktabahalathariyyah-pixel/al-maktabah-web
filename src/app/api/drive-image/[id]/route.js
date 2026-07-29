import { resolveImageType, imageHeaders } from '@/lib/coverType';

export const runtime = 'edge';

// Drive file ids are base64url-ish and shorter than Telegram's.
const FILE_ID = /^[A-Za-z0-9_-]{10,120}$/;

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Public read-through proxy for cover images stored in Google Drive.
 *
 * Going through our own origin rather than linking straight at Drive buys
 * three things: a URL shape that does not change when Drive's host does, our
 * own cache headers, and no referrer leaking to Google on every cover render.
 *
 * No credentials are used, so this can only ever serve files the owner already
 * made readable by anyone-with-the-link — the same grant uploadImageToDrive
 * sets. A private file 404s here exactly as it should.
 */
export async function GET(request, { params }) {
  const { id: fileId } = await params;

  // Same contract as the Telegram proxy: the stage that broke rides on
  // X-Cover-Error so the admin cover check can name it.
  const fail = (status, reason) =>
    new Response(reason === 'bad-id' ? 'Invalid file id' : 'Image not available', {
      status,
      headers: { 'X-Cover-Error': reason, 'Cache-Control': 'no-store' },
    });

  if (!fileId || !FILE_ID.test(fileId)) return fail(400, 'bad-id');

  try {
    const upstream = await fetch(
      `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=view`,
      { redirect: 'follow' }
    );

    if (!upstream.ok) return fail(404, 'download-failed');

    const upstreamType = upstream.headers.get('content-type') || '';

    // A private or deleted file answers 200 with Drive's HTML sign-in page, so
    // markup has to be caught here — but only markup. Rejecting everything that
    // was not already image/* is the mistake that broke the Telegram proxy,
    // since these CDNs commonly answer application/octet-stream.
    if (/^text\/|html|json/i.test(upstreamType)) return fail(415, 'not-shared');

    const length = Number(upstream.headers.get('content-length') || 0);
    if (length > MAX_BYTES) return fail(413, 'too-large');

    // Covers are uploaded from here as JPEG, so that is the sane assumption
    // when Drive declines to say.
    const contentType = resolveImageType('cover.jpg', upstreamType);

    return new Response(upstream.body, { headers: imageHeaders(contentType) });
  } catch (error) {
    console.error('Drive Image Proxy Error:', error);
    return fail(500, 'proxy-threw');
  }
}
