export const runtime = 'edge';

export async function GET(request, { params }) {
  const { id } = await params;

  try {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    
    // Use Firestore REST API instead of Client SDK to avoid Edge runtime issues
    const docRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/books/${id}?key=${apiKey}`
    );

    if (!docRes.ok) {
      if (docRes.status === 404) {
        return new Response('Book not found', { status: 404 });
      }
      return new Response('Database error', { status: 500 });
    }

    const docData = await docRes.json();
    const fields = docData.fields || {};
    
    // Firestore REST API wraps values, e.g., fields.telegramFileId.stringValue
    const telegramFileId = fields.telegramFileId?.stringValue;
    const telegramUrl = fields.telegramUrl?.stringValue;
    const title = fields.title?.stringValue || 'book';

    if (!telegramFileId) {
      if (telegramUrl) {
        return Response.redirect(telegramUrl);
      }
      return new Response('No PDF file attached to this book', { status: 404 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return new Response('Server configuration error', { status: 500 });
    }

    // 1. Get file path from Telegram API
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${telegramFileId}`);
    const fileData = await fileRes.json();

    if (!fileData.ok) {
      return new Response('Error fetching file path from Telegram', { status: 500 });
    }

    const filePath = fileData.result.file_path;

    // 2. Fetch the actual file
    const pdfRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);

    if (!pdfRes.ok) {
      return new Response('Error downloading file from Telegram', { status: 500 });
    }

    // 3. Stream the file back
    // Edge runtime supports streaming without the strict 10s timeout limits of Node.js Serverless functions
    return new Response(pdfRes.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${encodeURIComponent(title)}.pdf"`,
      },
    });

  } catch (error) {
    console.error('PDF Proxy Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

