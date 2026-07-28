# Al-Maktabah Al-Athariyyah

คลังหนังสืออิสลาม — Next.js (App Router) + Firebase Firestore + Google Drive

---

## ⚠️ ต้องทำก่อนใช้งานจริง

### 1. Deploy Firestore Rules — สำคัญที่สุด

ตราบใดที่ยังไม่ deploy ไฟล์ `firestore.rules` **ฐานข้อมูลจะไม่มีการป้องกันใดๆ เลย**
ทุกอย่างที่เห็นในหน้าเว็บเป็นแค่การซ่อนฝั่ง browser ซึ่งเปิด devtools ก็ข้ามได้

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only firestore:rules,firestore:indexes
```

สิ่งที่ rules บังคับไว้:

| กติกา | ผลถ้าไม่มี rules |
|---|---|
| ผู้ใช้แก้ `role` / `approved` ของตัวเองไม่ได้ | ใครก็ตั้งตัวเองเป็นแอดมินได้ |
| เล่ม `restricted` อ่านได้เฉพาะคนที่อนุมัติแล้ว | ดึงข้อมูลเล่มสงวนสิทธิ์ได้หมดผ่าน API |
| รับคำเชิญต้องมีรหัสที่ยัง valid จริง | ใครก็ approve ตัวเองได้ |
| `downloads` เขียนได้อย่างเดียว ลบ/แก้ไม่ได้ | ลบประวัติตัวเองได้ |

### 2. Migrate ลิงก์คำเชิญ

รหัสคำเชิญย้ายจาก `config/inviteLinks` (array เดียว) → `invites/{code}` (เอกสารละรหัส)
เพราะ security rules อ่าน array ไม่ได้ จึงตรวจสอบอะไรไม่ได้เลย

ลิงก์เดิมจะใช้ไม่ได้ **ให้สร้างใหม่ที่ แผงควบคุม → อนุมัติสมาชิก → ลิงก์คำเชิญ**
(ตอนนี้ตั้งวันหมดอายุและจำกัดจำนวนคนได้แล้ว)

### 3. Backfill ฟิลด์ `restricted`

Rules บังคับให้ผู้อ่านที่ยังไม่อนุมัติ query ด้วย `where('restricted','==',false)`
เล่มที่**ไม่มีฟิลด์ `restricted` เลย** จะไม่เข้าเงื่อนไขนี้ และจะมองไม่เห็นสำหรับคนทั่วไป

เปิด Firestore console แล้วเติม `restricted: false` ให้เล่มที่ยังไม่มี
หรือแก้ผ่าน แผงควบคุม → เลือกทั้งหมด → แก้ไขพร้อมกัน → สถานะ = สาธารณะ

---

## ตัวแปรสภาพแวดล้อม

สร้าง `.env.local` (ไฟล์นี้อยู่ใน `.gitignore` แล้ว)

```env
# Firebase — ดูได้จาก Project settings → Your apps
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# Google Drive — ที่เก็บไฟล์ PDF
# Google Cloud console → Credentials → OAuth client ID (Web application)
# ต้องใส่โดเมนเว็บใน "Authorized JavaScript origins"
NEXT_PUBLIC_GOOGLE_CLIENT_ID=

