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
      if (fileData.description && fileData.description.includes('too big')) {
        const html = `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><title>ไฟล์ใหญ่เกินไป</title><style>
            body { font-family: system-ui, -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff; text-align: center; padding: 2rem; }
            .box { background: #2a2a2a; padding: 2.5rem 2rem; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.4); max-width: 420px; }
            a { display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; transition: background 0.2s; }
            a:hover { background: #059669; }
            p { color: #a1a1aa; line-height: 1.5; margin-bottom: 0; }
          </style></head>
          <body>
            <div class="box">
              <h2 style="margin-top:0">ไฟล์มีขนาดใหญ่เกินไป 📦</h2>
              <p>ขออภัย ไฟล์นี้มีขนาดใหญ่กว่าขีดจำกัดของระบบ (20MB) จึงไม่สามารถแสดงพรีวิวในหน้านี้ได้ครับ</p>
              ${telegramUrl ? `<a href="${telegramUrl}" target="_parent">ดาวน์โหลด / เปิดดูผ่าน Telegram แทน</a>` : '<p style="color:#ef4444; margin-top:1rem;">(ไม่พบลิงก์ต้นฉบับ)</p>'}
            </div>
          </body>
          </html>
        `;
        return new Response(html, { headers: { 'Content-Type': 'text/html' } });
      }
      return new Response(`Telegram Error: ${fileData.description || 'Unknown error'}`, { status: 500 });
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
    return new Response(`Internal Server Error: ${error.message} \n\n Stack: ${error.stack}`, { status: 500 });
  }
}

