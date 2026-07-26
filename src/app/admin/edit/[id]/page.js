'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { loadBookFields } from '@/lib/bookFields';
import BookCover from '@/components/BookCover';
import { useToast } from '@/context/ToastContext';
import styles from './page.module.css';
import { Trash2 } from 'lucide-react';

export default function EditBookPage({ params }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();
  
  const [fields, setFields] = useState(null);
  const [values, setValues] = useState({});
  const [restricted, setRestricted] = useState(false);
  const [coverUrl, setCoverUrl] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const f = await loadBookFields();
        setFields(f.filter((x) => x.form));

        const docSnap = await getDoc(doc(db, 'books', id));
        if (docSnap.exists()) {
          const data = docSnap.data();
          setCoverUrl(data.coverUrl || '');
          setTelegramUrl(data.telegramUrl || '');
          setRestricted(data.restricted || false);
          
          const vals = {};
          for (const key of Object.keys(data)) {
            if (!['coverUrl', 'telegramUrl', 'restricted', 'createdAt'].includes(key)) {
              vals[key] = data[key];
            }
          }
          setValues(vals);
        } else {
          toast.error('ไม่พบหนังสือนี้');
          router.push('/admin');
        }
      } catch (err) {
        console.error(err);
        toast.error('เกิดข้อผิดพลาดในการโหลดข้อมูล');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router, toast]);

  const set = (key, value) => setValues((prev) => ({ ...prev, [key]: value }));

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingImage(true);
    const formData = new FormData();
    formData.append('image', file);

    try {
      const apiKey = process.env.NEXT_PUBLIC_IMGBB_API_KEY;
      if (!apiKey) throw new Error('ไม่พบ API Key ของ ImgBB');

      const res = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        setCoverUrl(data.data.url);
        toast.success('อัปโหลดรูปภาพสำเร็จ');
      } else {
        throw new Error(data.error?.message || 'Upload failed');
      }
    } catch (err) {
      console.error(err);
      toast.error('อัปโหลดรูปภาพไม่สำเร็จ: ' + err.message);
    } finally {
      setUploadingImage(false);
      e.target.value = ''; // reset file input
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!values.title?.trim()) {
      setNote('กรุณากรอกชื่อหนังสือ');
      return;
    }
    setSaving(true);
    setNote('');
    try {
      const payload = { ...values, coverUrl, telegramUrl, restricted };
      
      for (const field of fields) {
        if (field.type === 'number' && payload[field.key] !== undefined) {
          payload[field.key] = Number(payload[field.key]) || 0;
        }
      }
      
      await updateDoc(doc(db, 'books', id), payload);
      toast.success('บันทึกข้อมูลเรียบร้อย');
      router.push('/admin');
    } catch (error) {
      console.error(error);
      setNote('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('คุณแน่ใจหรือไม่ที่จะลบหนังสือเล่มนี้?')) return;
    
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'books', id));
      toast.success('ลบหนังสือเรียบร้อย');
      router.push('/admin');
    } catch (error) {
      console.error(error);
      toast.error('เกิดข้อผิดพลาดในการลบหนังสือ');
      setDeleting(false);
    }
  };

  if (loading || !fields) return <p className={styles.loading}>กำลังโหลดข้อมูล…</p>;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>แก้ไขหนังสือ</h1>
        </div>
        <div className={styles.headerActions}>
          <button onClick={handleDelete} className="btn" disabled={deleting} style={{ color: 'var(--hot)', borderColor: 'var(--hot)' }}>
            <Trash2 size={16} /> ลบ
          </button>
          <Link href="/admin" className="btn">ยกเลิก</Link>
        </div>
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
            <span className={styles.label}>อัปโหลดรูปปก (ImgBB)</span>
            <input
              type="file"
              accept="image/*"
              className={styles.input}
              onChange={handleImageUpload}
              disabled={uploadingImage}
              style={{ padding: '0.4rem' }}
            />
          </label>
          {uploadingImage && <p style={{ fontSize: '12px', color: 'var(--brand)', marginBottom: '0.5rem' }}>กำลังอัปโหลด...</p>}
          <div style={{ textAlign: 'center', margin: '0.5rem 0', color: 'var(--fg-3)', fontSize: '12px' }}>หรือวางลิงก์รูปภาพ</div>

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
            {saving ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}
          </button>
        </aside>
      </form>
    </div>
  );
}
