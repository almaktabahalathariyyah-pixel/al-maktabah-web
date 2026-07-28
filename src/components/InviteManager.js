'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { Link2, Copy, Check, Trash2, Plus, Power } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import styles from './InviteManager.module.css';

/** Unambiguous alphabet: no O/0, no I/l/1 — these codes get read aloud. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function makeCode(length = 8) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]).join('');
}

const NEVER = 'ไม่หมดอายุ';

/**
 * Create and revoke invite codes.
 *
 * There was no interface for this at all — codes had to be typed into the
 * Firestore console by hand, which is why none of them had expiry or use
 * limits set.
 */
export default function InviteManager() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState('');

  const [maxUses, setMaxUses] = useState('1');
  const [days, setDays] = useState('7');

  useEffect(() => {
    let alive = true;
    getDocs(collection(db, 'invites'))
      .then((snap) => {
        if (!alive) return;
        const rows = [];
        snap.forEach((d) => rows.push({ code: d.id, ...d.data() }));
        rows.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setInvites(rows);
      })
      .catch((err) => console.error('Error loading invites:', err))
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const create = async () => {
    setCreating(true);
    const code = makeCode();
    const uses = Number(maxUses) || 0;
    const life = Number(days) || 0;

    const invite = {
      active: true,
      usedCount: 0,
      maxUses: uses, // 0 = unlimited
      createdAt: new Date(),
      ...(life > 0 ? { expiresAt: new Date(Date.now() + life * 86400000) } : {}),
    };

    try {
      await setDoc(doc(db, 'invites', code), invite);
      setInvites((prev) => [{ code, ...invite }, ...prev]);
      toast.success('สร้างลิงก์คำเชิญแล้ว');
    } catch (err) {
      console.error(err);
      toast.error('สร้างลิงก์ไม่สำเร็จ');
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (code, active) => {
    try {
      await updateDoc(doc(db, 'invites', code), { active: !active });
      setInvites((prev) => prev.map((i) => (i.code === code ? { ...i, active: !active } : i)));
    } catch (err) {
      console.error(err);
      toast.error('เปลี่ยนสถานะไม่สำเร็จ');
    }
  };

  const remove = async (code) => {
    const agreed = await confirm({
      title: 'ลบลิงก์เชิญนี้?',
      message: `รหัส ${code} — ผู้ที่ได้รับลิงก์ไปแล้วแต่ยังไม่ได้ใช้จะเข้าไม่ได้อีก`,
      confirmLabel: 'ลบลิงก์',
      tone: 'danger',
    });
    if (!agreed) return;
    try {
      await deleteDoc(doc(db, 'invites', code));
      setInvites((prev) => prev.filter((i) => i.code !== code));
      toast.success('ลบลิงก์แล้ว');
    } catch (err) {
      console.error(err);
      toast.error('ลบไม่สำเร็จ');
    }
  };

  const copy = async (code) => {
    const url = `${window.location.origin}/join/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(code);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      toast.error(`คัดลอกไม่สำเร็จ — ลิงก์คือ ${url}`);
    }
  };

  const describe = (invite) => {
    const parts = [];
    parts.push(
      invite.maxUses ? `ใช้แล้ว ${invite.usedCount || 0}/${invite.maxUses}` : `ใช้แล้ว ${invite.usedCount || 0} ครั้ง`
    );
    if (invite.expiresAt) {
      const date = invite.expiresAt.toDate?.() ?? new Date(invite.expiresAt);
      const expired = date < new Date();
      parts.push(
        expired
          ? 'หมดอายุแล้ว'
          : `ถึง ${date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}`
      );
    } else {
      parts.push(NEVER);
    }
    return parts.join(' · ');
  };

  const isSpent = (invite) =>
    invite.active === false ||
    (invite.maxUses > 0 && (invite.usedCount || 0) >= invite.maxUses) ||
    (invite.expiresAt && (invite.expiresAt.toDate?.() ?? new Date(invite.expiresAt)) < new Date());

  return (
    <section className={styles.wrap}>
      <header className={styles.head}>
        <div>
          <h2 className={styles.title}>ลิงก์คำเชิญ</h2>
          <p className={styles.sub}>
            ส่งลิงก์ให้ใคร คนนั้นได้สิทธิ์อ่านเล่มสงวนสิทธิ์ทันทีโดยไม่ต้องรออนุมัติ
          </p>
        </div>
      </header>

      <div className={styles.maker}>
        <label className={styles.makerField}>
          <span>ใช้ได้กี่คน</span>
          <select value={maxUses} onChange={(e) => setMaxUses(e.target.value)}>
            <option value="1">1 คน</option>
            <option value="5">5 คน</option>
            <option value="20">20 คน</option>
            <option value="0">ไม่จำกัด</option>
          </select>
        </label>

        <label className={styles.makerField}>
          <span>อายุลิงก์</span>
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="1">1 วัน</option>
            <option value="7">7 วัน</option>
            <option value="30">30 วัน</option>
            <option value="0">ไม่หมดอายุ</option>
          </select>
        </label>

        <button className="btn btn-solid" onClick={create} disabled={creating}>
          <Plus size={16} /> {creating ? 'กำลังสร้าง…' : 'สร้างลิงก์'}
        </button>
      </div>

      {loading ? (
        <p className={styles.state}>กำลังโหลดลิงก์…</p>
      ) : invites.length === 0 ? (
        <p className={styles.state}>ยังไม่มีลิงก์คำเชิญ</p>
      ) : (
        <ul className={styles.list}>
          {invites.map((invite) => (
            <li key={invite.code} className={`${styles.row} ${isSpent(invite) ? styles.spent : ''}`}>
              <span className={styles.codeCell}>
                <Link2 size={14} className={styles.codeIcon} />
                <code className={styles.code}>{invite.code}</code>
              </span>

              <span className={styles.meta}>{describe(invite)}</span>

              <div className={styles.acts}>
                <button className={styles.act} onClick={() => copy(invite.code)} title="คัดลอกลิงก์">
                  {copied === invite.code ? <Check size={15} /> : <Copy size={15} />}
                </button>
                <button
                  className={styles.act}
                  onClick={() => toggle(invite.code, invite.active !== false)}
                  title={invite.active === false ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                >
                  <Power size={15} />
                </button>
                <button
                  className={`${styles.act} ${styles.danger}`}
                  onClick={() => remove(invite.code)}
                  title="ลบลิงก์"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
