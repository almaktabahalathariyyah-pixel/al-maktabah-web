import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * The host the page is already on, so the sign-in round trip never leaves this
 * site. next.config.mjs proxies `/__/auth/*` to the real Firebase handler, and
 * that proxy exists on every deployment — localhost, previews, production —
 * so whatever host is serving this page can serve the handler too. See the
 * long note in next.config.mjs for why crossing to firebaseapp.com broke
 * login outright.
 *
 * Each host still has to be listed under Authentication → Settings →
 * Authorized domains in the Firebase console, AND as an authorized redirect
 * URI (`https://<host>/__/auth/handler`) on the OAuth client Firebase created,
 * or Google answers the sign-in with redirect_uri_mismatch.
 *
 * Only over https, though: the SDK glues a literal `https://` in front of
 * whatever authDomain says, so on a plain-http dev server it would ask for
 * https://localhost:3000 and the browser would fail the handshake outright
 * (ERR_SSL_PROTOCOL_ERROR) before login ever started. Plain http means local
 * development, so fall back to the env value and let the round trip go
 * through firebaseapp.com there — the storage partitioning this proxy exists
 * to dodge is a production problem, on a real site, in a real browser.
 *
 * The env var also covers the server, where auth never runs.
 */
const authDomain =
  typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? window.location.host
    : process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain,
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
