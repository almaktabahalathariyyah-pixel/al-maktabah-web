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

    // Telegram fetches the file itself. Nothing streams through this worker.
    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        document: fileUrl,
        caption: title,
        disable_notification: true,
      }),
    });

    const tgData = await tgRes.json();

    if (!tgData.ok) {
      const reason = tgData.description || 'ไม่ทราบสาเหตุ';
      // Telegram's wording here is opaque; translate the two common causes.
      if (/too big|file is too big/i.test(reason)) {
        return jsonError('ไฟล์ใหญ่เกิน 20MB — สำรองไปที่ Telegram ไม่ได้', 413);
      }
      if (/wrong file identifier|failed to get HTTP URL content|WEBPAGE/i.test(reason)) {
        return jsonError(
          'Telegram โหลดไฟล์จาก Drive ไม่ได้ — ตรวจว่าไฟล์ตั้งเป็น "ใครมีลิงก์ก็เปิดได้" แล้ว',
          502
        );
      }
      return jsonError(`Telegram ปฏิเสธ: ${reason}`, 502);
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
