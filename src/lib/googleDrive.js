'use client';

/**
 * Everything the admin desk needs to talk to Google Drive from the browser.
 *
 * Uploads go straight from the browser to Drive with the owner's own OAuth
 * token. Nothing routes through Vercel, so there is no request-size ceiling
 * and no shared secret in the page — which is why the Telegram upload path,
 * and the endpoint that handed the bot token to the browser, are gone.
 */

const STORAGE_KEY = 'googleDriveToken';

/** So a tab can tell when another one connected, switched or disconnected. */
export const TOKEN_STORAGE_KEY = STORAGE_KEY;
const SCOPES = [
  // Create and manage only the files this app made. It cannot see the rest
  // of the owner's Drive.
  'https://www.googleapis.com/auth/drive.file',
  // Read-only access to the quota figures shown in the upload panel.
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

/** Loads Google Identity Services once, and resolves when it is usable. */
export function loadGoogleScript() {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.google?.accounts?.oauth2) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(true));
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

/** The saved token, or null when it is missing or past its life. */
export function readSavedToken() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved?.token || Date.now() >= saved.expiresAt) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return saved;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function clearSavedToken() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Opens the Google consent screen and stores the resulting access token.
 * `prompt: 'consent'` forces the account chooser, which is how the owner
 * switches to a second Drive once the first one fills up.
 */
export async function connectDrive({ chooseAccount = false } = {}) {
  const ready = await loadGoogleScript();
  if (!ready) throw new Error('โหลด Google API ไม่สำเร็จ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('ยังไม่ได้ตั้งค่า NEXT_PUBLIC_GOOGLE_CLIENT_ID');

  const token = await new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      prompt: chooseAccount ? 'consent select_account' : '',
      callback: (response) => {
        if (response.error) reject(new Error('การยืนยันตัวตน Google ล้มเหลว'));
        else resolve(response.access_token);
      },
      error_callback: () => reject(new Error('ยกเลิกการเชื่อมต่อ Google')),
    });
    client.requestAccessToken();
  });

  // Google access tokens last an hour; stop trusting ours five minutes early
  // so a long upload cannot die halfway through.
  const saved = { token, expiresAt: Date.now() + 55 * 60 * 1000 };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  return saved;
}

/**
 * Which account is connected and how full it is.
 * Returns null rather than throwing — this is decoration, not a gate.
 */
export async function fetchDriveAccount(token) {
  try {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName),storageQuota(limit,usage)',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const limit = Number(data.storageQuota?.limit || 0);
    const usage = Number(data.storageQuota?.usage || 0);

    return {
      email: data.user?.emailAddress || '',
      name: data.user?.displayName || '',
      // limit is absent on unlimited (Workspace) accounts.
      limit,
      usage,
      percent: limit > 0 ? Math.min(100, Math.round((usage / limit) * 100)) : null,
      free: limit > 0 ? Math.max(0, limit - usage) : null,
    };
  } catch {
    return null;
  }
}

export function formatBytes(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** XHR rather than fetch, purely because fetch cannot report upload progress. */
function putWithProgress(url, body, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', 'application/pdf');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Drive ตอบกลับด้วยข้อมูลที่อ่านไม่ได้'));
        }
      } else {
        reject(new Error(`อัปโหลดล้มเหลว (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('เชื่อมต่อ Google Drive ไม่สำเร็จ'));
    xhr.onabort = () => reject(new Error('ยกเลิกการอัปโหลด'));
    xhr.send(body);

    return xhr;
  });
}

/**
 * Resumable upload of one PDF, then opens it to anyone with the link.
 * Resolves to { id, url }.
 */
export async function uploadPdfToDrive({ token, file, name, onProgress }) {
  const initRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'application/pdf',
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify({ name: name || file.name, mimeType: 'application/pdf' }),
    }
  );

  if (initRes.status === 401 || initRes.status === 403) {
    throw new Error('สิทธิ์ Google Drive หมดอายุ กรุณาเชื่อมต่อใหม่');
  }
  if (!initRes.ok) {
    throw new Error(`เริ่มอัปโหลดไม่สำเร็จ (${initRes.status}) — พื้นที่ Drive อาจเต็ม`);
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) throw new Error('Google Drive ไม่ได้ส่ง URL สำหรับอัปโหลดกลับมา');

  const result = await putWithProgress(uploadUrl, file, onProgress || (() => {}));
  if (!result?.id) throw new Error('Google Drive ไม่ได้ส่งรหัสไฟล์กลับมา');

  // Without this the link only works for the account that uploaded it.
  const shared = await shareWithAnyone(result.id, token);
  if (!shared) throw new Error('อัปโหลดสำเร็จ แต่ตั้งค่าให้เปิดสาธารณะไม่สำเร็จ');

  return { id: result.id, url: `https://drive.google.com/file/d/${result.id}/view` };
}

/**
 * Grants "anyone with the link" read access — the sharing level every reader
 * page assumes, since a book opens straight to Drive rather than through a
 * server that could check membership itself. Files this app uploads get this
 * automatically; a file picked from an existing Drive (pickDriveFile below)
 * needs it applied explicitly, since it was shared however the owner had it
 * before.
 */
export async function shareWithAnyone(id, token) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}/permissions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    }
  );
  return res.ok;
}

