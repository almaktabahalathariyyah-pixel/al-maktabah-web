import { NextResponse } from 'next/server';
import { Telegraf } from 'telegraf';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { joinPeople } from '@/lib/people';
import {
  getServiceAccount,
  bookExistsInFirestore,
  createSyncedBook,
} from '@/lib/firestoreAdminRest';

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const bot = botToken ? new Telegraf(botToken) : null;

/**
 * Comma-separated Telegram chat IDs to auto-sync into Firestore whenever a
 * new PDF file or Google Drive / direct PDF link is posted in either chat.
 * Example: TELEGRAM_AUTO_SYNC_CHAT_IDS=-1001234567890,-1009876543210
 */
function allowedSyncChatIds() {
  const raw =
    process.env.TELEGRAM_AUTO_SYNC_CHAT_IDS ||
    process.env.TELEGRAM_CHAT_ID ||
    '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

const DRIVE_FILE_RE =
  /https?:\/\/(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?[^\s]*?id=)|drive\.usercontent\.google\.com\/download\?[^\s]*?id=)([a-zA-Z0-9_-]{20,})/g;
const DRIVE_FOLDER_RE =
  /https?:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]{20,})/g;
const DIRECT_PDF_RE = /https?:\/\/[^\s"'<>]+\.pdf(?:\?[^\s"'<>]*)?/gi;

function detectLanguage(text) {
  const s = String(text || '');
  const thai = (s.match(/[\u0E00-\u0E7F]/g) || []).length;
  const arabic = (s.match(/[\u0600-\u06FF]/g) || []).length;
  if (thai >= 3) return 'ไทย';
  if (arabic >= 3) return 'อาหรับ';
  return 'อังกฤษ';
}

function cleanTitle(raw, fallback = 'หนังสือใหม่จาก Telegram') {
  const firstLine = String(raw || '')
    .split(/\r?\n/)
    .map((l) => l.replace(/https?:\/\/\S+/g, '').trim())
    .find(Boolean);
  const base = (firstLine || fallback)
    .replace(/\.pdf$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base.slice(0, 180) || fallback;
}

/** Expands a public Google Drive folder into individual PDF entries (depth 1). */
async function expandDriveFolder(folderId) {
  try {
    const res = await fetch(
      `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const out = [];
    const re =
      /href="https:\/\/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/view[^"]*"[^>]*>[\s\S]*?class="flip-entry-title"[^>]*>([^<]+)</g;
    let m;
    while ((m = re.exec(html)) !== null) {
      const name = m[2].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
      if (/\.pdf$/i.test(name)) {
        out.push({ driveId: m[1], filename: name });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Handles any incoming message / channel_post from the configured Telegram chats
 * and automatically adds new PDFs or Drive/PDF links to Firestore.
 */
async function handleAutoSyncMessage(msg) {
  if (!msg || !msg.chat) return { added: 0 };

  const chatId = String(msg.chat.id);
  const allowed = allowedSyncChatIds();
  if (!allowed.size || !allowed.has(chatId)) return { added: 0 };

  const sa = getServiceAccount();
  if (!sa) {
    console.warn('Telegram auto-sync skipped: FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
    return { added: 0 };
  }

  const caption = msg.caption || msg.text || '';
  const chatTitle = msg.chat.title || msg.chat.username || chatId;
  const candidates = [];

  // 1. Direct PDF document attachment
  const docFile = msg.document;
  if (docFile) {
    const mime = String(docFile.mime_type || '').toLowerCase();
    const fname = String(docFile.file_name || '');
    if (mime === 'application/pdf' || /\.pdf$/i.test(fname)) {
      const title = cleanTitle(caption || fname, fname || `Telegram PDF #${msg.message_id}`);
      candidates.push({
        title,
        language: detectLanguage(`${title} ${fname}`),
        telegramFileId: docFile.file_id,
        sourceFile: fname || `${title}.pdf`,
        sizeBytes: Number(docFile.file_size || 0),
        syncedFromTelegramChat: chatTitle,
      });
    }
  }

  // 2. Individual Google Drive file links
  const seenDriveIds = new Set();
  for (const m of caption.matchAll(DRIVE_FILE_RE)) {
    const driveId = m[1];
    if (seenDriveIds.has(driveId)) continue;
    seenDriveIds.add(driveId);
    const title = cleanTitle(caption, `หนังสือจาก Drive (${driveId.slice(0, 8)})`);
    candidates.push({
      title,
      language: detectLanguage(title),
      driveUrl: `https://drive.google.com/file/d/${driveId}/view`,
      syncedFromTelegramChat: chatTitle,
    });
  }

  // 3. Google Drive folders (expanded to individual PDFs)
  for (const m of caption.matchAll(DRIVE_FOLDER_RE)) {
    const files = await expandDriveFolder(m[1]);
    for (const f of files) {
      if (seenDriveIds.has(f.driveId)) continue;
      seenDriveIds.add(f.driveId);
      const title = cleanTitle(f.filename);
      candidates.push({
        title,
        language: detectLanguage(title),
        driveUrl: `https://drive.google.com/file/d/${f.driveId}/view`,
        sourceFile: f.filename,
        syncedFromTelegramChat: chatTitle,
      });
    }
  }

  // 4. Direct HTTPS .pdf URLs (non-Drive)
  const seenDirect = new Set();
  for (const m of caption.matchAll(DIRECT_PDF_RE)) {
    const pdfUrl = m[0];
    if (/drive\.google\.com|drive\.usercontent\.google\.com/i.test(pdfUrl)) continue;
    if (seenDirect.has(pdfUrl)) continue;
    seenDirect.add(pdfUrl);
    const urlName = decodeURIComponent(pdfUrl.split('/').pop()?.split('?')[0] || '');
    const title = cleanTitle(caption || urlName, urlName || 'หนังสือ PDF ออนไลน์');
    candidates.push({
      title,
      language: detectLanguage(`${title} ${urlName}`),
      driveUrl: pdfUrl,
      sourceFile: urlName || undefined,
      syncedFromTelegramChat: chatTitle,
    });
  }

  let added = 0;
  for (const item of candidates) {
    try {
      const exists = await bookExistsInFirestore(sa, {
        driveUrl: item.driveUrl,
        telegramFileId: item.telegramFileId,
      });
      if (exists) continue;
      await createSyncedBook(sa, item);
      added += 1;
    } catch (err) {
      console.error('Telegram auto-sync failed for item:', item.title, err);
    }
  }

  return { added };
}

if (bot) {
  bot.start(async (ctx) => {
    const payload = ctx.payload;
    if (!payload) {
      return ctx.reply('อัสลามุอะลัยกุม! ยินดีต้อนรับสู่บอทห้องสมุด 📚\nบอทนี้ใช้สำหรับโหลดและจัดการหนังสือครับ');
    }

    if (payload.startsWith('book_')) {
      const bookId = payload.replace('book_', '');
      try {
        const docRef = doc(db, 'books', bookId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          return ctx.reply('❌ ขออภัย ไม่พบหนังสือนี้ในระบบ');
        }

        const book = docSnap.data();

        if (book.restricted === true) {
          return ctx.reply(
            '🔒 เล่มนี้เปิดให้เฉพาะสมาชิกที่ได้รับอนุมัติ\nกรุณาเข้าอ่านผ่านเว็บไซต์หลังเข้าสู่ระบบครับ'
          );
        }

        if (!book.telegramFileId) {
          return ctx.reply('❌ ขออภัย ไม่พบไฟล์ในระบบ');
        }

        await ctx.replyWithDocument(book.telegramFileId, {
          caption: `📚 ${book.title}\n✍️ ${joinPeople(book.author) || '-'}\n\nสนับสนุนโดย Al-Maktabah`,
        });

        try {
          await updateDoc(docRef, { downloadCount: increment(1) });
        } catch (err) {
          console.warn('Could not bump downloadCount:', err);
        }
      } catch (err) {
        console.error(err);
        ctx.reply('❌ เกิดข้อผิดพลาดในการดึงข้อมูลหนังสือ');
      }
    }
  });
}

export async function POST(req) {
  if (!bot) {
    return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
  }

  if (webhookSecret) {
    const sent = req.headers.get('x-telegram-bot-api-secret-token');
    if (sent !== webhookSecret) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  try {
    const body = await req.json();

    // Auto-sync new PDFs / Drive links posted in either monitored Telegram chat
    const incomingMsg = body?.channel_post || body?.message;
    const syncResult = await handleAutoSyncMessage(incomingMsg);

    await bot.handleUpdate(body);
    return NextResponse.json({ ok: true, synced: syncResult.added });
  } catch (error) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
