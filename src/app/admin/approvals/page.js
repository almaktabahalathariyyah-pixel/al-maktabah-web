'use client';

import { useEffect, useState } from 'react';
import {
  collection, getDocs, doc, updateDoc, query, where, documentId,
} from 'firebase/firestore';
import { Check, X, ExternalLink, RotateCcw, HelpCircle, History, Send } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useToast } from '@/context/ToastContext';
import { VERIFY_CHANNELS } from '@/lib/verifyChannels';
import InviteManager from '@/components/InviteManager';
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

  // Which row's "ask for more proof" panel is open, and what's checked in it.
  const [verifyOpenFor, setVerifyOpenFor] = useState(null);
  const [verifySelected, setVerifySelected] = useState([]);
  const [verifyNote, setVerifyNote] = useState('');
  const [verifySending, setVerifySending] = useState(false);

  // Download history per user, fetched lazily and kept once fetched — a
  // Firestore read this desk otherwise never needs, so it should only happen
  // for a row the admin actually opens.
  const [downloadsOpenFor, setDownloadsOpenFor] = useState(null);
  const [downloadsByUser, setDownloadsByUser] = useState({});

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

  const openVerify = (u) => {
    if (verifyOpenFor === u.id) {
      setVerifyOpenFor(null);
      return;
    }
    setVerifyOpenFor(u.id);
    setVerifySelected(u.verifyRequest?.channels || []);
    setVerifyNote(u.verifyRequest?.note || '');
  };

  const toggleChannel = (key) =>
    setVerifySelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );

  const sendVerifyRequest = async (userId) => {
    if (verifySelected.length === 0) {
      toast.error('เลือกอย่างน้อยหนึ่งช่องทางที่จะขอ');
      return;
    }
    setVerifySending(true);
    try {
      const verifyRequest = {
        channels: verifySelected,
        note: verifyNote.trim(),
        requestedAt: new Date(),
      };
      await updateDoc(doc(db, 'users', userId), { verifyRequest });
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, verifyRequest } : u)));
      toast.success('ส่งคำขอให้ยืนยันตัวตนแล้ว');
      setVerifyOpenFor(null);
    } catch (error) {
      console.error('Verify request failed:', error);
      toast.error('ส่งคำขอไม่สำเร็จ');
    } finally {
      setVerifySending(false);
    }
  };

  const openDownloads = async (uid) => {
    if (downloadsOpenFor === uid) {
      setDownloadsOpenFor(null);
      return;
    }
    setDownloadsOpenFor(uid);
    if (downloadsByUser[uid]) return; // already fetched once — no repeat reads

    setDownloadsByUser((prev) => ({ ...prev, [uid]: { loading: true, items: [] } }));
    try {
      const snap = await getDocs(query(collection(db, 'downloads'), where('userId', '==', uid)));
      const events = [];
      snap.forEach((d) => events.push({ id: d.id, ...d.data() }));
      events.sort((a, b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0));

      // One batched lookup for titles instead of one read per event.
      const bookIds = [...new Set(events.map((e) => e.bookId))].slice(0, 30);
      const titles = {};
      if (bookIds.length > 0) {
        const bookSnap = await getDocs(
          query(collection(db, 'books'), where(documentId(), 'in', bookIds))
        );
        bookSnap.forEach((d) => { titles[d.id] = d.data().title; });
      }

      const items = events.map((e) => ({ ...e, title: titles[e.bookId] || e.bookId }));
      setDownloadsByUser((prev) => ({ ...prev, [uid]: { loading: false, items } }));
    } catch (error) {
      console.error('Error loading download history:', error);
      setDownloadsByUser((prev) => ({ ...prev, [uid]: { loading: false, items: [], error: true } }));
    }
  };

  /**
   * Which bucket a member belongs in.
   *
   * A fresh sign-in is written with accessStatus 'none' (see AuthContext), and
   * nothing in the app ever moves anyone to 'pending' — there is no
   * "request access" step for a reader to take. So the three tabs used to
   * match a status no account could hold: every real member fell through the
   * gaps and this desk sat empty however many people had signed up.
   *
   * Undecided is undecided: 'none' and 'pending' are the same thing to the
   * owner, so both land in รอตรวจสอบ. Admins are filtered out because they
   * already have full access and asking the owner to approve themselves reads
   * as a bug.
   */
  const statusOf = (u) => {
    if (u.role === 'admin' || u.approved === true) return 'approved';
    if (u.accessStatus === 'rejected') return 'rejected';
    return 'pending';
  };
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
            <li key={u.id} className={styles.rowWrap}>
            <div className={styles.row}>
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

              <div className={styles.said}>
                {/* Only linkify something that looks like a URL — a LINE ID is
                    a perfectly good answer here and must not become a broken
                    https:// link. */}
                {u.social ? (
                  /^(https?:\/\/|www\.)|\.[a-z]{2,}(\/|$)/i.test(u.social) ? (
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
                    <span className={styles.socialText}>{u.social}</span>
                  )
                ) : (
                  <span className={styles.noSocial}>ไม่ได้แนบลิงก์</span>
                )}

                {u.requestNote && <p className={styles.note}>{u.requestNote}</p>}
              </div>

              <div className={styles.acts}>
                <button
                  className={`${styles.act} ${u.verifyRequest ? styles.actOn : ''}`}
                  onClick={() => openVerify(u)}
                  title="ขอข้อมูลยืนยันตัวตนเพิ่ม"
                  aria-label="ขอข้อมูลยืนยันตัวตนเพิ่ม"
                >
                  <HelpCircle size={16} />
                </button>
                <button
                  className={styles.act}
                  onClick={() => openDownloads(u.id)}
                  title="ประวัติการโหลด"
                  aria-label="ประวัติการโหลด"
                >
                  <History size={16} />
                </button>
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
            </div>

            {verifyOpenFor === u.id && (
              <div className={styles.panel}>
                <p className={styles.panelTitle}>เลือกช่องทางที่ขอให้ยืนยันตัวตน</p>
                <div className={styles.checklist}>
                  {VERIFY_CHANNELS.map((c) => (
                    <label key={c.key} className={styles.checkItem}>
                      <input
                        type="checkbox"
                        checked={verifySelected.includes(c.key)}
                        onChange={() => toggleChannel(c.key)}
                      />
                      {c.label}
                    </label>
                  ))}
                </div>
                <textarea
                  className={styles.panelNote}
                  placeholder="เหตุผลสั้นๆ ว่าทำไมต้องขอเพิ่ม (สมาชิกจะเห็นข้อความนี้)"
                  value={verifyNote}
                  onChange={(e) => setVerifyNote(e.target.value)}
                  rows={2}
                  maxLength={300}
                />
                <button
                  className="btn btn-solid"
                  onClick={() => sendVerifyRequest(u.id)}
                  disabled={verifySending}
                >
                  <Send size={14} /> {verifySending ? 'กำลังส่ง…' : 'ส่งคำขอ'}
                </button>
              </div>
            )}

            {downloadsOpenFor === u.id && (
              <div className={styles.panel}>
                <p className={styles.panelTitle}>ประวัติการโหลดของ {u.displayName || u.email}</p>
                {downloadsByUser[u.id]?.loading ? (
                  <p className={styles.panelHint}>กำลังโหลด…</p>
                ) : downloadsByUser[u.id]?.error ? (
                  <p className={styles.panelHint}>โหลดประวัติไม่สำเร็จ</p>
                ) : downloadsByUser[u.id]?.items.length === 0 ? (
                  <p className={styles.panelHint}>ยังไม่มีประวัติการเปิดหรือโหลดหนังสือ</p>
                ) : (
                  <ul className={styles.downloadList}>
                    {downloadsByUser[u.id].items.map((item) => (
                      <li key={item.id} className={styles.downloadItem}>
                        <span className={styles.downloadTitle}>{item.title}</span>
                        <span className={styles.downloadMeta}>
                          {item.type === 'download' ? 'ดาวน์โหลด' : 'เปิดอ่าน'}
                          {item.timestamp?.toDate
                            ? ` · ${item.timestamp.toDate().toLocaleDateString('th-TH')}`
                            : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            </li>
          ))}
        </ul>
      )}

      <InviteManager />
    </div>
  );
}
