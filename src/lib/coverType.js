/**
 * Works out what image type a proxied cover really is.
 *
 * Telegram's file CDN serves `application/octet-stream` for downloads, not
 * `image/jpeg`. Both cover proxies used to gate on
 * `contentType.startsWith('image/')` and answer 415, so from commit 3fcf5b7
 * onward every single cover in the library was rejected by our own code — the
 * upload worked, the file was in the channel, and the proxy threw it away on the
 * last line.
 *
 * So the upstream header is treated as a hint, not an answer, and the file
 * extension decides. That is also the safer order: the point of the original
 * check was to avoid serving somebody else's HTML from our origin, and an
 * allow-list of extensions does that better than trusting a header the same
 * upstream sets.
 */

const BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
};

/**
 * The type to serve, or null when this is not a recognised image.
 *
 * `path` is the upstream file path or name (Telegram gives `photos/file_3.jpg`).
 * `upstreamType` is whatever the upstream claimed, used only when it is already
 * a concrete image type.
 */
export function resolveImageType(path, upstreamType) {
  if (upstreamType && upstreamType.startsWith('image/')) return upstreamType;

  const clean = String(path || '').split(/[?#]/)[0];
  const ext = clean.includes('.') ? clean.split('.').pop().toLowerCase() : '';
  return BY_EXTENSION[ext] || null;
}

/**
 * Headers every proxied cover is served with.
 *
 * nosniff matters more than usual here: we are re-serving third-party bytes
 * from our own origin, so the browser must not be allowed to decide for itself
 * that they are HTML. Content-Disposition keeps it a picture rather than a
 * download prompt.
 */
export function imageHeaders(contentType) {
  return {
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    // File ids are immutable, so this can sit in the CDN forever.
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
}
