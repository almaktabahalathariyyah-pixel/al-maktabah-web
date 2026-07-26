'use client';

import { use, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import Link from 'next/link';
import { LogIn, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import styles from './page.module.css';

export default function JoinPage({ params }) {
  const { code } = use(params);
  const { user, profile, loginWithGoogle, loading } = useAuth();
  const [status, setStatus] = useState('loading'); // loading, login, success, already, invalid, error
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (loading) return;

    if (!user) {
      setStatus('login');
      return;
    }

    if (profile?.approved) {
      setStatus('already');
      return;
    }

    const checkCode = async () => {
      try {
        const inviteDoc = await getDoc(doc(db, 'config', 'inviteLinks'));
        if (!inviteDoc.exists()) {
          setStatus('invalid');
          return;
        }

        const data = inviteDoc.data();
        const links = data.links || [];
        const linkIndex = links.findIndex(l => l.code === code);

        if (linkIndex === -1) {
          setStatus('invalid');
          return;
        }

        const link = links[linkIndex];

        // Validate active, expiresAt, maxUses
        if (!link.active) {
          setStatus('invalid');
          return;
        }

        if (link.expiresAt) {
          const expiresAtDate = link.expiresAt.toDate ? link.expiresAt.toDate() : new Date(link.expiresAt);
          if (new Date() > expiresAtDate) {
            setStatus('invalid');
            return;
          }
        }

        if (link.maxUses && link.usedCount >= link.maxUses) {
          setStatus('invalid');
          return;
        }

        // Apply approval
        await updateDoc(doc(db, 'users', user.uid), {
          approved: true,
          accessStatus: 'approved'
        });

        // Increment usedCount
        const newLinks = [...links];
        newLinks[linkIndex] = {
          ...link,
          usedCount: (link.usedCount || 0) + 1
        };
        await updateDoc(doc(db, 'config', 'inviteLinks'), { links: newLinks });

        setStatus('success');

      } catch (err) {
        console.error(err);
        setErrorMessage(err.message);
        setStatus('error');
      }
    };

    checkCode();

  }, [user, profile, loading, code]);

  if (status === 'loading') {
    return (
      <div className={`container ${styles.container}`}>
        <div className={styles.card}>
          <div className={styles.loading}>กำลังตรวจสอบข้อมูล...</div>
        </div>
      </div>
    );
  }

  if (status === 'login') {
    return (
      <div className={`container ${styles.container}`}>
        <div className={styles.card}>
          <div className={styles.iconWrapper}>
            <LogIn size={48} className={styles.icon} />
          </div>
          <h1 className={styles.title}>เข้าสู่ระบบเพื่อดำเนินการต่อ</h1>
          <p className={styles.desc}>คุณต้องเข้าสู่ระบบก่อนจึงจะสามารถใช้ลิงก์คำเชิญนี้ได้</p>
          <button onClick={loginWithGoogle} className={`btn btn-solid btn-block ${styles.btn}`}>
            เข้าสู่ระบบด้วย Google
          </button>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className={`container ${styles.container}`}>
        <div className={styles.card}>
          <div className={styles.iconWrapperSuccess}>
            <CheckCircle size={48} className={styles.iconSuccess} />
          </div>
          <h1 className={styles.title}>ยินดีต้อนรับ</h1>
          <p className={styles.desc}>คุณได้รับสิทธิ์เข้าถึงคลังหนังสือเรียบร้อยแล้ว</p>
          <Link href="/" className={`btn btn-solid btn-block ${styles.btn}`}>
            ไปที่คลังหนังสือ <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'already') {
    return (
      <div className={`container ${styles.container}`}>
        <div className={styles.card}>
          <div className={styles.iconWrapperSuccess}>
            <CheckCircle size={48} className={styles.iconSuccess} />
          </div>
          <h1 className={styles.title}>คุณมีสิทธิ์อยู่แล้ว</h1>
          <p className={styles.desc}>คุณเข้าถึงคลังหนังสือได้อยู่แล้ว ไม่จำเป็นต้องใช้ลิงก์นี้</p>
          <Link href="/" className={`btn btn-solid btn-block ${styles.btn}`}>
            ไปที่คลังหนังสือ <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className={`container ${styles.container}`}>
        <div className={styles.card}>
          <div className={styles.iconWrapperError}>
            <AlertTriangle size={48} className={styles.iconError} />
          </div>
          <h1 className={styles.title}>ลิงก์ไม่ถูกต้อง</h1>
          <p className={styles.desc}>ลิงก์คำเชิญนี้ไม่ถูกต้อง หรือหมดอายุแล้ว</p>
          <Link href="/" className={`btn btn-solid btn-block ${styles.btn}`}>
            กลับไปหน้าแรก
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`container ${styles.container}`}>
      <div className={styles.card}>
        <div className={styles.iconWrapperError}>
          <AlertTriangle size={48} className={styles.iconError} />
        </div>
        <h1 className={styles.title}>เกิดข้อผิดพลาด</h1>
        <p className={styles.desc}>{errorMessage || 'เกิดข้อผิดพลาดในการตรวจสอบลิงก์'}</p>
        <Link href="/" className={`btn btn-solid btn-block ${styles.btn}`}>
          กลับไปหน้าแรก
        </Link>
      </div>
    </div>
  );
}
