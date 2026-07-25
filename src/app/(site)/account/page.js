'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, updateDoc } from 'firebase/firestore';
import { Check, Clock, ShieldCheck, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import styles from './page.module.css';

export default function AccountPage() {
  const { user, profile, approved, isAdmin, loading, logout } = useAuth();
  const [status, setStatus] = useState('none');
  const [social, setSocial] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (profile) {
      setStatus(profile.accessStatus || (profile.approved ? 'approved' : 'none'));
      setSocial(profile.social || '');
    }
  }, [profile]);

  const requestAccess = async (e) => {
    e.preventDefault();
    if (!social.trim()) {
      setNote('กรุณาใส่ลิงก์โปรไฟล์เพื่อให้ผู้ดูแลยืนยันตัวตน');
      return;
    }
    setSending(true);
    setNote('');
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        social: social.trim(),
        accessStatus: 'pending',
        requestedAt: new Date(),
      });
      setStatus('pending');
    } catch (error) {
      console.error(error);
      setNote('ส่งคำขอไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <p className={styles.loading}>กำลังโหลด…</p>;

  if (!user) {
    return (
      <div className="container">
        <div className={styles.gate}>
          <h1 className={styles.gateTitle}>ยังไม่ได้เข้าสู่ระบบ</h1>
          <p className={styles.gateBody}>
            เข้าสู่ระบบเพื่อดูสถานะบัญชีและขอสิทธิ์เข้าถึงหนังสือสงวนสิทธิ์
          </p>
          <Link href="/login" className="btn btn-solid">เข้าสู่ระบบ</Link>
        </div>
      </div>
    );
  }

  const state = isAdmin
    ? { key: 'admin', icon: ShieldCheck, label: 'ผู้ดูแลระบบ', body: 'คุณเข้าถึงหนังสือได้ทุกเล่มในคลัง' }
    : approved
      ? { key: 'ok', icon: Check, label: 'ได้รับอนุมัติแล้ว', body: 'คุณเปิดอ่านและดาวน์โหลดหนังสือสงวนสิทธิ์ได้' }
      : status === 'pending'
        ? { key: 'pending', icon: Clock, label: 'รอการอนุมัติ', body: 'ผู้ดูแลกำลังตรวจสอบคำขอของคุณ' }
        : { key: 'none', icon: Clock, label: 'ยังไม่ได้ขอสิทธิ์', body: 'ขณะนี้คุณเข้าถึงได้เฉพาะหนังสือที่เปิดสาธารณะ' };

  return (
    <div className="container">
      <header className={styles.header}>
        <p className="eyebrow">บัญชีของคุณ</p>
        <h1 className={styles.title}>โปรไฟล์</h1>
      </header>

      <div className={styles.layout}>
        <section className={styles.card}>
          <div className={styles.identity}>
            {user.photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoURL} alt="" className={styles.avatar} />
            ) : (
              <span className={styles.avatarFallback}>
                {(user.displayName || user.email || '?').charAt(0).toUpperCase()}
              </span>
            )}
            <div className={styles.identityText}>
              <span className={styles.name}>{user.displayName || 'ผู้ใช้'}</span>
              <span className={styles.email}>{user.email}</span>
            </div>
          </div>

          <button className={`btn ${styles.logout}`} onClick={logout}>
            <LogOut size={15} /> ออกจากระบบ
          </button>
        </section>

        <section className={`${styles.card} ${styles[state.key]}`}>
          <div className={styles.statusHead}>
            <span className={styles.statusIcon}><state.icon size={17} /></span>
            <div>
              <p className={styles.statusLabel}>{state.label}</p>
              <p className={styles.statusBody}>{state.body}</p>
            </div>
          </div>

          {!approved && !isAdmin && status !== 'pending' && (
            <form className={styles.form} onSubmit={requestAccess}>
              <label htmlFor="social">ลิงก์โปรไฟล์สำหรับยืนยันตัวตน</label>
              <input
                id="social"
                type="text"
                value={social}
                placeholder="facebook.com/… หรือ instagram.com/…"
                onChange={(e) => setSocial(e.target.value)}
              />
              <p className={styles.hint}>
                ผู้ดูแลใช้ลิงก์นี้ยืนยันว่าคุณเป็นใคร ก่อนปล่อยหนังสือที่สงวนสิทธิ์ให้
              </p>
              {note && <p className={styles.err}>{note}</p>}
              <button type="submit" className="btn btn-solid" disabled={sending}>
                {sending ? 'กำลังส่ง…' : 'ส่งคำขอสิทธิ์'}
              </button>
            </form>
          )}

          {status === 'pending' && !approved && (
            <p className={styles.pendingNote}>
              ส่งคำขอแล้ว โดยทั่วไปใช้เวลาไม่นาน คุณจะเห็นการเปลี่ยนแปลงที่หน้านี้
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
