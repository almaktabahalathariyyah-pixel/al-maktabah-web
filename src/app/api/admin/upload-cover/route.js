import { resolveReader, tokenFrom, jsonError } from '@/lib/serverAuth';

export const runtime = 'edge';

const MAX_COVER_BYTES = 5 * 1024 * 1024;

/** Pushes a cover image into the Telegram channel and returns a proxy URL. */
export async function POST(request) {
  try {
    const reader = await resolveReader(tokenFrom(request));
    if (reader.error) return jsonError(reader.error, reader.status);
    if (!reader.isAdmin) return jsonError('เฉพาะผู้ดูแลระบบเท่านั้น', 403);

    const formData = await request.formData();
    const image = formData.get('image');

    if (!image || typeof image === 'string') {
      return jsonError('ไม่พบไฟล์รูปภาพ', 400);
    }
    if (image.type && !image.type.startsWith('image/')) {
      return jsonError('รองรับเฉพาะไฟล์รูปภาพเท่านั้น', 415);
    }
    if (image.size > MAX_COVER_BYTES) {
      return jsonError('ไฟล์รูปปกต้องมีขนาดไม่เกิน 5MB', 413);
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!botToken || !chatId) {
      return jsonError('ยังไม่ได้ตั้งค่า TELEGRAM_BOT_TOKEN หรือ TELEGRAM_CHAT_ID', 500);
    }

    const tgFormData = new FormData();
    tgFormData.append('chat_id', chatId);
    tgFormData.append('photo', image);

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      body: tgFormData,
    });

    const tgData = await tgRes.json();
    if (!tgData.ok || !tgData.result?.photo?.length) {
      return jsonError(tgData.description || 'Telegram ปฏิเสธไฟล์นี้', 502);
    }

    // Telegram returns every rendered size; the last one is the largest.
    const photos = tgData.result.photo;
    const fileId = photos[photos.length - 1].file_id;

    return new Response(
      JSON.stringify({ success: true, url: `/api/image/${fileId}` }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Upload Cover API Error:', error);
    return jsonError('อัปโหลดรูปปกไม่สำเร็จ', 500);
  }
}
