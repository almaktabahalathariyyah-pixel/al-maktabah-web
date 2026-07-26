'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { Check, X, ExternalLink, RotateCcw } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useToast } from '@/context/ToastContext';
import styles from './page.module.css';

const TABS = [
  { key: 'pending', label: 'รอตรวจสอบ' },
  { key: 'approved', label: 'อนุมัติแล้ว' },
  { key: 'rejected', label: 'ปฏิเสธ' },
];

export default function ApprovalsPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pending');
  const [busy, setBusy] = useState(null);
  const { toast } = useToast();

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const rows = [];
        snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setUsers(rows);
      } catch (error) {
        console.error('Error loading users:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const decide = async (userId, decision) => {
    setBusy(userId);
    try {
      await updateDoc(doc(db, 'users', userId), {
        approved: decision === 'approved',
        accessStatus: decision,
        decidedAt: new Date(),
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId
            ? { ...u, approved: decision === 'approved', accessStatus: decision }
            : u
        )
      );
      toast.success('อัปเดตสถานะสำเร็จ');
    } catch (error) {
      console.error(error);
      toast.error('อัปเดตสถานะไม่สำเร็จ');
    } finally {
      setBusy(null);
    }
  };

  const statusOf = (u) => u.accessStatus || (u.approved ? 'approved' : 'none');
  const rows = users.filter((u) => statusOf(u) === tab);
  const countOf = (key) => users.filter((u) => statusOf(u) === key).length;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>อนุมัติสมาชิก</h1>
        <p className={styles.sub}>
          จัดการสิทธิ์การเข้าถึงของสมาชิก
        </p>
      </header>

      <nav className={styles.tabs}>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`${styles.tab} ${tab === t.key ? styles.tabOn : ''}`}
          >
            {t.label} <sup className={styles.sup}>{countOf(t.key)}</sup>
          </button>
        ))}
      </nav>

      {loading ? (
        <p className={styles.state}>กำลังโหลดรายชื่อ…</p>
      ) : rows.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyLead}>
            {tab === 'pending' ? 'ไม่มีคำขอที่รอตรวจสอบ' : 'ยังไม่มีรายการในหมวดนี้'}
          </p>
        </div>
      ) : (
        <ul className={styles.rows}>
          {rows.map((u) => (
            <li key={u.id} className={styles.row}>
              <div className={styles.who}>
                {u.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.photoURL} alt="" className={styles.avatar} />
                ) : (
                  <span className={styles.avatarFallback}>
                    {(u.displayName || u.email || '?').charAt(0).toUpperCase()}
                  </span>
                )}
                <div className={styles.whoText}>
                  <span className={styles.name}>{u.displayName || 'ไม่ระบุชื่อ'}</span>
                  <span className={styles.email}>{u.email}</span>
                </div>
              </div>

              {u.social ? (
                <a
                  className={styles.social}
                  href={u.social.startsWith('http') ? u.social : `https://${u.social}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className={styles.socialText}>{u.social}</span>
                  <ExternalLink size={13} />
                </a>
              ) : (
                <span className={styles.noSocial}>ไม่ได้แนบลิงก์</span>
              )}

              <div className={styles.acts}>
                {tab !== 'approved' && (
                  <button
                    className={`${styles.act} ${styles.approve}`}
                    onClick={() => decide(u.id, 'approved')}
                    disabled={busy === u.id}
                    title="อนุมัติ"
                  >
                    <Check size={16} />
                  </button>
                )}
                {tab === 'pending' && (
                  <button
                    className={`${styles.act} ${styles.reject}`}
                    onClick={() => decide(u.id, 'rejected')}
                    disabled={busy === u.id}
                    title="ปฏิเสธ"
                  >
                    <X size={16} />
                  </button>
                )}
                {tab !== 'pending' && (
                  <button
                    className={styles.act}
                    onClick={() => decide(u.id, 'pending')}
                    disabled={busy === u.id}
                    title="ย้ายกลับไปรอตรวจสอบ"
                  >
                    <RotateCcw size={15} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
