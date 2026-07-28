import { resolveReader, tokenFrom, fetchDocAsUser } from '@/lib/serverAuth';
import { probeDrive, driveDownloadUrl, drivePreviewUrl, BLOCK_REASONS } from '@/lib/driveHealth';
import { unavailableHtml } from '@/lib/unavailablePage';

export const runtime = 'edge';

/** Google Drive accepts two link shapes; both carry the file id. */
function driveIdFrom(url) {
  if (!url) return null;
  const byPath = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (byPath) return byPath[1];
  const byQuery = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return byQuery ? byQuery[1] : null;
}

function textError(message, status) {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

function htmlPage(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/**
 * The contact channel shown when every copy is out of reach.
 * Read from config/siteSettings so it can be changed without a redeploy;
 * falls back to an env var.
 */
async function loadContact(projectId, apiKey) {
  const envLink = process.env.NEXT_PUBLIC_LINE_OA_URL;
  const fallback = envLink ? { label: 'ติดต่อผ่าน LINE', link: envLink } : null;

  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/config/siteSettings?key=${apiKey}`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return fallback;

    const channels = (await res.json())?.fields?.contactChannels?.arrayValue?.values || [];
    const first = channels
      .map((c) => c.mapValue?.fields)
      .find((f) => f?.link?.stringValue);

    if (!first) return fallback;
    return {
      label: first.label?.stringValue || 'ติดต่อผู้ดูแล',
      link: first.link.stringValue,
    };
  } catch {
    return fallback;
  }
}

/** Streams the Telegram copy. Only reachable for files within its 20MB limit. */
async function serveFromTelegram({ telegramFileId, title, action }) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return null;

  try {
    const fileRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(telegramFileId)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const fileData = await fileRes.json();
    if (!fileData.ok) return null;

    const pdfRes = await fetch(
      `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`
    );
    if (!pdfRes.ok) return null;

    const disposition = action === 'download' ? 'attachment' : 'inline';
    const safeName = encodeURIComponent(`${title}.pdf`);

    return new Response(pdfRes.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename*=UTF-8''${safeName}`,
        'Cache-Control': 'private, no-store',
        // Lets the reader-facing page tell which copy they are looking at.
        'X-Maktabah-Source': 'telegram',
      },
    });
  } catch {
    return null;
  }
}

/**
 * Serves a book, trying every copy before giving up.
 *
 *   1. ?source=telegram          the reader explicitly asked for the backup
 *   2. Google Drive              probed first, so a quota block is detected
 *                                rather than shown to the reader as Google's
 *                                own error page
 *   3. Telegram mirror           automatic failover when Drive is blocked
 *   4. An explanatory page       what happened, when to return, who to ask
 */
export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action'); // 'download' | null (inline read)
  const source = searchParams.get('source'); // 'telegram' to force the backup

  try {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

    const reader = await resolveReader(tokenFrom(request));
    if (reader.error) return textError(reader.error, reader.status);

    // Fetch the book before deciding on access: a public title only needs a
    // signed-in reader; approval is what unlocks the restricted shelf.
    // Read as the reader — an anonymous REST call is refused by the rules.
    const docRes = await fetchDocAsUser(projectId, `books/${id}`, tokenFrom(request));

    if (!docRes.ok) {
      if (docRes.status === 404) return textError('ไม่พบหนังสือเล่มนี้', 404);
      return textError('ฐานข้อมูลขัดข้อง', 500);
    }

    const fields = (await docRes.json())?.fields || {};

    if (fields.restricted?.booleanValue === true && !reader.isApproved) {
      return textError('หนังสือเล่มนี้เปิดให้เฉพาะสมาชิกที่ได้รับอนุมัติ', 403);
    }

    const telegramFileId = fields.telegramFileId?.stringValue;
    const telegramUrl = fields.telegramUrl?.stringValue;
    const driveUrl = fields.driveUrl?.stringValue;
    const title = fields.title?.stringValue || 'book';

    const retryUrl = telegramFileId
      ? `/api/pdf/${id}?token=${encodeURIComponent(tokenFrom(request))}&source=telegram${action ? `&action=${action}` : ''}`
      : '';

    // ---- 1. The reader asked for the backup copy explicitly ----------------
    if (source === 'telegram' && telegramFileId) {
      const mirrored = await serveFromTelegram({ telegramFileId, title, action });
      if (mirrored) return mirrored;
      return htmlPage(
        unavailableHtml({
          reason: BLOCK_REASONS.missing,
          title,
          contact: await loadContact(projectId, apiKey),
        }),
        503
      );
    }

    // ---- 2. Google Drive, but only if it will actually serve --------------
    if (driveUrl) {
      const driveId = driveIdFrom(driveUrl);

      if (driveId) {
        const health = await probeDrive(driveId);

        if (health.ok) {
          return Response.redirect(
            action === 'download' ? driveDownloadUrl(driveId) : drivePreviewUrl(driveId),
            302
          );
        }

        // ---- 3. Drive is blocked — fail over to the mirror silently -------
        if (telegramFileId) {
          const mirrored = await serveFromTelegram({ telegramFileId, title, action });
          if (mirrored) return mirrored;
        }

        // ---- 4. Nothing left to try. Explain, do not just fail. -----------
        return htmlPage(
          unavailableHtml({
            reason: health.reason,
            title,
            contact: await loadContact(projectId, apiKey),
            retryUrl,
          }),
          503
        );
      }
    }

    // No Drive copy at all — the Telegram original, if there is one.
    if (telegramFileId) {
      const mirrored = await serveFromTelegram({ telegramFileId, title, action });
      if (mirrored) return mirrored;
      return htmlPage(
        unavailableHtml({
          reason: BLOCK_REASONS.network,
          title,
          contact: await loadContact(projectId, apiKey),
        }),
        503
      );
    }

    if (telegramUrl) return Response.redirect(telegramUrl, 302);

    return htmlPage(
      unavailableHtml({
        reason: 'none',
        title,
        contact: await loadContact(projectId, apiKey),
      }),
      404
    );
  } catch (error) {
    console.error('PDF Proxy Error:', error);
    return textError('เกิดข้อผิดพลาดภายในระบบ', 500);
  }
}
