export const runtime = 'edge';

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function GET(request, { params }) {
  const { id } = params;

  try {
    const docRef = doc(db, 'books', id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      return new Response('Book not found', { status: 404 });
    }

    const book = docSnap.data();
    if (!book.telegramFileId) {
      // Fallback for old books that use direct URLs
      if (book.telegramUrl) {
        return Response.redirect(book.telegramUrl);
      }
      return new Response('No PDF file attached to this book', { status: 404 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return new Response('Server configuration error', { status: 500 });
    }

    // 1. Get file path from Telegram API
    const fileRes = await fetch(`https://api.telegram.org/bot${botToken}/getFile?file_id=${book.telegramFileId}`);
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
    // 'inline' tells the browser to display it in its built-in PDF viewer
    return new Response(pdfRes.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${encodeURIComponent(book.title || 'book')}.pdf"`,
      },
    });

  } catch (error) {
    console.error('PDF Proxy Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
