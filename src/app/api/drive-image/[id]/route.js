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

    const contentType = upstream.headers.get('content-type') || '';
    // A private or deleted file answers with Drive's HTML sign-in page rather
    // than an error status, so the type is the only reliable tell.
    if (!contentType.startsWith('image/')) return fail(415, 'not-shared');

    const length = Number(upstream.headers.get('content-length') || 0);
    if (length > MAX_BYTES) return fail(413, 'too-large');

    return new Response(upstream.body, {
      headers: {
        'Content-Type': contentType,
        // File ids are immutable, so this can sit in the CDN forever.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Drive Image Proxy Error:', error);
    return fail(500, 'proxy-threw');
  }
}
