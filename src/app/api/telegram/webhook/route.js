import { NextResponse } from 'next/server';
import { Telegraf } from 'telegraf';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, getDoc, updateDoc, increment, setDoc } from 'firebase/firestore';
import { getNextBookId } from '@/lib/sequentialId';

// Replace with your actual bot token, or use environment variables
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = botToken ? new Telegraf(botToken) : null;

if (bot) {
  // Handle /start command (when users click download link on the website)
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

        if (docSnap.exists()) {
          const book = docSnap.data();
          if (book.telegramFileId) {
            // Send the file directly to the user
            await ctx.replyWithDocument(book.telegramFileId, {
              caption: `📚 ${book.title}\n✍️ ${book.author || '-'}\n\nสนับสนุนโดย Al-Maktabah`
            });
            
            // Optionally track download count
            await updateDoc(docRef, { downloadCount: increment(1) });
          } else {
            ctx.reply('❌ ขออภัย ไม่พบไฟล์ในระบบ');
          }
        } else {
          ctx.reply('❌ ขออภัย ไม่พบหนังสือนี้ในระบบ');
        }
      } catch (err) {
        console.error(err);
        ctx.reply('❌ เกิดข้อผิดพลาดในการดึงข้อมูลหนังสือ');
      }
    }
  });

  // (Removed document listener to prevent duplicate books when admin manually uploads files to Telegram)
}

export async function POST(req) {
  if (!bot) {
    return NextResponse.json({ error: 'Bot token not configured' }, { status: 500 });
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
