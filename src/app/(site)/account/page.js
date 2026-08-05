'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { LogOut, MessageCircle, Send, Globe, Clock, CheckCircle, AlertTriangle, HelpCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { db } from '@/lib/firebase';
import { VERIFY_CHANNELS } from '@/lib/verifyChannels';
import styles from './page.module.css';

const toMillis = (ts) => ts?.toMillis?.() ?? 0;

export default function AccountPage() {
  const { user, profile, approved, isAdmin, loading, logout } = useAuth();
  const { toast } = useToast();
  const [contactChannels, setContactChannels] = useState([]);
  const [social, setSocial] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  // Mirrors what was just saved, so the card switches to "รออนุมัติ" without
  // waiting for the profile to be re-read.
  const [justSent, setJustSent] = useState(false);

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const snap = await getDoc(doc(db, 'config', 'siteSettings'));
        if (snap.exists()) {
          const data = snap.data();
          if (data.contactChannels && Array.isArray(data.contactChannels)) {
            setContactChannels(data.contactChannels);
          }
        }
      } catch (err) {
        console.error('Error fetching contact channels', err);
      }
    };
    fetchChannels();
  }, []);

  // Start the form from whatever was sent last time, so a reader editing a
  // request does not have to retype it.
  useEffect(() => {
    if (!profile) return;
    setSocial(profile.social || '');
    setNote(profile.requestNote || '');
  }, [profile]);

  const submitRequest = async (e) => {
    e.preventDefault();
    if (!social.trim() && !note.trim()) {
      toast.error('กรุณากรอกอย่างน้อยหนึ่งช่อง เพื่อให้ผู้ดูแลรู้ว่าคุณเป็นใคร');
      return;
    }

    setSending(true);
    try {
      // These four fields, and only these four, are what the security rule
      // lets a reader write about their own access — see firestore.rules.
      await updateDoc(doc(db, 'users', user.uid), {
        social: social.trim(),
        requestNote: note.trim(),
        accessStatus: 'pending',
        requestedAt: new Date(),
      });
      setJustSent(true);
      toast.success('ส่งคำขอแล้ว รอผู้ดูแลตรวจสอบ');
    } catch (err) {
      console.error('Access request failed:', err);
      toast.error('ส่งคำขอไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSending(false);
    }
  };

  // An unanswered ask: the admin's request is newer than the last time this
  // reader submitted anything. Resubmitting (which already bumps requestedAt)
  // is what clears it — no separate "seen" field needed.
  const verifyPending =
    profile?.verifyRequest && toMillis(profile.verifyRequest.requestedAt) > toMillis(profile?.requestedAt);

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

        {/* Access to the restricted shelf: where it stands, and how to ask. */}
        <section className={styles.card}>
          <h2 className={styles.sectionTitle}>สิทธิ์อ่านหนังสือสงวนสิทธิ์</h2>

          {verifyPending && (
            <div className={styles.verifyBanner}>
              <p className={`${styles.statusLine} ${styles.statusNo}`}>
                <HelpCircle size={17} />
                <span>ผู้ดูแลขอข้อมูลเพิ่มเติมเพื่อยืนยันตัวตนก่อนอนุมัติ</span>
              </p>
              <ul className={styles.verifyList}>
                {VERIFY_CHANNELS.filter((c) => profile.verifyRequest.channels.includes(c.key)).map(
                  (c) => <li key={c.key}>{c.label}</li>
                )}
              </ul>
              {profile.verifyRequest.note && (
                <p className={styles.verifyNote}>“{profile.verifyRequest.note}”</p>
              )}
              <p className={styles.statusHelp}>
                กรอกข้อมูลด้านล่างให้ครบตามที่ขอ แล้วกดส่งอีกครั้ง
              </p>
            </div>
          )}

          {approved || isAdmin ? (
            <p className={`${styles.statusLine} ${styles.statusOk}`}>
              <CheckCircle size={17} />
              <span>
                {isAdmin
                  ? 'คุณเป็นผู้ดูแลระบบ เข้าถึงได้ทุกเล่ม'
                  : 'ได้รับอนุมัติแล้ว เปิดอ่านได้ทุกเล่ม'}
              </span>
            </p>
          ) : justSent || profile?.accessStatus === 'pending' ? (
            <>
              <p className={`${styles.statusLine} ${styles.statusWait}`}>
                <Clock size={17} />
                <span>ส่งคำขอแล้ว รอผู้ดูแลตรวจสอบ</span>
              </p>
              <p className={styles.statusHelp}>
                เมื่อได้รับอนุมัติ หนังสือสงวนสิทธิ์จะเปิดอ่านได้ทันทีโดยไม่ต้องทำอะไรเพิ่ม
                หากต้องการแก้ไขข้อมูล ส่งใหม่ได้จากด้านล่าง
              </p>
            </>
          ) : profile?.accessStatus === 'rejected' ? (
            <p className={`${styles.statusLine} ${styles.statusNo}`}>
              <AlertTriangle size={17} />
              <span>คำขอก่อนหน้านี้ไม่ได้รับอนุมัติ — ส่งใหม่พร้อมข้อมูลเพิ่มเติมได้</span>
            </p>
          ) : (
            <p className={styles.statusHelp}>
              หนังสือบางเล่มเปิดให้เฉพาะสมาชิกที่ได้รับอนุมัติ
              กรอกข้อมูลด้านล่างเพื่อให้ผู้ดูแลรู้ว่าคุณเป็นใคร แล้วกดส่งคำขอ
            </p>
          )}

          {!approved && !isAdmin && (
            <form className={styles.requestForm} onSubmit={submitRequest}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>ลิงก์โซเชียลหรือช่องทางติดต่อ</span>
                <input
                  type="text"
                  className={styles.input}
                  value={social}
                  onChange={(e) => setSocial(e.target.value)}
                  placeholder="เช่น facebook.com/ชื่อคุณ หรือ LINE ID"
                  maxLength={200}
                />
              </label>

              <label className={styles.field}>
                <span className={styles.fieldLabel}>แนะนำตัวสั้นๆ</span>
                <textarea
                  className={styles.textarea}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="เช่น เรียนอยู่ที่ไหน รู้จักคลังนี้จากใคร ต้องการอ่านเรื่องอะไร"
                  rows={3}
                  maxLength={500}
                />
                <span className={styles.counter}>{note.length}/500</span>
              </label>

              <button type="submit" className="btn btn-solid" disabled={sending}>
                {sending
                  ? 'กำลังส่ง…'
                  : justSent || profile?.accessStatus === 'pending'
                    ? 'ส่งข้อมูลอีกครั้ง'
                    : 'ส่งคำขอสิทธิ์'}
              </button>
            </form>
          )}
        </section>

        {contactChannels.length > 0 && (
          <section className={styles.card}>
            <h2 className={styles.sectionTitle}>ช่องทางติดต่อเรา</h2>
            <div className={styles.channels}>
              {contactChannels.map((c, i) => {
                let Icon = Globe;
                const link = c.link?.toLowerCase() || '';
                if (link.includes('line.me')) Icon = MessageCircle;
                else if (link.includes('t.me')) Icon = Send;
                
                return (
                  <a key={i} href={c.link} target="_blank" rel="noopener noreferrer" className={styles.channel}>
                    <Icon size={18} />
                    <span>{c.label || 'ติดต่อเรา'}</span>
                  </a>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
