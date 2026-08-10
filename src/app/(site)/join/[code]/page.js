'use client';

import { use, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import Link from 'next/link';
import { LogIn, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import styles from './page.module.css';

function Card({ tone = 'plain', icon: Icon, title, body, children }) {
  const wrapper =
    tone === 'success'
      ? styles.iconWrapperSuccess
      : tone === 'error'
        ? styles.iconWrapperError
        : styles.iconWrapper;
  const iconClass =
    tone === 'success' ? styles.iconSuccess : tone === 'error' ? styles.iconError : styles.icon;

  return (
    <div className={`container ${styles.container}`}>
      <div className={styles.card}>
        {Icon && (
          <div className={wrapper}>
            <Icon size={44} className={iconClass} />
          </div>
        )}
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.desc}>{body}</p>
        {children}
      </div>
    </div>
  );
}

/**
 * Invite redemption.
 *
 * The checks below are a courtesy to the reader — they explain WHY a link did
 * not work. The checks that actually matter live in firestore.rules, because
 * this file runs in the reader's own browser and can be edited at will.
 * A code now lives at invites/{code} precisely so a rule can read it; the old
 * design kept every code inside one array, which rules cannot inspect, so
 * nothing stopped a visitor from simply writing `approved: true` on themselves.
 */
export default function JoinPage({ params }) {
  const { code } = use(params);
  const { user, profile, loginWithGoogle, loading } = useAuth();
  // What redeeming the invite decided, once it has decided anything.
  const [outcome, setOutcome] = useState(null); // null | success | invalid | error
  const [errorMessage, setErrorMessage] = useState('');

  /**
   * Everything before the invite is redeemed is a fact about the session, not
   * state of this page's own — so it is derived rather than written by an
   * effect. The outcome wins once it exists: redeeming sets `approved` on the
   * reader's own document, so a profile that refreshed afterwards would
   * otherwise turn the "ยินดีต้อนรับ" they just earned into a flat "you were
   * already approved".
   */
  const status = outcome
    ? outcome
    : loading
      ? 'loading'
      : !user
        ? 'login'
        : profile?.approved
          ? 'already'
          : 'loading';

  useEffect(() => {
    if (loading || !user || profile?.approved) return;

    let alive = true;

    const redeem = async () => {
      try {
        const inviteRef = doc(db, 'invites', code);
        const snap = await getDoc(inviteRef);
        if (!alive) return;

        if (!snap.exists()) {
          setOutcome('invalid');
          return;
        }

        const invite = snap.data();

        if (invite.active === false) {
          setOutcome('invalid');
          return;
        }
        if (invite.expiresAt) {
          const expires = invite.expiresAt.toDate?.() ?? new Date(invite.expiresAt);
          if (new Date() > expires) {
            setOutcome('invalid');
            return;
          }
        }
        if (invite.maxUses && (invite.usedCount || 0) >= invite.maxUses) {
          setOutcome('invalid');
          return;
        }

        // `invitedBy` is not decoration: the security rule reads it back to
        // decide whether this reader may approve themselves.
        await updateDoc(doc(db, 'users', user.uid), {
          approved: true,
          accessStatus: 'approved',
          invitedBy: code,
          decidedAt: new Date(),
        });

        // Best effort — the reader is already in, so a failed counter must not
        // read as a failed invitation.
        try {
          await updateDoc(inviteRef, { usedCount: increment(1) });
        } catch (counterErr) {
          console.error('Could not bump invite usage:', counterErr);
        }

        if (alive) setOutcome('success');
      } catch (err) {
        console.error(err);
        if (!alive) return;
        if (err?.code === 'permission-denied') {
          setOutcome('invalid');
        } else {
          setErrorMessage(err.message);
          setOutcome('error');
        }
      }
    };

    redeem();
    return () => {
      alive = false;
    };
  }, [user, profile, loading, code]);

  if (status === 'loading') {
    return (
      <div className={`container ${styles.container}`}>
        <div className={styles.card}>
          <div className={styles.loading}>กำลังตรวจสอบคำเชิญ…</div>
        </div>
      </div>
    );
  }

  if (status === 'login') {
    return (
      <Card
        icon={LogIn}
        title="เข้าสู่ระบบเพื่อรับสิทธิ์"
        body="ลิงก์คำเชิญนี้ผูกกับบัญชีของคุณ จึงต้องเข้าสู่ระบบก่อน"
      >
        <button onClick={loginWithGoogle} className={`btn btn-solid btn-block ${styles.btn}`}>
          เข้าสู่ระบบด้วย Google
        </button>
      </Card>
    );
  }

  if (status === 'success') {
    return (
      <Card
        tone="success"
        icon={CheckCircle}
        title="ยินดีต้อนรับ"
        body="คุณได้รับสิทธิ์เข้าถึงคลังหนังสือเรียบร้อยแล้ว"
      >
        <Link href="/" className={`btn btn-solid btn-block ${styles.btn}`}>
          ไปที่คลังหนังสือ <ArrowRight size={18} />
        </Link>
      </Card>
    );
  }

  if (status === 'already') {
    return (
      <Card
        tone="success"
        icon={CheckCircle}
        title="คุณมีสิทธิ์อยู่แล้ว"
        body="ไม่จำเป็นต้องใช้ลิงก์นี้ เข้าอ่านได้เลย"
      >
        <Link href="/" className={`btn btn-solid btn-block ${styles.btn}`}>
          ไปที่คลังหนังสือ <ArrowRight size={18} />
        </Link>
      </Card>
    );
  }

  if (status === 'invalid') {
    return (
      <Card
        tone="error"
        icon={AlertTriangle}
        title="ลิงก์นี้ใช้ไม่ได้แล้ว"
        body="ลิงก์คำเชิญอาจหมดอายุ ถูกปิด หรือมีผู้ใช้ครบจำนวนแล้ว ลองขอลิงก์ใหม่จากผู้ดูแล"
      >
        <Link href="/account" className={`btn btn-solid btn-block ${styles.btn}`}>
          ขอสิทธิ์เข้าถึง
        </Link>
      </Card>
    );
  }

  return (
    <Card
      tone="error"
      icon={AlertTriangle}
      title="เกิดข้อผิดพลาด"
      body={errorMessage || 'ตรวจสอบลิงก์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'}
    >
      <Link href="/" className={`btn btn-solid btn-block ${styles.btn}`}>
        กลับไปหน้าแรก
      </Link>
    </Card>
  );
}
