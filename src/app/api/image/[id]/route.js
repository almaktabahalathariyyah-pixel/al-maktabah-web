export const runtime = 'edge';

// Telegram file ids are base64url-ish. Anything else is a probe, not a cover.
const FILE_ID = /^[A-Za-z0-9_-]{16,200}$/;

/** Public read-through proxy for cover images stored in the Telegram channel. */
export async function GET(request, { params }) {
  const { id: fileId } = await params;

  if (!fileId || !FILE_ID.test(fileId)) {
    return new Response('Invalid file id', { status: 400 });
  }

  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return new Response('Server configuration error', { status: 500 });

    const fileRes = await fetch(
      `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`
    );
    const fileData = await fileRes.json();

    // Never echo Telegram's error text back — it can carry the chat id.
    if (!fileData.ok) return new Response('Image not found', { status: 404 });

    const imgRes = await fetch(
      `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`
    );
    if (!imgRes.ok) return new Response('Image not found', { status: 404 });

    const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      return new Response('Not an image', { status: 415 });
    }

    return new Response(imgRes.body, {
      headers: {
        'Content-Type': contentType,
        // File ids are immutable, so this can sit in the CDN forever.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Image Proxy Error:', error);
    return new Response('Image not available', { status: 500 });
  }
}
