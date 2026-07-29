import Link from 'next/link';
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
 * Each entry names a control that exists on the shelf page.
 *
 * Rendered as a numbered list rather than a grid of icon tiles: these are four
 * paragraphs of advice, and dressing each one in a card and a badge made the
 * page read like a product brochure instead of a note to the reader.
 */
const WAYS = [
  {
    title: 'เริ่มจากภาษา',
    body: 'แถวปุ่มบนสุดของหน้าคลังแยกตามภาษา พร้อมบอกจำนวนเล่มในแต่ละภาษา เหมาะเมื่ออยากรู้ก่อนว่ามีอะไรให้อ่านในภาษาที่ถนัด',
  },
  {
    title: 'เริ่มจากหมวดหมู่หรือประเภท',
    body: 'ในตัวกรองมีทั้งหมวดหมู่และประเภทหนังสือ เลือกซ้อนกันได้ เช่น ดูเฉพาะหนังสือชุดในหมวดที่สนใจ',
  },
  {
    title: 'เริ่มจากผู้แต่งหรือผู้แปล',
    body: 'แถบด้านข้างรวมรายชื่อผู้แต่งและผู้แปลทั้งหมด กดชื่อแล้วจะเห็นผลงานเขียนและผลงานแปลของท่านนั้นแยกกัน',
  },
  {
    title: 'รู้ชื่อแล้วก็ค้นตรงๆ',
    body: 'ช่องค้นหารับทั้งชื่อเรื่อง ผู้แต่ง ผู้แปล และสำนักพิมพ์ พิมพ์ไม่กี่ตัวก็ขึ้นคำแนะนำให้เลือก หรือกด / เพื่อกระโดดไปที่ช่องค้นหาได้ทันที',
  },
];

export default function AboutPage() {
  return (
    <div className={`container ${styles.page}`}>
      <header className={`${styles.header} rise`}>
        <p className="eyebrow">เกี่ยวกับคลัง</p>
        <h1 className={styles.title}>ตำราหลายแนว หลายภาษา รวบรวมไว้ในที่เดียว</h1>
        <p className="lede">
          คลังนี้ตั้งใจเก็บรักษาและจัดระเบียบหนังสือให้ค้นเจอง่าย
          โดยยังเคารพสิทธิ์ของผู้แต่งและสำนักพิมพ์
          รายการทั้งหมดเปิดให้ค้นและดูรายละเอียดได้อย่างอิสระ ไม่ต้องสมัครสมาชิก
        </p>
      </header>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>จะเริ่มอ่านจากไหนดี</h2>
        <p className={styles.body}>
          เพราะหนังสือในคลังมีหลายแนวมาก การไล่ดูตั้งแต่เล่มแรกจึงไม่ใช่วิธีที่ดีนัก
          แนะนำให้เลือก &ldquo;ประตู&rdquo; ที่ตรงกับสิ่งที่คุณรู้อยู่แล้ว แล้วค่อยขยับจากตรงนั้น
        </p>

        <ol className={styles.ways}>
          {WAYS.map((way) => (
            <li key={way.title} className={styles.way}>
              <h3 className={styles.wayTitle}>{way.title}</h3>
              <p className={styles.wayBody}>{way.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>เจอเล่มที่ชอบแล้วขยับต่อได้</h2>
        <p className={styles.body}>
          ในหน้าของหนังสือแต่ละเล่มจะบอกหมวดหมู่ ประเภท ภาษา ผู้แต่ง และสำนักพิมพ์ไว้
          กดที่ค่าใดก็ได้เพื่อดูเล่มอื่นที่มีค่านั้นเหมือนกัน
          เท่ากับว่าทุกเล่มเป็นจุดเริ่มต้นของแนวถัดไปได้เอง และถ้าเข้าสู่ระบบไว้
          ก็กดบันทึกเก็บเล่มที่สนใจไว้อ่านทีหลังได้
        </p>
      </section>

      <nav className={styles.next} aria-label="ไปต่อ">
        <Link href="/" className={styles.nextLink}>
          <span className="tlink">ดูคลังหนังสือ</span>
        </Link>
        <Link href="/sources" className={styles.nextLink}>
          <span className="tlink">แหล่งหนังสืออื่นๆ</span>
        </Link>
      </nav>
    </div>
  );
}
