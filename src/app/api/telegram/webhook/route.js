import { NextResponse } from 'next/server';
import { Telegraf } from 'telegraf';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { joinPeople } from '@/lib/people';

const botToken = process.env.TELEGRAM_BOT_TOKEN;
/**
 * Set this, and set the same value as `secret_token` when registering the
 * webhook with Telegram. Telegram then sends it back on every request in
 * X-Telegram-Bot-Api-Secret-Token, and anything without it is not Telegram.
 *
 * Optional only so that an existing deployment does not go dark the moment
 * this ships. Until it is set, this endpoint accepts an update from anyone who
 * knows the URL — which is why the restricted check below does not depend on
 * it.
 */
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
const bot = botToken ? new Telegraf(botToken) : null;

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

        /**
         * The approval gate, which was missing entirely.
         *
         * /api/pdf checks `restricted` against the signed-in reader before it
         * serves a byte. This path did not check it at all: it sent the file
         * to whoever asked. Book ids are sequential integers, so guessing one
         * is trivial, and there is no link on the site that produces this
         * deep link — so the only traffic it ever had was traffic that went
         * looking for it.
         *
         * A Telegram chat cannot be matched to a site account — nothing maps
         * one to the other — so there is no version of this that can safely
         * decide the reader is approved. It refuses and points at the site,
         * where the check does exist.
         */
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

        // Best effort: a counter that fails to move must not cost the reader
        // the file they already received.
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

  // Rejected before the body is even read, when a secret is configured.
  if (webhookSecret) {
    const sent = req.headers.get('x-telegram-bot-api-secret-token');
    if (sent !== webhookSecret) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  try {
    const body = await req.json();
    await bot.handleUpdate(body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
