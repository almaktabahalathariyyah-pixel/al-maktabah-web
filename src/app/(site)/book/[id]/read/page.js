'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import styles from './page.module.css';

export default function PdfReaderPage({ params }) {
  const { id } = params;
  const [loading, setLoading] = useState(true);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href={`/book/${id}`} className={styles.backBtn}>
          <ArrowLeft size={18} />
          <span>กลับไปหน้าหนังสือ</span>
        </Link>
        <div className={styles.title}>PDF Reader</div>
      </header>
      
      <main className={styles.main}>
        {loading && (
          <div className={styles.loader}>
            <Loader2 className={styles.spinner} size={48} />
            <p>กำลังโหลดหนังสือ กรุณารอสักครู่...</p>
            <span className={styles.subtext}>อาจใช้เวลาสักครู่หากไฟล์มีขนาดใหญ่</span>
          </div>
        )}
        <iframe
          src={`/api/pdf/${id}`}
          className={styles.iframe}
          onLoad={() => setLoading(false)}
          title="PDF Viewer"
        />
      </main>
    </div>
  );
}
