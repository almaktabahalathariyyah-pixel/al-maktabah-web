/** @type {import('next').NextConfig} */

/**
 * Google sign-in used to bounce through
 * `<project>.firebaseapp.com/__/auth/handler`, which is a DIFFERENT SITE from
 * this one. Browsers now partition storage per site and treat
 * "our site → someone else's site → our site" as bounce tracking, so the
 * state Firebase writes just before that hop was being dropped on the way
 * back: Google confirmed the sign-in, getRedirectResult() then resolved with
 * null, and the reader landed back here still signed out. Popup mode failed
 * the same way, just louder ("missing initial state").
 *
 * Proxying the handler through this domain makes the whole round trip
 * same-origin, so there is no cross-site storage left to block. This is the
 * fix that does NOT need a new subdomain, a DNS record, or Firebase Hosting —
 * `authDomain` becomes whatever host the app is already being served from
 * (see src/lib/firebase.js).
 */
const FIREBASE_AUTH_ORIGIN = `https://${
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'al-maktabah-al-athariyyah'
}.firebaseapp.com`;

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/__/auth/:path*',
        destination: `${FIREBASE_AUTH_ORIGIN}/__/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
