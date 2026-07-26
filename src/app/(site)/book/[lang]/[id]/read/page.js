'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import styles from './page.module.css';

export default function PdfReaderPage({ params }) {
  const { lang, id } = use(params);
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState('');
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchToken = async () => {
      if (user) {
        try {
          const t = await user.getIdToken(true);
          if (isMounted) setToken(t);
        } catch (e) {
          console.error('Error fetching token', e);
          if (isMounted) setAuthError(true);
        }
      } else {
        if (isMounted) setAuthError(true);
      }
    };
    fetchToken();
    return () => { isMounted = false; };
  }, [user]);

  if (authError) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href={`/book/${lang}/${id}`} className={styles.backBtn}>
            <ArrowLeft size={18} />
            <span>กลับไปหน้าหนังสือ</span>
          </Link>
          <div className={styles.title}>PDF Reader</div>
        </header>
        <main className={styles.main}>
          <div className={styles.loader}>
            <p style={{ color: '#ef4444' }}>เกิดข้อผิดพลาดในการตรวจสอบสิทธิ์ (กรุณาล็อกอินใหม่)</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href={`/book/${lang}/${id}`} className={styles.backBtn}>
          <ArrowLeft size={18} />
          <span>กลับไปหน้าหนังสือ</span>
        </Link>
        <div className={styles.title}>PDF Reader</div>
      </header>
      
      <main className={styles.main}>
        {(!token || loading) && (
          <div className={styles.loader}>
            <Loader2 className={styles.spinner} size={48} />
            <p>{!token ? 'กำลังตรวจสอบสิทธิ์ความปลอดภัย...' : 'กำลังโหลดหนังสือ กรุณารอสักครู่...'}</p>
            {token && <span className={styles.subtext}>อาจใช้เวลาสักครู่หากไฟล์มีขนาดใหญ่</span>}
          </div>
        )}
        
        {token && (
          <iframe
            src={`/api/pdf/${id}?token=${token}`}
            className={styles.iframe}
            onLoad={() => setLoading(false)}
            title="PDF Viewer"
          />
        )}
      </main>
    </div>
  );
}