/** Pulls the file id out of either Drive link shape. */
export function driveIdFrom(url) {
  if (!url) return null;
  const byPath = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (byPath) return byPath[1];
  const byQuery = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return byQuery ? byQuery[1] : null;
}

/**
 * The file name AND the account that holds it, in one call.
 *
 * Asking for the name alone left `driveOwner` blank on every book uploaded
 * before that field existed, so the "which Drive is this in" filter had
 * nothing to offer but "ยังไม่ได้บันทึกบัญชี".
 *
 * `owners` is occasionally absent (shared drives report none), so the connected
 * account is the fallback: under the drive.file scope a token can only read
 * files this app created on that same Drive, which makes "the token that could
 * read it" a sound answer to "whose Drive is it".
 */
export async function fetchDriveFileMeta(driveUrl, token, fallbackOwner = '') {
  const id = driveIdFrom(driveUrl);
  if (!id) return { ok: false, reason: 'invalid-link' };
  if (!token) return { ok: false, reason: 'not-connected' };

  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}?fields=name,owners(emailAddress)`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.status === 401) return { ok: false, reason: 'expired' };
    if (res.status === 403 || res.status === 404) return { ok: false, reason: 'other-account' };
    if (!res.ok) return { ok: false, reason: `http-${res.status}` };

    const data = await res.json();
    const name = data?.name || '';
    const owner = data?.owners?.[0]?.emailAddress || fallbackOwner;
    if (!name && !owner) return { ok: false, reason: 'missing-name' };
    return { ok: true, name, owner };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

/**
 * Deletes a Drive file.
 *
 * Returns a reason instead of throwing, because the caller needs to tell the
 * owner WHY it failed. 404 here almost always means "this file belongs to a
 * different Google account than the one you are connected to" — the case that
 * matters once a second Drive is in play, and the case the old code swallowed.
 */
export async function deleteFromDrive(driveUrl, token) {
  const id = driveIdFrom(driveUrl);
  if (!id) return { ok: false, reason: 'invalid-link' };
  if (!token) return { ok: false, reason: 'not-connected' };

  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok || res.status === 204) return { ok: true };
    if (res.status === 401) return { ok: false, reason: 'expired' };
    if (res.status === 404 || res.status === 403) return { ok: false, reason: 'other-account' };
    return { ok: false, reason: `http-${res.status}` };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// -------------------------------------------------------------- picker ----

let pickerApiReady = null;

/**
 * Google's classic `gapi` loader, needed only to pull in the Picker module —
 * everything else here talks to the REST API directly and has no use for it.
 */
function loadPickerApi() {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.google?.picker) return Promise.resolve(true);
  if (pickerApiReady) return pickerApiReady;

  pickerApiReady = new Promise((resolve) => {
    const loadPickerModule = () => {
      window.gapi.load('picker', { callback: () => resolve(true), onerror: () => resolve(false) });
    };
    if (window.gapi?.load) {
      loadPickerModule();
      return;
    }

    const existing = document.querySelector('script[src*="apis.google.com/js/api.js"]');
    if (existing) {
      existing.addEventListener('load', loadPickerModule);
      existing.addEventListener('error', () => resolve(false));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.defer = true;
    script.onload = loadPickerModule;
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return pickerApiReady;
}

/**
 * Opens Google's own file browser so the owner can point at a PDF already
 * sitting in their Drive — uploaded by hand, or by another tool entirely —
 * without re-uploading the bytes through this app.
 *
 * This is also the ONLY way this app's `drive.file`-scoped token can ever
 * read a file it did not itself create: picking a file through this exact
 * dialog is what Google counts as the app being "given" that file, which is
 * what the scope actually grants access to. There is no API call that
 * shortcuts this — a pasted link alone never earns read access.
 *
 * Resolves to { id, name }, or null if the owner closes the dialog empty-handed.
 */
export async function pickDriveFile({ token, apiKey }) {
  if (!apiKey) throw new Error('ยังไม่ได้ตั้งค่า NEXT_PUBLIC_GOOGLE_PICKER_API_KEY');

  const ready = await loadPickerApi();
  if (!ready) throw new Error('โหลดตัวเลือกไฟล์ของ Google ไม่สำเร็จ ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');

  return new Promise((resolve, reject) => {
    try {
      const picker = window.google.picker;
      const view = new picker.DocsView(picker.ViewId.DOCS)
        .setMimeTypes('application/pdf')
        .setIncludeFolders(true);

      new picker.PickerBuilder()
        .addView(view)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .setCallback((data) => {
          if (data.action === picker.Action.PICKED) {
            const doc = data.docs?.[0];
            resolve(doc ? { id: doc.id, name: doc.name } : null);
          } else if (data.action === picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build()
        .setVisible(true);
    } catch (err) {
      reject(err instanceof Error ? err : new Error('เปิดตัวเลือกไฟล์ไม่สำเร็จ'));
    }
  });
}

export const DELETE_REASONS = {
  'invalid-link': 'ลิงก์ Drive ไม่ถูกต้อง',
  'not-connected': 'ยังไม่ได้เชื่อมต่อ Google Drive',
  expired: 'สิทธิ์ Google Drive หมดอายุ',
  'other-account': 'ไฟล์อยู่ในบัญชี Google อื่น — เชื่อมบัญชีที่อัปโหลดไฟล์นั้นแล้วลองใหม่',
  network: 'เชื่อมต่อ Google Drive ไม่สำเร็จ',
};
