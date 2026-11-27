import { resolveReader, tokenFrom, fetchDocAsUser } from '@/lib/serverAuth';
import { probeDrive, driveDownloadUrl, BLOCK_REASONS } from '@/lib/driveHealth';
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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function errorResponse(message, status, action) {
  if (action === 'download') {
    return new Response(message, {
      status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  const showLogin = status === 401 || status === 403;
  const html = `<!DOCTYPE html>
<html lang="th"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ไม่สามารถเปิดหนังสือได้</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    display: grid; place-items: center; min-height: 100vh;
    background: #141716; color: #eef4f1; padding: 2rem; line-height: 1.75;
  }
  .box {
    max-width: 28rem; width: 100%; text-align: center;
    background: #1c2220; border: 1px solid #2b3530;
    border-radius: 18px; padding: 2.25rem 1.75rem;
  }
  h1 { font-size: 1.15rem; font-weight: 600; margin-bottom: 0.65rem; }
  p { color: #b5c4bd; font-size: 0.94rem; }
  .acts { display: flex; flex-direction: column; gap: 0.6rem; margin-top: 1.5rem; }
  a { display: block; text-decoration: none; border-radius: 999px; padding: 0.75rem 1.4rem; font-weight: 600; font-size: 0.9rem; }
  .primary { background: #3ee6a0; color: #04140d; }
  .ghost { background: transparent; color: #b5c4bd; border: 1px solid #35423c; }
</style>
</head><body>
  <div class="box">
    <h1>ไม่สามารถเปิดหนังสือได้</h1>
    <p>${escapeHtml(message)}</p>
    <div class="acts">
      ${showLogin ? '<a class="primary" href="/login" target="_top">เข้าสู่ระบบ / ตรวจสอบบัญชี</a>' : ''}
      <a class="ghost" href="/" target="_top">กลับหน้าหลัก</a>
    </div>
  </div>
</body></html>`;
  return htmlPage(html, status);
}

function htmlPage(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // This page carries the reader's token in its own URL and links out to
      // the contact channel; no request from it may leak a Referer.
      'Referrer-Policy': 'no-referrer',
    },
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
        // The reader's ID token travels in this URL — an <iframe src> and a
        // window.open() cannot carry an Authorization header, which is why
        // tokenFrom() accepts ?token= at all. Nothing this document loads may
        // therefore be allowed to send a Referer, or the token rides along.
        'Referrer-Policy': 'no-referrer',
        // Lets the reader-facing page tell which copy they are looking at.
        'X-Maktabah-Source': 'telegram',
      },
    });
  } catch {
    return null;
  }
}

/**
 * Streams the Drive copy through this origin.
 *
 * Redirecting to Drive's /preview page was handing the reader Google's viewer
 * inside our iframe, chrome and all — including its pop-out button, which took
 * them straight out of the library and into Drive. Serving the bytes ourselves
 * means the browser's own PDF viewer renders it: no Drive branding, no way out
 * of the site, and the Drive file id is never exposed to the page.
 *
 * Returns null when Drive does not hand over a file, so the caller can fail
 * over to the mirror exactly as before.
 */
async function serveFromDrive({ driveId, title, action }) {
  try {
    const res = await fetch(driveDownloadUrl(driveId), { redirect: 'follow' });
    if (!res.ok) return null;

    const type = (res.headers.get('content-type') || '').toLowerCase();
    // An HTML body here is a Drive interstitial, not a book.
    if (type.includes('text/html')) return null;

    const disposition = action === 'download' ? 'attachment' : 'inline';
    const safeName = encodeURIComponent(`${title}.pdf`);

    return new Response(res.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename*=UTF-8''${safeName}`,
        'Cache-Control': 'private, no-store',
        // The reader's ID token travels in this URL — an <iframe src> and a
        // window.open() cannot carry an Authorization header, which is why
        // tokenFrom() accepts ?token= at all. Nothing this document loads may
        // therefore be allowed to send a Referer, or the token rides along.
        'Referrer-Policy': 'no-referrer',
        'X-Maktabah-Source': 'drive',
      },
    });
  } catch {
    return null;
  }
}

/**
 * Streams a direct HTTPS PDF URL (e.g. IslamHouse, SalafyThai, IslamicBook.ws)
 * through this origin so it opens inside the built-in reader without exposing
 * external links or failing cross-origin framing.
 */
async function serveFromDirectPdf({ url, title, action }) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      /^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return null;
    }

    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return null;

    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (type.includes('text/html')) return null;

    const disposition = action === 'download' ? 'attachment' : 'inline';
    const safeName = encodeURIComponent(`${title}.pdf`);

    return new Response(res.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename*=UTF-8''${safeName}`,
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Maktabah-Source': 'external',
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
    if (reader.error) return errorResponse(reader.error, reader.status, action);

    // Fetch the book before deciding on access: a public title only needs a
    // signed-in reader; approval is what unlocks the restricted shelf.
    // Read as the reader — an anonymous REST call is refused by the rules.
    const docRes = await fetchDocAsUser(projectId, `books/${id}`, tokenFrom(request));

    if (!docRes.ok) {
      if (docRes.status === 404) return errorResponse('ไม่พบหนังสือเล่มนี้', 404, action);
      return errorResponse('ฐานข้อมูลขัดข้อง', 500, action);
    }

    const fields = (await docRes.json())?.fields || {};

    if (fields.restricted?.booleanValue === true && !reader.isApproved) {
      return errorResponse('หนังสือเล่มนี้เปิดให้เฉพาะสมาชิกที่ได้รับอนุมัติ', 403, action);
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
          // Proxied, not redirected — see serveFromDrive. A redirect is what
          // put Google's viewer (and its "open in Drive" button) on the page.
          const served = await serveFromDrive({ driveId, title, action });
          if (served) return served;
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

      // Direct HTTPS PDF URL (non-Google-Drive source such as IslamHouse / SalafyThai)
      if (/^https?:\/\//i.test(driveUrl)) {
        const direct = await serveFromDirectPdf({ url: driveUrl, title, action });
        if (direct) return direct;
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
    return errorResponse('เกิดข้อผิดพลาดภายในระบบ', 500, action);
  }
}
