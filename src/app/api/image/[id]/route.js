import { resolveImageType, imageHeaders } from '@/lib/coverType';

export const runtime = 'edge';

/**
 * Public read-through proxy for cover images stored in the Telegram channel.
 *
 * Every failure answers with an `X-Cover-Error` header naming the stage that
 * broke. The body stays generic — Telegram's own error text can carry the chat
 * id — but the admin cover check reads the header, so "ปกไม่แสดง" is one click
 * away from a reason instead of a guess.
 */

/**
 * A sanity check, NOT a validator.
 *
 * This used to be /^[A-Za-z0-9_-]{16,200}$/, which was a guess about an opaque
 * third-party id format — and a wrong guess here answers 400 for every cover in
 * the library. Telegram's own getFile is the real validator, and the bot token
 * is never in this URL, so nothing is protected by being strict. All that is
 * needed is to keep obvious junk and path characters out of the upstream URL.
 */
const PLAUSIBLE_ID = /^[A-Za-z0-9_=-]{16,300}$/;

export async function GET(request, { params }) {
  const { id: fileId } = await params;

  const fail = (status, reason) =>
    new Response(reason === 'bad-id' ? 'Invalid file id' : 'Image not available', {
      status,
      headers: { 'X-Cover-Error': reason, 'Cache-Control': 'no-store' },
    });

  if (!fileId || !PLAUSIBLE_ID.test(fileId)) return fail(400, 'bad-id');

  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return fail(500, 'no-token');

    const fileRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`
    );
    const fileData = await fileRes.json().catch(() => null);

    // Never echo Telegram's error text back — it can carry the chat id.
    if (!fileData?.ok || !fileData.result?.file_path) {
      // 401/404 here means the token no longer matches the bot that sent the
      // photo, which is the one cause the owner can actually act on.
      return fail(404, fileRes.status === 401 ? 'bad-token' : 'getfile-failed');
    }

    const imgRes = await fetch(
      `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`
    );
    if (!imgRes.ok) return fail(404, 'download-failed');

    // Telegram serves application/octet-stream here, so the file_path decides
    // — gating on the header rejected every cover we had ever stored.
    const contentType = resolveImageType(
      fileData.result.file_path,
      imgRes.headers.get('content-type')
    );
    if (!contentType) return fail(415, 'not-an-image');

    return new Response(imgRes.body, { headers: imageHeaders(contentType) });
  } catch (error) {
    console.error('Image Proxy Error:', error);
    return fail(500, 'proxy-threw');
  }
}
