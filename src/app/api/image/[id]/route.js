export const runtime = 'edge';

export async function GET(request, { params }) {
  const { id: fileId } = await params;

  if (!fileId) {
    return new Response('Missing file ID', { status: 400 });
  }

  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return new Response('Server configuration error', { status: 500 });
    }

    // Get the file path from Telegram
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`);
    const fileData = await fileRes.json();

    if (!fileData.ok) {
      return new Response(`Telegram Error: ${fileData.description || 'Unknown error'}`, { status: 500 });
    }

    const filePath = fileData.result.file_path;
    
    // Fetch the actual image from Telegram
    const imgRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);

    if (!imgRes.ok) {
      return new Response('Error downloading image from Telegram', { status: 500 });
    }

    // Stream the image with aggressive caching
    return new Response(imgRes.body, {
      headers: {
        'Content-Type': imgRes.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });

  } catch (error) {
    console.error('Image Proxy Error:', error);
    return new Response(`Internal Server Error: ${error.message}`, { status: 500 });
  }
}
