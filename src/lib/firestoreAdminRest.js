import crypto from 'crypto';

/**
 * Lightweight Firebase Admin REST helper (zero extra dependencies).
 *
 * Uses FIREBASE_SERVICE_ACCOUNT_JSON (the standard service-account JSON
 * pasted into Vercel env vars) to mint an OAuth2 token and write to Firestore
 * from server-side webhooks (such as the Telegram auto-sync webhook).
 */

let cachedToken = null;
let cachedTokenExp = 0;

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function getAccessToken(sa) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedTokenExp - 60) return cachedToken;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const sig = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${claim}`)
    .sign(sa.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claim}.${sig}`,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(`Service account auth failed: ${data.error_description || res.status}`);
  }
  cachedToken = data.access_token;
  cachedTokenExp = now + Number(data.expires_in || 3600);
  return cachedToken;
}

function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  return { stringValue: String(val) };
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    fields[k] = toFirestoreValue(v);
  }
  return fields;
}

/** Checks if a book with the same driveUrl or telegramFileId already exists. */
export async function bookExistsInFirestore(sa, { driveUrl, telegramFileId }) {
  const token = await getAccessToken(sa);
  const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;

  const checks = [];
  if (driveUrl) checks.push(['driveUrl', driveUrl]);
  if (telegramFileId) checks.push(['telegramFileId', telegramFileId]);

  for (const [fieldPath, value] of checks) {
    const res = await fetch(`${base}:runQuery`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'books' }],
          where: {
            fieldFilter: {
              field: { fieldPath },
              op: 'EQUAL',
              value: { stringValue: value },
            },
          },
          limit: 1,
        },
      }),
    });
    if (res.ok) {
      const rows = await res.json();
      if (Array.isArray(rows) && rows.some((r) => r.document)) {
        return true;
      }
    }
  }
  return false;
}

/** Atomically increments metadata/counters.lastBookId and returns the new ID string. */
export async function allocateNextBookId(sa) {
  const token = await getAccessToken(sa);
  const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
  const res = await fetch(`${base}:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      writes: [
        {
          transform: {
            document: `projects/${sa.project_id}/databases/(default)/documents/metadata/counters`,
            fieldTransforms: [
              { fieldPath: 'lastBookId', increment: { integerValue: '1' } },
            ],
          },
        },
      ],
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`allocateNextBookId failed: ${JSON.stringify(data)}`);
  }
  const val = data?.writeResults?.[0]?.transformResults?.[0]?.integerValue;
  if (!val) throw new Error('allocateNextBookId returned empty counter');
  return String(val);
}

/** Creates a book document in books/{id} and bumps config/catalog.rev. */
export async function createSyncedBook(sa, bookData) {
  const token = await getAccessToken(sa);
  const id = await allocateNextBookId(sa);
  const base = `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/documents`;
  const now = new Date();

  const res = await fetch(`${base}:commit`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      writes: [
        {
          update: {
            name: `projects/${sa.project_id}/databases/(default)/documents/books/${id}`,
            fields: toFirestoreFields({
              ...bookData,
              restricted: false,
              downloadCount: 0,
              createdAt: now,
            }),
          },
        },
        {
          transform: {
            document: `projects/${sa.project_id}/databases/(default)/documents/config/catalog`,
            fieldTransforms: [
              { fieldPath: 'rev', increment: { integerValue: '1' } },
              { fieldPath: 'changedAt', setToServerValue: 'REQUEST_TIME' },
            ],
          },
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`createSyncedBook failed (${res.status}): ${errText}`);
  }
  return id;
}