# Telegram — ใช้เก็บภาพหน้าปกเท่านั้น (ฝั่งเซิร์ฟเวอร์)
# ห้ามใส่ NEXT_PUBLIC_ นำหน้า เด็ดขาด
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# ไม่บังคับ — ลิงก์แชนแนลที่แสดงใน footer
NEXT_PUBLIC_TELEGRAM_CHANNEL_URL=
```

---

## ไฟล์ PDF เก็บที่ไหน

**Google Drive เป็นหลัก + Telegram เป็นสำเนาสำรอง**

อัปโหลดตรงจาก browser ของแอดมินไปยัง Drive ด้วย OAuth token ของแอดมินเอง
ไม่ผ่านเซิร์ฟเวอร์ เพราะ:

- **ไม่ติดเพดานขนาดไฟล์** — Vercel จำกัด request body ~4.5MB ถ้าอัปผ่านเซิร์ฟเวอร์จะอัปหนังสือไม่ได้เลย
- **ไม่มี secret หลุดไป browser** — token เป็นของแอดมินคนนั้น หมดอายุใน 1 ชั่วโมง

### สำเนาสำรองบน Telegram

หลังอัปขึ้น Drive แล้ว ระบบส่ง **ลิงก์** ให้ Telegram แล้ว Telegram ไปโหลดไฟล์เอง
(`sendDocument` รับ URL ได้) แปลว่าไฟล์ไม่วิ่งผ่านเซิร์ฟเวอร์ และ bot token
อยู่ฝั่งเซิร์ฟเวอร์ล้วน

**จำกัดที่ 20MB** ซึ่งตรงกับเพดานที่ Telegram ส่งไฟล์กลับมาได้พอดี —
เล่มที่สำรองได้ คือเล่มที่สำเนานั้นใช้งานได้จริง ไม่มีกรณีสำรองไปแล้วเปิดไม่ได้

> **ซื้อ Telegram Premium ไม่ช่วยขยายเพดานนี้** เพราะมันขยายเพดานของ
> *บัญชีผู้ใช้* ไม่ใช่ของ *บอท* ซึ่งเป็นคนละชุดกัน

เล่มที่ใหญ่กว่า 20MB จะพึ่ง Drive อย่างเดียว — หน้าสถิติบอกว่ามีกี่เล่ม

### เมื่อ Drive เปิดไม่ได้ (โควตารายวันเต็ม)

`/api/pdf/[id]` ไล่ลงบันได 4 ขั้นแทนที่จะปล่อยให้ผู้อ่านเจอหน้า error ของ Google:

1. **ตรวจ Drive ก่อน** — ยิง request สั้นๆ ดูว่าได้ PDF จริงไหม (เพิ่ม latency ~1 รอบ
   แต่แลกกับการสลับสำรองอัตโนมัติ)
2. **Drive ปกติ** → ส่งผู้อ่านไป Drive
3. **Drive ติดโควตา** → สลับไปใช้สำเนา Telegram ให้เงียบๆ ผู้อ่านไม่รู้ตัวด้วยซ้ำ
4. **ไม่มีสำเนา** → แสดงหน้าอธิบายว่าเกิดอะไรขึ้น กลับมาได้เมื่อไหร่
   (โดยประมาณ ~24 ชม. เพราะ Google ไม่บอกเวลารีเซ็ตที่แน่นอน) และปุ่มติดต่อ LINE OA

ตั้งลิงก์ LINE OA ได้ที่ **แผงควบคุม → ตั้งค่าหมวดหมู่ → ช่องทางติดต่อ**
(หรือ env `NEXT_PUBLIC_LINE_OA_URL` เป็นตัวสำรอง)

### ข้อจำกัดที่ควรรู้

- **เล่มสงวนสิทธิ์ยังตั้งเป็น "ใครมีลิงก์ก็เปิดได้" ใน Drive** เพราะระบบส่งผู้อ่านไปเปิดที่ Drive
  โดยตรง การล็อกในเว็บจึงกันคนที่ยังไม่มีลิงก์เท่านั้น
  ถ้าต้องปิดสนิท ต้องเก็บ Google refresh token ฝั่งเซิร์ฟเวอร์แล้ว stream ไฟล์ผ่าน API
- **Drive มีโควตาดาวน์โหลดต่อไฟล์ต่อวัน** เล่มที่คนโหลดเยอะมากอาจขึ้น
  "can't view or download at this time" ชั่วคราว
- พื้นที่บัญชีและปริมาณที่ใช้ไป แสดงอยู่ในหน้าอัปโหลด เตือนอัตโนมัติเมื่อถึง 90%

---

## เริ่มพัฒนา

```bash
npm install
npm run dev
```

เปิด http://localhost:3000

> ถ้าไม่มี `.env.local` หน้าเว็บจะ render ได้ แต่ทุกคำสั่งที่คุยกับ Firebase จะล้มเหลว

### ตั้งตัวเองเป็นแอดมิน

ล็อกอินด้วย Google หนึ่งครั้งเพื่อให้ระบบสร้าง `users/{uid}` แล้วเข้า Firestore console
เปลี่ยน `role` จาก `"user"` เป็น `"admin"` ด้วยมือ (rules ห้ามแก้ฟิลด์นี้จากเว็บโดยตั้งใจ)

---

## โครงสร้าง

```
src/
├── app/
│   ├── (site)/          หน้าฝั่งผู้อ่าน — มี Masthead ครอบ
│   │   └── book/[lang]/[id]/   page.js = server (metadata/JSON-LD)
│   │                           BookDetail.js = client (ปุ่ม/สิทธิ์)
│   ├── admin/           แผงควบคุม — มี AdminShell ครอบ ตรวจสิทธิ์ทุกหน้า
│   └── api/
│       ├── pdf/[id]     ตรวจสิทธิ์แล้วส่งต่อไป Drive หรือ stream จาก Telegram
│       ├── image/[id]   proxy ภาพหน้าปกจาก Telegram (cache ถาวร)
│       └── admin/upload-cover
├── components/
├── context/             Auth / Admin / Toast
└── lib/
    ├── googleDrive.js   เชื่อมต่อ อัปโหลด ลบ เช็คโควตา
    ├── serverAuth.js    ตรวจ ID token ฝั่ง edge
    └── stats.js         บันทึกสถิติ (raw event + รายวัน + ตัวนับต่อเล่ม)
```

**หมายเหตุสำหรับคนแก้โค้ดต่อ:** `/book/[id]` แบบเดิมถูกลบทิ้งแล้ว Next.js ไม่ยอมให้มี
slug คนละชื่อในตำแหน่งเดียวกัน — การมีทั้ง `[id]` และ `[lang]/[id]` ทำให้ `next start`
พังทุก request ทั้งที่ build ผ่าน ลิงก์เก่ารองรับที่ `book/[lang]/page.js` แทน
