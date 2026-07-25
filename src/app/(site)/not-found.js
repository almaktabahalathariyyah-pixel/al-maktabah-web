import Link from 'next/link';
import styles from './status.module.css';

export default function NotFound() {
  return (
    <div className="container">
      <div className={`${styles.wrap} rise`}>
        <p className={styles.code}>404</p>
        <h1 className={styles.title}>ไม่พบหน้าที่คุณกำลังหา</h1>
        <p className={styles.body}>
          หน้านี้อาจถูกย้าย หรือหนังสือเล่มนี้ถูกนำออกจากคลังแล้ว
        </p>
        <div className={styles.acts}>
          <Link href="/" className="btn btn-solid">กลับไปคลังหนังสือ</Link>
        </div>
      </div>
    </div>
  );
}
