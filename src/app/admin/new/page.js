'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { loadBookFields } from '@/lib/bookFields';
import BookCover from '@/components/BookCover';
import { useToast } from '@/context/ToastContext';
import CreatableSelect from 'react-select/creatable';
import { selectStyles } from '@/lib/selectStyles';
import { getNextBookId } from '@/lib/sequentialId';
import { predefinedCategories, predefinedLanguages } from '@/lib/predefinedOptions';
import styles from './page.module.css';

export default function NewBookPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [fields, setFields] = useState(null);
  const [values, setValues] = useState({});
  const [restricted, setRestricted] = useState(false);
  const [coverUrl, setCoverUrl] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [note, setNote] = useState('');

  const [options, setOptions] = useState({});

  useEffect(() => {
    const fetchData = async () => {
      const f = await loadBookFields();
      setFields(f.filter((x) => x.form));

      try {
        const snap = await getDocs(collection(db, 'books'));
        const opts = { author: new Set(), category: new Set(), publisher: new Set(), translator: new Set(), language: new Set(), type: new Set(), year: new Set() };
        snap.forEach(doc => {
          const d = doc.data();
          Object.keys(opts).forEach(k => {
            if (d[k] !== undefined && d[k] !== null && d[k] !== '') {
              opts[k].add(String(d[k]));
            }
          });
        });
        
        const formattedOpts = {};
        Object.keys(opts).forEach(k => {
          formattedOpts[k] = Array.from(opts[k]).sort().map(v => ({ value: v, label: v }));
        });
        
        // Merge Category
        const dynamicCats = formattedOpts.category.filter(c => 
          !predefinedCategories.some(g => g.options.some(o => o.value === c.value))
        );
        formattedOpts.category = [...predefinedCategories];
        if (dynamicCats.length > 0) {
          formattedOpts.category.push({ label: 'หมวดหมู่อื่นๆ', options: dynamicCats });
        }
        
        // Merge Language
        const dynamicLangs = formattedOpts.language.filter(l => 
          !predefinedLanguages.some(p => p.value === l.value)
        );
        formattedOpts.language = [...predefinedLanguages, ...dynamicLangs];
        
        // Year options (last 100 years)
        const currentYear = new Date().getFullYear();
        const yearOptions = Array.from({length: 100}, (_, i) => {
          const y = String(currentYear - i);
          return { value: y, label: y };
        });
        const dynamicYears = formattedOpts.year.filter(y => !yearOptions.some(o => o.value === y.value));
        formattedOpts.year = [...yearOptions, ...dynamicYears].sort((a,b) => Number(b.value) - Number(a.value));

        setOptions(formattedOpts);
      } catch (err) {
        console.error("Error fetching options:", err);
      }
    };
    fetchData();
  }, []);

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
      const payload = { ...values, coverUrl, telegramUrl, restricted, createdAt: new Date() };
      // Numeric fields are stored as numbers so sorting and ranges behave.
      for (const field of fields) {
        if (field.type === 'number' && payload[field.key] !== undefined) {
          payload[field.key] = Number(payload[field.key]) || 0;
        }
      }
      
      const newId = await getNextBookId();
      await setDoc(doc(db, 'books', newId), payload);
      
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
                ) : field.type === 'select' ? (
                  <CreatableSelect
                    isClearable
                    styles={selectStyles}
                    options={options[field.key] || []}
                    value={values[field.key] ? { value: values[field.key], label: values[field.key] } : null}
                    onChange={(selected) => set(field.key, selected ? selected.value : '')}
                    placeholder="พิมพ์เพื่อค้นหาหรือเพิ่มใหม่..."
                    formatCreateLabel={(inputValue) => `เพิ่ม "${inputValue}"`}
                    classNamePrefix="react-select"
                  />
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
            {saving ? 'กำลังบันทึก…' : 'บันทึกหนังสือ'}
          </button>
        </aside>
      </form>
    </div>
  );
}
