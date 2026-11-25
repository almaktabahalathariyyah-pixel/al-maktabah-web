import { resolveImageType, imageHeaders } from '@/lib/coverType';

const FILE_ID = /^[A-Za-z0-9_-]{10,120}$/;

/**
 * Same-origin proxy for Google Drive PDF cover thumbnails.
 *
 * Linking straight at drive.google.com/thumbnail fails CORS in CoverCheck's
 * fetch() audit and can be blocked by Google's referrer checks. Proxying here
 * keeps cover URLs same-origin, strips referrer, and sets long-lived cache
 * headers just like /api/image and /api/drive-image.
 */
export async function GET(request, { params }) {
  const { id: fileId } = await params;

  const fail = (status, reason) =>
    new Response(reason === 'bad-id' ? 'Invalid file id' : 'Thumbnail not available', {
      status,
      headers: { 'X-Cover-Error': reason, 'Cache-Control': 'no-store' },
    });

  if (!fileId || !FILE_ID.test(fileId)) return fail(400, 'bad-id');

  try {
    const upstream = await fetch(
      `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w600`,
      { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0' } }
    );

    if (!upstream.ok) return fail(404, 'download-failed');

    const upstreamType = upstream.headers.get('content-type') || '';
    if (/^text\/|html|json/i.test(upstreamType)) return fail(415, 'not-shared');

    const contentType = resolveImageType('cover.jpg', upstreamType);
    return new Response(upstream.body, { headers: imageHeaders(contentType) });
  } catch (error) {
    console.error('Drive Thumbnail Proxy Error:', error);
    return fail(500, 'proxy-threw');
  }
}
