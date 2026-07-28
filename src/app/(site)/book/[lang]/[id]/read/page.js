'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, ExternalLink } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import styles from './page.module.css';

export default function PdfReaderPage({ params }) {
  const { lang, id } = use(params);
  const { user, loading: authLoading } = useAuth();

  const [frameLoading, setFrameLoading] = useState(true);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    // Waiting on the session is not the same as being signed out — the old
    // check treated both as an auth failure and flashed an error banner.
    if (authLoading) return;

    if (!user) {
      setError('กรุณาเข้าสู่ระบบก่อนเปิดอ่านหนังสือ');
      return;
    }

    let alive = true;
    setError('');

    user
      .getIdToken(true)
      .then((t) => {
        if (alive) setToken(t);
      })
      .catch((e) => {
        console.error('Error fetching token', e);
        if (alive) setError('ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่');
      });

    return () => {
      alive = false;
    };
  }, [user, authLoading]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link href={`/book/${lang}/${id}`} className={styles.backBtn}>
          <ArrowLeft size={18} />
          <span>กลับไปหน้าหนังสือ</span>
        </Link>

        <div className={styles.title}>อ่านหนังสือ</div>

        {token ? (
          <a
            className={styles.backBtn}
            href={`/api/pdf/${id}?token=${token}&action=download`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={16} />
            <span className={styles.hideNarrow}>เปิดในแท็บใหม่</span>
          </a>
        ) : (
          <span aria-hidden />
        )}
      </header>

      <main className={styles.main}>
        {error ? (
          <div className={styles.loader}>
            <p className={styles.errorText}>{error}</p>
            <Link href="/login" className="btn btn-solid">เข้าสู่ระบบ</Link>
          </div>
        ) : (
          <>
            {(!token || frameLoading) && (
              <div className={styles.loader}>
                <Loader2 className={styles.spinner} size={44} />
                <p>{token ? 'กำลังเปิดหนังสือ…' : 'กำลังตรวจสอบสิทธิ์…'}</p>
                {token && (
                  <span className={styles.subtext}>ไฟล์ขนาดใหญ่อาจใช้เวลาสักครู่</span>
                )}
              </div>
            )}

            {token && (
              <iframe
                src={`/api/pdf/${id}?token=${token}`}
                className={styles.iframe}
                onLoad={() => setFrameLoading(false)}
                title="เครื่องอ่าน PDF"
                allow="fullscreen"
              />
            )}

            {/* The API answers with an explanatory page of its own when every
                copy is out of reach, so the frame is never simply blank. */}
          </>
        )}
      </main>
    </div>
  );
}
