'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import styles from './status.module.css';

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="container">
      <div className={`${styles.wrap} rise`}>
        <p className={styles.code}>ขออภัย</p>
        <h1 className={styles.title}>เกิดข้อผิดพลาดบางอย่าง</h1>
        <p className={styles.body}>
          โหลดข้อมูลไม่สำเร็จ อาจเป็นเพราะการเชื่อมต่อขัดข้อง ลองใหม่อีกครั้งได้เลย
        </p>
        <div className={styles.acts}>
          <button className="btn btn-solid" onClick={reset}>ลองใหม่</button>
          <Link href="/" className="btn">กลับหน้าแรก</Link>
        </div>
      </div>
    </div>
  );
}
