export const runtime = 'edge';

export async function GET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  const action = searchParams.get('action'); // 'download' or undefined

  try {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

    if (!token) {
      return new Response('Unauthorized: Missing token', { status: 401 });
    }

    // 1. Verify Firebase Auth Token
    const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    });

    const authData = await authRes.json();
    if (!authRes.ok || !authData.users || authData.users.length === 0) {
      return new Response('Unauthorized: Invalid token', { status: 401 });
    }
    
    const uid = authData.users[0].localId;

    // 2. Check if user is approved
    const userRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?key=${apiKey}`
    );
    
    if (!userRes.ok) {
      return new Response('Forbidden: User record not found', { status: 403 });
    }
    
    const userData = await userRes.json();
    const isApproved = userData.fields?.status?.stringValue === 'approved';
    const isAdmin = userData.fields?.role?.stringValue === 'admin';
    
    if (!isApproved && !isAdmin) {
      return new Response('Forbidden: Your account is not approved yet', { status: 403 });
    }

    // 3. Fetch Book Data
    const docRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/books/${id}?key=${apiKey}`
    );

    if (!docRes.ok) {
      if (docRes.status === 404) return new Response('Book not found', { status: 404 });
      return new Response('Database error', { status: 500 });
    }

    const docData = await docRes.json();
    const fields = docData.fields || {};
    
    const telegramFileId = fields.telegramFileId?.stringValue;
    const telegramUrl = fields.telegramUrl?.stringValue;
    const driveUrl = fields.driveUrl?.stringValue;
    const title = fields.title?.stringValue || 'book';

    // 4. Handle Google Drive Proxy
    if (driveUrl) {
      // Extract Drive ID from URL formats like:
      // https://drive.google.com/file/d/1J3aRk8FjO.../view
      // https://drive.google.com/open?id=1J3aRk8FjO...
      let driveId = null;
      const matchD = driveUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (matchD) driveId = matchD[1];
      else {
        const matchId = driveUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (matchId) driveId = matchId[1];
      }

      if (!driveId) {
        return new Response('Invalid Google Drive URL format in database.', { status: 500 });
      }

      if (action === 'download') {
        return Response.redirect(`https://drive.google.com/uc?export=download&id=${driveId}&confirm=t`);
      }
      
      // Redirect directly to Google Drive's native preview player for reading
      // This avoids Vercel bandwidth limits, timeouts, and Google Drive Virus Scan HTML warnings entirely.
      return Response.redirect(`https://drive.google.com/file/d/${driveId}/preview`);
    }

    // 5. Handle Telegram Proxy (Fallback)
    if (!telegramFileId) {
      if (telegramUrl) return Response.redirect(telegramUrl);
      return new Response('No PDF file attached to this book', { status: 404 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return new Response('Server configuration error', { status: 500 });

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
              ${telegramUrl ? `<a href="${telegramUrl}" target="_parent">ดาวน์โหลด / เปิดดูผ่าน Telegram แทน</a>` : '<p style="color:#ef4444; margin-top:1rem;">กรุณาติดต่อผู้ดูแลระบบเพื่อขอลิงก์สำรอง Google Drive</p>'}
            </div>
          </body>
          </html>
        `;
        return new Response(html, { headers: { 'Content-Type': 'text/html' } });
      }
      return new Response(`Telegram Error: ${fileData.description || 'Unknown error'}`, { status: 500 });
    }

    const filePath = fileData.result.file_path;
    const pdfRes = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);

    if (!pdfRes.ok) return new Response('Error downloading file from Telegram', { status: 500 });

    const disposition = action === 'download' ? 'attachment' : 'inline';
    
    return new Response(pdfRes.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(title)}.pdf"`,
      },
    });

  } catch (error) {
    console.error('PDF Proxy Error:', error);
    return new Response(`Internal Server Error: ${error.message}`, { status: 500 });
  }
}


