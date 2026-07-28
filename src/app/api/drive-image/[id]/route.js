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

  if (!fileId || !FILE_ID.test(fileId)) {
    return new Response('Invalid file id', { status: 400 });
  }

  try {
    const upstream = await fetch(
      `https://drive.usercontent.google.com/download?id=${encodeURIComponent(fileId)}&export=view`,
      { redirect: 'follow' }
    );

    if (!upstream.ok) return new Response('Image not found', { status: 404 });

    const contentType = upstream.headers.get('content-type') || '';
    // A private or deleted file answers with Drive's HTML sign-in page rather
    // than an error status, so the type is the only reliable tell.
    if (!contentType.startsWith('image/')) {
      return new Response('Not an image', { status: 415 });
    }

    const length = Number(upstream.headers.get('content-length') || 0);
    if (length > MAX_BYTES) return new Response('Image too large', { status: 413 });

    return new Response(upstream.body, {
      headers: {
        'Content-Type': contentType,
        // File ids are immutable, so this can sit in the CDN forever.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Drive Image Proxy Error:', error);
    return new Response('Image not available', { status: 500 });
  }
}
