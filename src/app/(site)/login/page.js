'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import styles from './page.module.css';

export default function LoginPage() {
  const { loginWithGoogle, user, loading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Someone already signed in has no business on this page.
  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  const handleGoogleLogin = async () => {
    setBusy(true);
    try {
      // Redirects the whole page to Google — there is nothing to do after
      // this resolves, since the browser is already leaving. Any failure
      // (network down, redirect blocked outright) still lands in catch.
      await loginWithGoogle();
    } catch (error) {
      toast.error('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      setBusy(false);
    }
  };

  /**
   * Landing back here right after Google's redirect looks identical to a
   * fresh visit — same button, same page — while the SDK spends up to several
   * seconds resolving the pending redirect before `user` is set. Without this,
   * that gap reads as "did my login not go through?" and a reader taps the
   * button again. Showing a distinct state while `loading` is true (or `user`
   * is already set and the redirect above is about to fire) removes the
   * ambiguity instead of racing it.
   */
  const resolving = loading || Boolean(user);

  return (
    <div className={styles.layout}>
      <div className={styles.panel}>
        <div className={styles.panelContent}>
          <div className={styles.brand}>Al-Maktabah Al-Athariyyah</div>
          <p className={styles.panelText}>รวบรวมตำราคลาสสิกไว้ในที่เดียว ค้นหาง่าย ดาวน์โหลดได้ทันที</p>
        </div>
      </div>
      <div className={styles.formSide}>
        <div className={`${styles.wrap} glass rise`}>
          {resolving ? (
            <>
              <header className={styles.header}>
                <p className="eyebrow">เข้าสู่ระบบ</p>
                <h1 className={styles.title}>กำลังเข้าสู่ระบบ…</h1>
                <p className={styles.sub}>
                  กำลังตรวจสอบเซสชันจาก Google อาจใช้เวลาสักครู่บนมือถือ
                </p>
              </header>
              <div className={`${styles.spinner} shimmer`} aria-hidden />
            </>
          ) : (
            <>
              <header className={styles.header}>
                <p className="eyebrow">เข้าสู่ระบบ</p>
                <h1 className={styles.title}>
                  ยินดีต้อนรับ
                </h1>
                <p className={styles.sub}>
                  เข้าสู่ระบบเพื่อบันทึกหนังสือที่ชอบและจัดการชั้นหนังสือของคุณ
                </p>
              </header>

              <button className="btn btn-block" onClick={handleGoogleLogin} disabled={busy}>
                <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                {busy ? 'กำลังเข้าสู่ระบบ…' : 'ดำเนินการต่อด้วย Google'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
