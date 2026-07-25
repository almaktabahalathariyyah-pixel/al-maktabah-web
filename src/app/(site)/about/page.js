import Link from 'next/link';
import { Search, ShieldCheck, Send } from 'lucide-react';
import styles from './page.module.css';

export const metadata = {
  title: 'เกี่ยวกับคลัง · Al-Maktabah Al-Athariyyah',
  description: 'คลังหนังสืออิสลาม รวบรวมตำราคลาสสิกตามแนวทางสลัฟ',
};

const STEPS = [
  {
    icon: Search,
    title: 'ค้นหาได้ทุกเล่ม',
    body: 'รายการหนังสือทั้งหมดเปิดให้ค้นและดูรายละเอียดได้อย่างอิสระ ไม่ต้องสมัครสมาชิก',
  },
  {
    icon: ShieldCheck,
    title: 'บางเล่มต้องขอสิทธิ์',
    body: 'หนังสือที่ยังติดลิขสิทธิ์จะเปิดให้เฉพาะผู้ที่ผู้ดูแลยืนยันตัวตนแล้ว เพื่อไม่ให้เผยแพร่เป็นสาธารณะ',
  },
  {
    icon: Send,
    title: 'ไฟล์ส่งผ่าน Telegram',
    body: 'ตัวไฟล์เก็บอยู่ในช่อง Telegram ส่วนตัว การดาวน์โหลดจะพาไปที่ข้อความไฟล์นั้นโดยตรง ไม่มีการอัปโหลดซ้ำเป็นลิงก์สาธารณะ',
  },
];

export default function AboutPage() {
  return (
    <div className="container">
      <header className={`${styles.header} rise`}>
        <p className="eyebrow">เกี่ยวกับคลัง</p>
        <h1 className={styles.title}>
          รวบรวมตำราคลาสสิกตามแนวทาง <em>สลัฟ</em> ไว้ในที่เดียว
        </h1>
        <p className="lede">
          คลังนี้ตั้งใจเก็บรักษาและจัดระเบียบหนังสือให้ค้นเจอง่าย
          โดยยังเคารพสิทธิ์ของผู้แต่งและสำนักพิมพ์
        </p>
      </header>

      <section className={styles.steps}>
        {STEPS.map((step) => (
          <article key={step.title} className={styles.step}>
            <span className={styles.stepIcon}><step.icon size={18} /></span>
            <h2 className={styles.stepTitle}>{step.title}</h2>
            <p className={styles.stepBody}>{step.body}</p>
          </article>
        ))}
      </section>

      <section className={styles.cta}>
        <div>
          <h2 className={styles.ctaTitle}>อยากเข้าถึงหนังสือที่สงวนสิทธิ์?</h2>
          <p className={styles.ctaBody}>
            เข้าสู่ระบบแล้วส่งคำขอพร้อมลิงก์โปรไฟล์ เพื่อให้ผู้ดูแลยืนยันตัวตน
          </p>
        </div>
        <div className={styles.ctaActs}>
          <Link href="/account" className="btn btn-solid">ขอสิทธิ์เข้าถึง</Link>
          <Link href="/" className="btn">ดูคลังหนังสือ</Link>
        </div>
      </section>
    </div>
  );
}
