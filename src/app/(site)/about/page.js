import Link from 'next/link';
// Signpost/BookMarked rather than Compass/Library: those two now identify the
// "แหล่งหนังสืออื่นๆ" section in the nav and on its own page.
import { Languages, FolderTree, UserSearch, ScanSearch, Signpost, BookMarked } from 'lucide-react';
import styles from './page.module.css';

export const metadata = {
  title: 'เกี่ยวกับคลัง · Al-Maktabah Al-Athariyyah',
  description:
    'คลังหนังสืออิสลามหลายภาษาหลายแนว รวบรวมตำราคลาสสิกไว้ในที่เดียว พร้อมวิธีค้นหาที่ถนัด',
};

/**
 * The four ways into the shelf.
 *
 * The collection spans many genres — ʿaqīdah, fiqh, hadith, tafsīr, sīrah,
 * language, biography — so recommending individual titles would always be a
 * narrow slice of it and would go stale as the library grows. What generalises
 * is the ROUTE IN: pick the door that matches what the reader already knows.
 * Each card names a control that exists on the shelf page.
 */
const WAYS = [
  {
    icon: Languages,
    title: 'เริ่มจากภาษา',
    body: 'แถวปุ่มบนสุดของหน้าคลังแยกตามภาษา พร้อมบอกจำนวนเล่มในแต่ละภาษา เหมาะเมื่ออยากรู้ก่อนว่ามีอะไรให้อ่านในภาษาที่ถนัด',
  },
  {
    icon: FolderTree,
    title: 'เริ่มจากหมวดหมู่หรือประเภท',
    body: 'ในตัวกรองมีทั้งหมวดหมู่และประเภทหนังสือ เลือกซ้อนกันได้ เช่น ดูเฉพาะหนังสือชุดในหมวดที่สนใจ',
  },
  {
    icon: UserSearch,
    title: 'เริ่มจากผู้แต่งหรือผู้แปล',
    body: 'แถบด้านข้างรวมรายชื่อผู้แต่งและผู้แปลทั้งหมด กดชื่อแล้วจะเห็นผลงานเขียนและผลงานแปลของท่านนั้นแยกกัน',
  },
  {
    icon: ScanSearch,
    title: 'รู้ชื่อแล้วก็ค้นตรงๆ',
    body: 'ช่องค้นหารับทั้งชื่อเรื่อง ผู้แต่ง ผู้แปล และสำนักพิมพ์ พิมพ์ไม่กี่ตัวก็ขึ้นคำแนะนำให้เลือก หรือกด / เพื่อกระโดดไปที่ช่องค้นหาได้ทันที',
  },
];

export default function AboutPage() {
  return (
    <div className="container">
      <header className={`${styles.header} rise`}>
        <p className="eyebrow">เกี่ยวกับคลัง</p>
        <h1 className={styles.title}>
          ตำราหลายแนว หลายภาษา รวบรวมไว้ใน<em>ที่เดียว</em>
        </h1>
        <p className="lede">
          คลังนี้ตั้งใจเก็บรักษาและจัดระเบียบหนังสือให้ค้นเจอง่าย
          โดยยังเคารพสิทธิ์ของผู้แต่งและสำนักพิมพ์
          รายการทั้งหมดเปิดให้ค้นและดูรายละเอียดได้อย่างอิสระ ไม่ต้องสมัครสมาชิก
        </p>
      </header>

      <section>
        <h2 className={styles.sectionTitle}>
          <Signpost size={17} className={styles.sectionIcon} />
          จะเริ่มอ่านจากไหนดี
        </h2>
        <p className={styles.sectionLede}>
          เพราะหนังสือในคลังมีหลายแนวมาก การไล่ดูตั้งแต่เล่มแรกจึงไม่ใช่วิธีที่ดีนัก
          แนะนำให้เลือก &ldquo;ประตู&rdquo; ที่ตรงกับสิ่งที่คุณรู้อยู่แล้ว แล้วค่อยขยับจากตรงนั้น
        </p>

        <div className={styles.steps}>
          {WAYS.map((way) => (
            <article key={way.title} className={styles.step}>
              <span className={styles.stepIcon}><way.icon size={18} /></span>
              <h3 className={styles.stepTitle}>{way.title}</h3>
              <p className={styles.stepBody}>{way.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.note}>
        <span className={styles.noteIcon}><BookMarked size={18} /></span>
        <div>
          <h2 className={styles.noteTitle}>เจอเล่มที่ชอบแล้วขยับต่อได้</h2>
          <p className={styles.noteBody}>
            ในหน้าของหนังสือแต่ละเล่มจะบอกหมวดหมู่ ประเภท ภาษา ผู้แต่ง และสำนักพิมพ์ไว้
            กดที่ค่าใดก็ได้เพื่อดูเล่มอื่นที่มีค่านั้นเหมือนกัน
            เท่ากับว่าทุกเล่มเป็นจุดเริ่มต้นของแนวถัดไปได้เอง — และถ้าเข้าสู่ระบบไว้
            ก็กดบันทึกเก็บเล่มที่สนใจไว้อ่านทีหลังได้
          </p>
        </div>
      </section>

      <section className={styles.cta}>
        <div>
          <h2 className={styles.ctaTitle}>เริ่มต้นค้นหาหนังสือ</h2>
          <p className={styles.ctaBody}>
            เปิดดูคลังทั้งหมด หรือแวะดูแหล่งหนังสือจากที่อื่นที่เรารวบรวมไว้
          </p>
        </div>
        <div className={styles.ctaActs}>
          <Link href="/" className="btn btn-solid">ดูคลังหนังสือ</Link>
          <Link href="/sources" className="btn">แหล่งหนังสืออื่นๆ</Link>
        </div>
      </section>
    </div>
  );
}
