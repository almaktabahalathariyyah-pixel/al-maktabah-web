import { NextResponse } from 'next/server';
import { Telegraf } from 'telegraf';
import { db } from '@/lib/firebase';
import { collection, addDoc, doc, getDoc, updateDoc, increment } from 'firebase/firestore';

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

  // Handle document uploads (when admin uploads a PDF in group or private chat)
  bot.on('document', async (ctx) => {
    const document = ctx.message.document;
    const caption = ctx.message.caption || '';
    
    // Simple parsing: First line is Title, Second is Author, Third is Category
    const lines = caption.split('\n').map(l => l.trim()).filter(Boolean);
    let title = lines[0] || document.file_name.replace(/\.[^/.]+$/, ""); // Remove extension
    let author = lines[1] || '';
    let category = lines[2] || 'ทั่วไป';

    const fileSizeMB = (document.file_size / (1024 * 1024)).toFixed(2) + ' MB';
    const extension = document.file_name.split('.').pop().toUpperCase();

    try {
      const payload = {
        title,
        author,
        category,
        telegramFileId: document.file_id,
        format: extension,
        size: fileSizeMB,
        createdAt: new Date(),
        restricted: false,
        downloadCount: 0
      };

      const docRef = await addDoc(collection(db, 'books'), payload);
      
      await ctx.reply(`✅ บันทึกหนังสือขึ้นเว็บสำเร็จ!\n\n📕 ชื่อ: ${title}\n👤 ผู้แต่ง: ${author || '-'}\n📁 หมวดหมู่: ${category}\n\nลิงก์ระบบ: book_${docRef.id}\n(สามารถเข้าไปแก้ไขรูปปกและข้อมูลเพิ่มเติมได้ในหน้าเว็บแอดมิน)`, {
        reply_parameters: { message_id: ctx.message.message_id }
      });

    } catch (err) {
      console.error('Error saving book:', err);
      await ctx.reply('❌ เกิดข้อผิดพลาด ไม่สามารถบันทึกลงเว็บได้');
    }
  });
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
