/**
 * Edge-safe auth helpers for the route handlers.
 *
 * The client SDK cannot run in an edge route, so identity is verified
 * against the Identity Toolkit REST endpoint and the reader's record is
 * read straight from the Firestore REST API.
 *
 * IMPORTANT: the reader's permission lives in TWO fields, written by
 * different flows:
 *   approved      boolean, written by AuthContext + the approvals desk
 *   accessStatus  'none' | 'pending' | 'approved' | 'rejected'
 * Older records may only carry `status`. All three are accepted here so a
 * reader approved through any path is recognised.
 */

const IDENTITY_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';

/** REST path for one Firestore document. */
export function firestoreDocUrl(projectId, path) {
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}`;
}

/**
 * Reads one document AS the signed-in reader.
 *
 * Every server-side Firestore read must go through here. Passing only the API
 * key makes the request anonymous, which the security rules correctly refuse —
 * the key identifies the project, never the person.
 */
export function fetchDocAsUser(projectId, path, token) {
  return fetch(firestoreDocUrl(projectId, path), {
    headers: { Authorization: `Bearer ${token}` },
  });
}

/** Reads a Firestore REST value wrapper regardless of its declared type. */
function readValue(field) {
  if (!field) return undefined;
  if ('booleanValue' in field) return field.booleanValue;
  if ('stringValue' in field) return field.stringValue;
  if ('integerValue' in field) return Number(field.integerValue);
  return undefined;
}

/**
 * Verifies the ID token and loads the reader's role.
 * Returns { error, status } on failure, or { uid, isAdmin, isApproved }.
 */
export async function resolveReader(token) {
  if (!token) return { error: 'ต้องเข้าสู่ระบบก่อน', status: 401 };

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) {
    return { error: 'เซิร์ฟเวอร์ยังตั้งค่าไม่ครบ', status: 500 };
  }

  const authRes = await fetch(`${IDENTITY_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  });

  const authData = await authRes.json().catch(() => null);
  if (!authRes.ok || !authData?.users?.length) {
    return { error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', status: 401 };
  }

  const uid = authData.users[0].localId;

  // The ID token has to travel with this read, not just be verified above.
  // A Firestore REST call carrying only ?key= is anonymous, so the moment the
  // security rules went live, `allow get: if isSelf(uid)` denied it and every
  // reader was told their account did not exist.
  const userRes = await fetch(
    firestoreDocUrl(projectId, `users/${uid}`),
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!userRes.ok) {
    return { error: 'ไม่พบข้อมูลบัญชีผู้ใช้', status: 403 };
  }

  const fields = (await userRes.json())?.fields || {};
  const isAdmin = readValue(fields.role) === 'admin';
  const isApproved =
    isAdmin ||
    readValue(fields.approved) === true ||
    readValue(fields.accessStatus) === 'approved' ||
    readValue(fields.status) === 'approved';

  return { uid, isAdmin, isApproved };
}

/** Pulls a bearer token from the Authorization header, falling back to ?token=. */
export function tokenFrom(request) {
  const header = request.headers.get('Authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return new URL(request.url).searchParams.get('token') || '';
}

export function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
