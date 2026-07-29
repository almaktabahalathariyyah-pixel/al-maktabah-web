import { resolveReader, tokenFrom, jsonError } from '@/lib/serverAuth';

export const runtime = 'edge';

/**
 * Telegram will fetch a document from a URL itself, capped at 20MB — the same
 * ceiling getFile has when handing it back. So a book that CAN be mirrored is
 * exactly a book the mirror can later serve; there is no half-working state.
 */
export const MIRROR_LIMIT = 20 * 1024 * 1024;

function driveIdFrom(url) {
  if (!url) return null;
  const byPath = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (byPath) return byPath[1];
  const byQuery = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return byQuery ? byQuery[1] : null;
}

/** Direct-download form; the /view link would hand Telegram an HTML page. */
function directDownloadUrl(driveId) {
  return `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=t`;
}

/** Asks Telegram to fetch the file from `fileUrl` itself. */
async function sendByUrl({ botToken, chatId, fileUrl, title }) {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      document: fileUrl,
      caption: title,
      disable_notification: true,
    }),
  });
  return res.json().catch(() => ({ ok: false, description: 'Telegram ตอบกลับไม่ถูกรูปแบบ' }));
}

/**
 * Downloads the file here so it can be handed to Telegram directly.
 *
 * Only reached when Telegram declined to fetch the URL itself, and only for
 * files already known to be ≤20MB — which comfortably fits an edge worker.
 */
async function pullFromDrive(fileUrl) {
  try {
    const res = await fetch(fileUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
    });

    if (res.status === 403) {
      return { ok: false, status: 502, error: 'Google ปฏิเสธ — ไฟล์อาจติดโควตาดาวน์โหลดรายวัน' };
    }
    if (res.status === 404) {
      return { ok: false, status: 502, error: 'ไม่พบไฟล์นี้ใน Drive — อาจถูกลบ หรืออยู่ในบัญชีอื่น' };
    }
    if (!res.ok) {
      return { ok: false, status: 502, error: `Drive ตอบกลับ ${res.status}` };
    }

    // HTML means Google served an interstitial instead of the file, which IS
    // the sharing problem the old message assumed every failure was.
    const type = (res.headers.get('content-type') || '').toLowerCase();
    if (type.includes('text/html')) {
      return {
        ok: false,
        status: 502,
        error: 'Drive ไม่ยอมส่งไฟล์ — ตรวจว่าไฟล์ตั้งเป็น "ใครมีลิงก์ก็เปิดได้" แล้ว',
      };
    }

    const bytes = await res.arrayBuffer();
    if (bytes.byteLength === 0) {
      return { ok: false, status: 502, error: 'ไฟล์ที่ได้จาก Drive ว่างเปล่า' };
    }
    if (bytes.byteLength > MIRROR_LIMIT) {
      return {
        ok: false,
        status: 413,
        error: `ไฟล์จริง ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB ใหญ่เกิน 20MB`,
      };
    }

    return { ok: true, bytes };
  } catch {
    return { ok: false, status: 504, error: 'ดาวน์โหลดไฟล์จาก Drive ไม่ทันเวลา' };
  }
}

/** Uploads the bytes we already hold straight into the channel. */
async function sendBytes({ botToken, chatId, bytes, title }) {
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append('caption', title);
  form.append('disable_notification', 'true');
  form.append(
    'document',
    new Blob([bytes], { type: 'application/pdf' }),
    `${title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'book'}.pdf`
  );

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
    method: 'POST',
    body: form,
  });
  return res.json().catch(() => ({ ok: false, description: 'Telegram ตอบกลับไม่ถูกรูปแบบ' }));
}

/**
 * Mirrors one book's Drive file into the Telegram channel as a backup copy.
 *
 * The bytes never touch this server: we hand Telegram a URL and it does the
 * fetching. That is what lets this run inside a 4.5MB request limit, and why
 * the bot token can stay server-side — the browser used to be given the token
 * so it could upload directly, which is the thing we were trying to stop.
 *
 * Returns { fileId, messageId } for the caller to persist.
 */
export async function POST(request) {
  try {
    const reader = await resolveReader(tokenFrom(request));
    if (reader.error) return jsonError(reader.error, reader.status);
    if (!reader.isAdmin) return jsonError('เฉพาะผู้ดูแลระบบเท่านั้น', 403);

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
      return jsonError('ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN หรือ TELEGRAM_CHAT_ID', 500);
    }

    const body = await request.json().catch(() => null);
    const driveUrl = body?.driveUrl;
    const title = (body?.title || 'book').slice(0, 200);
    const declaredSize = Number(body?.sizeBytes) || 0;

    const driveId = driveIdFrom(driveUrl);
    if (!driveId) return jsonError('เล่มนี้ยังไม่มีลิงก์ Google Drive ที่ใช้ได้', 400);

    if (declaredSize > MIRROR_LIMIT) {
      return jsonError(
        `ไฟล์ใหญ่ ${(declaredSize / 1024 / 1024).toFixed(1)}MB — Telegram รับสำเนาผ่านลิงก์ได้ไม่เกิน 20MB`,
        413
      );
    }

    const fileUrl = directDownloadUrl(driveId);

    // Ask Telegram to fetch it itself first — nothing streams through this
    // worker when that works.
    let tgData = await sendByUrl({ botToken, chatId, fileUrl, title });

    if (!tgData.ok) {
      const reason = tgData.description || 'ไม่ทราบสาเหตุ';

      if (/too big|file is too big/i.test(reason)) {
        return jsonError('ไฟล์ใหญ่เกิน 20MB — สำรองไปที่ Telegram ไม่ได้', 413);
      }

      /**
       * Telegram could not pull the URL. That does NOT prove the file is
       * private — Telegram's fetcher is refused by Google far more often than
       * a browser is, so the old code blamed the owner's sharing settings for
       * something they had usually set correctly.
       *
       * Check what Google actually serves us, then decide: if the bytes are
       * there, upload them ourselves; only if Google withholds them is this
       * really a permissions problem.
       */
      if (/failed to get HTTP URL content|wrong file identifier|WEBPAGE|HTTP URL/i.test(reason)) {
        const pulled = await pullFromDrive(fileUrl);

        if (!pulled.ok) return jsonError(pulled.error, pulled.status);

        tgData = await sendBytes({ botToken, chatId, bytes: pulled.bytes, title });

        if (!tgData.ok) {
          return jsonError(
            `Telegram ปฏิเสธไฟล์ที่ส่งตรง: ${tgData.description || 'ไม่ทราบสาเหตุ'}`,
            502
          );
        }
      } else {
        return jsonError(`Telegram ปฏิเสธ: ${reason}`, 502);
      }
    }

    const document = tgData.result?.document;
    if (!document?.file_id) {
      return jsonError('Telegram ไม่ได้ส่งรหัสไฟล์กลับมา', 502);
    }

    return new Response(
      JSON.stringify({
        success: true,
        fileId: document.file_id,
        messageId: tgData.result.message_id,
        size: document.file_size || declaredSize,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Mirror to Telegram error:', error);
    return jsonError('สำรองไปที่ Telegram ไม่สำเร็จ', 500);
  }
}
