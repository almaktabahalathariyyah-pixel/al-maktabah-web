import { getDoc, doc } from 'firebase/firestore';

export const runtime = 'edge';

export async function POST(request) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid token' }), { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');

    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

    // Verify Firebase Auth Token
    const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token })
    });

    const authData = await authRes.json();
    if (!authRes.ok || !authData.users || authData.users.length === 0) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });
    }
    
    const uid = authData.users[0].localId;

    // Check if user is admin or approved
    const userRes = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}?key=${apiKey}`
    );
    
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'User record not found' }), { status: 403 });
    }
    
    const userData = await userRes.json();
    const isApproved = userData.fields?.status?.stringValue === 'approved';
    const isAdmin = userData.fields?.role?.stringValue === 'admin';
    
    if (!isApproved && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 403 });
    }

    // Process FormData
    const formData = await request.formData();
    const image = formData.get('image');

    if (!image) {
      return new Response(JSON.stringify({ error: 'No image provided' }), { status: 400 });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return new Response(JSON.stringify({ error: 'Telegram Bot Token or Chat ID is missing' }), { status: 500 });
    }

    // Send photo to Telegram
    const tgFormData = new FormData();
    tgFormData.append('chat_id', chatId);
    tgFormData.append('photo', image);

    const tgRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: 'POST',
      body: tgFormData
    });

    const tgData = await tgRes.json();
    if (!tgData.ok) {
      return new Response(JSON.stringify({ error: tgData.description }), { status: 500 });
    }

    // Telegram returns an array of photo sizes. The last one is the largest.
    const photos = tgData.result.photo;
    const largestPhoto = photos[photos.length - 1];
    const fileId = largestPhoto.file_id;

    return new Response(JSON.stringify({ success: true, url: `/api/image/${fileId}` }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Upload Cover API Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
