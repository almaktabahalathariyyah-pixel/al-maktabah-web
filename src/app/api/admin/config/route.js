import { getDoc, doc } from 'firebase/firestore';

export const runtime = 'edge';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return new Response(JSON.stringify({ error: 'Missing token' }), { status: 401 });
  }

  try {
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
    
    // Only allow admins or approved users to get the config
    if (!isApproved && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Not authorized' }), { status: 403 });
    }

    // Return the config
    return new Response(JSON.stringify({
      telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
      telegramChatId: process.env.TELEGRAM_CHAT_ID || '',
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Config API Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}
