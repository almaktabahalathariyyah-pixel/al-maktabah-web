import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase only if it hasn't been initialized already
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

/**
 * Auth is built on demand, never at import time.
 *
 * getAuth() validates the API key eagerly and throws. Creating it at module
 * scope meant any SERVER component that only wanted `db` — the legacy
 * /book/[id] redirect, for one — dragged browser auth into the server bundle
 * and failed the build outright when that config was absent. Only the client
 * ever signs anyone in.
 */
let authInstance = null;

export function getFirebaseAuth() {
  if (!authInstance) authInstance = getAuth(app);
  return authInstance;
}

export { app, db };
