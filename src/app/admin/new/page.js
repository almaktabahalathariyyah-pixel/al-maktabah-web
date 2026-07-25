'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { loadBookFields } from '@/lib/bookFields';
import BookCover from '@/components/BookCover';
import styles from './page.module.css';

export default function NewBookPage() {
  const router = useRouter();
  const [fields, setFields] = useState(null);
  const [values, setValues] = useState({});
  const [restricted, setRestricted] = useState(false);
  const [coverUrl, setCoverUrl] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    loadBookFields().then((f) => setFields(f.filter((x) => x.form)));
  }, []);

  const set = (key, value) => setValues((prev) => ({ ...prev, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!values.title?.trim()) {
      setNote('กรุณากรอกชื่อหนังสือ');
      return;
    }
    setSaving(true);
    setNote('');
    try {
      const payload = { ...values, coverUrl, telegramUrl, restricted, createdAt: new Date() };
      // Numeric fields are stored as numbers so sorting and ranges behave.
      for (const field of fields) {
        if (field.type === 'number' && payload[field.key] !== undefined) {
          payload[field.key] = Number(payload[field.key]) || 0;
        }
      }
      await addDoc(collection(db, 'books'), payload);
      router.push('/admin');
    } catch (error) {
      console.error(error);
      setNote('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
      setSaving(false);
    }
  };

  if (!fields) return <p className={styles.loading}>กำลังโหลดฟอร์ม…</p>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>เพิ่มหนังสือ</h1>
          <p className={styles.sub}>
            ฟอร์มนี้สร้างจาก{' '}
            <Link href="/admin/fields" className={styles.link}>การตั้งค่าฟิลด์</Link>{' '}
            — เพิ่มหรือซ่อนช่องกรอกได้ที่นั่น
          </p>
        </div>
        <Link href="/admin" className="btn">ยกเลิก</Link>
      </header>

      <form className={styles.layout} onSubmit={submit}>
        <div className={styles.main}>
          <div className={styles.fieldGrid}>
            {fields.map((field) => (
              <label
                key={field.key}
                className={`${styles.field} ${field.type === 'textarea' ? styles.wide : ''}`}
              >
                <span className={styles.label}>{field.label}</span>
                {field.type === 'textarea' ? (
                  <textarea
                    rows={4}
                    className={styles.input}
                    value={values[field.key] || ''}
                    onChange={(e) => set(field.key, e.target.value)}
                  />
                ) : field.type === 'bool' ? (
                  <select
                    className={styles.input}
                    value={values[field.key] ?? 'false'}
                    onChange={(e) => set(field.key, e.target.value === 'true')}
                  >
                    <option value="false">ไม่ใช่</option>
                    <option value="true">ใช่</option>
                  </select>
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    className={styles.input}
                    value={values[field.key] || ''}
                    onChange={(e) => set(field.key, e.target.value)}
                  />
                )}
              </label>
            ))}
          </div>

          <fieldset className={styles.block}>
            <legend className={styles.blockTitle}>ไฟล์และการเข้าถึง</legend>

            <label className={styles.field}>
              <span className={styles.label}>ลิงก์ไฟล์ใน Telegram</span>
              <input
                type="text"
                className={styles.input}
                placeholder="https://t.me/c/1234567890/42"
                value={telegramUrl}
                onChange={(e) => setTelegramUrl(e.target.value)}
              />
            </label>

            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={restricted}
                onChange={(e) => setRestricted(e.target.checked)}
              />
              <span>
                <strong>สงวนสิทธิ์</strong>
                <em>เปิดให้เฉพาะสมาชิกที่ได้รับอนุมัติเท่านั้น</em>
              </span>
            </label>
          </fieldset>
        </div>

        {/* Live preview of exactly what a reader will see on the shelf */}
        <aside className={styles.side}>
          <span className={styles.label}>ตัวอย่างที่ผู้อ่านจะเห็น</span>
          <div className={styles.preview}>
            <BookCover
              src={coverUrl}
              title={values.title || 'ชื่อหนังสือ'}
              author={values.author || 'ผู้แต่ง'}
            />
          </div>

          <label className={styles.field}>
            <span className={styles.label}>ลิงก์รูปปก</span>
            <input
              type="text"
              className={styles.input}
              placeholder="https://…"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
            />
          </label>

          {note && <p className={styles.err}>{note}</p>}

          <button type="submit" className="btn btn-solid btn-block" disabled={saving}>
            {saving ? 'กำลังบันทึก…' : 'บันทึกหนังสือ'}
          </button>
        </aside>
      </form>
    </div>
  );
}
