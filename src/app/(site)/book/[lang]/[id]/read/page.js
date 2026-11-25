'use client';

import { use, useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, ExternalLink, Bookmark, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getReadingProgress, saveReadingProgress } from '@/lib/readingProgress';
import styles from './page.module.css';

export default function PdfReaderPage({ params }) {
  const { lang, id } = use(params);
  const { user, loading: authLoading } = useAuth();

  const [frameLoading, setFrameLoading] = useState(true);
  const [token, setToken] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [startPage, setStartPage] = useState(() => getReadingProgress(id)?.page || 1);
  const [pageInput, setPageInput] = useState(() => {
    const p = getReadingProgress(id)?.page;
    return p ? String(p) : '';
  });
  const [bookmarkSaved, setBookmarkSaved] = useState(false);

  // Being signed out is not a failure to report, it is a fact about the
  // session — so it is derived here rather than written into state by an
  // effect. Waiting on the session is not the same as being signed out
  // either: the old check treated both as an auth failure and flashed an
  // error banner while the session was still settling.
  const error = authLoading
    ? ''
    : !user
      ? 'กรุณาเข้าสู่ระบบก่อนเปิดอ่านหนังสือ'
      : tokenError;

  // A different reader needs a different token, and must not keep reading on
  // the last one. Cleared during render so the frame cannot be handed a token
  // that is no longer whose it was.
  const [tokenFor, setTokenFor] = useState(null);
  if (user !== tokenFor) {
    setTokenFor(user);
    setToken('');
    setTokenError('');
    setFrameLoading(true);
  }

  useEffect(() => {
    if (authLoading || !user) return;
    let alive = true;

    user
      .getIdToken(true)
      .then((t) => {
        if (alive) setToken(t);
      })
      .catch((e) => {
        console.error('Error fetching token', e);
        if (alive) setTokenError('ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาเข้าสู่ระบบใหม่');
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

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = Math.max(1, Math.floor(Number(pageInput)));
            if (!Number.isFinite(n) || n < 1) return;
            saveReadingProgress(id, { page: n });
            setStartPage(n);
            setBookmarkSaved(true);
            setTimeout(() => setBookmarkSaved(false), 1800);
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          <Bookmark size={14} style={{ opacity: 0.75 }} />
          <input
            type="number"
            min={1}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            placeholder="คั่นหน้า…"
            aria-label="บันทึกเลขหน้าที่อ่านค้างไว้"
            style={{
              width: '5.2rem',
              padding: '0.25rem 0.45rem',
              fontSize: '0.82rem',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.22)',
              background: 'rgba(255,255,255,0.08)',
              color: 'inherit',
              textAlign: 'center',
            }}
          />
          <button
            type="submit"
            className={styles.backBtn}
            style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem', cursor: 'pointer', background: 'none' }}
          >
            {bookmarkSaved ? <Check size={14} /> : 'บันทึก'}
          </button>
        </form>

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
                key={startPage}
                src={`/api/pdf/${id}?token=${token}${startPage > 1 ? `#page=${startPage}` : ''}`}
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
