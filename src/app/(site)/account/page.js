'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { doc, getDoc } from 'firebase/firestore';
import { LogOut, MessageCircle, Send, Globe } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import styles from './page.module.css';

export default function AccountPage() {
  const { user, loading, logout } = useAuth();
  const [contactChannels, setContactChannels] = useState([]);

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
