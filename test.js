import { readFileSync } from 'fs';

// load env vars from .env.local
const envFile = readFileSync('.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1]] = match[2].replace(/^["']|["']$/g, '');
  }
});

const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY;
const id = 'exkXwn4fBkGODjXBb6sl'; // The ID from the user's screenshot!

async function test() {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/books/${id}?key=${apiKey}`;
  console.log('Fetching:', url);
  const res = await fetch(url);
  const data = await res.text();
  console.log('Status:', res.status);
  console.log('Data:', data.substring(0, 500));
}

test();
