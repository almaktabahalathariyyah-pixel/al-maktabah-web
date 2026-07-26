'use client';

import { useEffect, useState, useRef } from 'react';
import { collection, getDocs, getDoc, setDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { loadBookFields } from '@/lib/bookFields';
import BookCover from '@/components/BookCover';
import { useToast } from '@/context/ToastContext';
import CreatableSelect from 'react-select/creatable';
import { selectStyles } from '@/lib/selectStyles';
import { getNextBookId } from '@/lib/sequentialId';
import { getDropdownSettings } from '@/lib/settings';
import { X } from 'lucide-react';
import styles from './BookFormPanel.module.css';

export default function BookFormPanel({ isOpen, onClose, bookId = null, onSaved }) {
  const { toast } = useToast();
  
  const [fields, setFields] = useState(null);
  const [values, setValues] = useState({});
  const [restricted, setRestricted] = useState(false);
  const [coverUrl, setCoverUrl] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  
  const [options, setOptions] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [note, setNote] = useState('');

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Load data when opened
  useEffect(() => {
    if (!isOpen) return;
    
    let isMounted = true;
    
    const fetchData = async () => {
      setLoading(true);
      setNote('');
      try {
        const f = await loadBookFields();
        if (!isMounted) return;
        setFields(f.filter((x) => x.form));

        // Fetch Dropdown options
        const [settings, snap] = await Promise.all([
          getDropdownSettings(),
          getDocs(collection(db, 'books'))
        ]);
        
        if (!isMounted) return;
        const { categories: predefinedCategories, languages: predefinedLanguages } = settings;

        const opts = { author: new Set(), category: new Set(), publisher: new Set(), translator: new Set(), language: new Set(), type: new Set(), year: new Set() };
        snap.forEach(dSnap => {
          const d = dSnap.data();
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
        
        // Year options
        const currentYear = new Date().getFullYear();
        const yearOptions = Array.from({length: 100}, (_, i) => {
          const y = String(currentYear - i);
          return { value: y, label: y };
        });
        const dynamicYears = formattedOpts.year.filter(y => !yearOptions.some(o => o.value === y.value));
        formattedOpts.year = [...yearOptions, ...dynamicYears].sort((a,b) => Number(b.value) - Number(a.value));

        setOptions(formattedOpts);

        // Fetch Book Data if editing
        if (bookId) {
          const docSnap = await getDoc(doc(db, 'books', bookId));
          if (docSnap.exists() && isMounted) {
            const data = docSnap.data();
            setCoverUrl(data.coverUrl || '');
            setTelegramUrl(data.telegramUrl || '');
            setDriveUrl(data.driveUrl || '');
            setRestricted(data.restricted || false);
            
            const vals = {};
            for (const key of Object.keys(data)) {
              if (!['coverUrl', 'telegramUrl', 'driveUrl', 'restricted', 'createdAt'].includes(key)) {
                vals[key] = data[key];
              }
            }
            setValues(vals);
          } else if (isMounted) {
            toast.error('ไม่พบข้อมูลหนังสือ');
            onClose();
          }
        } else {
          // Reset form for new
          setValues({});
          setCoverUrl('');
          setTelegramUrl('');
          setDriveUrl('');
          setRestricted(false);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        if (isMounted) toast.error('เกิดข้อผิดพลาดในการโหลดข้อมูล');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchData();
    
    return () => { isMounted = false; };
  }, [isOpen, bookId, onClose, toast]);

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
      e.target.value = '';
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
      const payload = { ...values, coverUrl, telegramUrl, driveUrl, restricted };
      
      for (const field of fields) {
        if (field.type === 'number' && payload[field.key] !== undefined) {
          payload[field.key] = Number(payload[field.key]) || 0;
        }
      }
      
      let finalId = bookId;
      if (bookId) {
        await updateDoc(doc(db, 'books', bookId), payload);
        toast.success('บันทึกการแก้ไขเรียบร้อย');
      } else {
        payload.createdAt = new Date();
        finalId = await getNextBookId();
        await setDoc(doc(db, 'books', finalId), payload);
        toast.success('เพิ่มหนังสือใหม่เรียบร้อย');
      }
      
      if (onSaved) onSaved({ id: finalId, ...payload });
      onClose();
    } catch (error) {
      console.error(error);
      setNote('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>{bookId ? 'แก้ไขหนังสือ' : 'เพิ่มหนังสือใหม่'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          {loading || !fields ? (
            <div className={styles.loadingState}>กำลังโหลดข้อมูล...</div>
          ) : (
            <form className={styles.formLayout} onSubmit={submit}>
              <div className={styles.mainCol}>
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
                          placeholder="ค้นหาหรือเพิ่มใหม่..."
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
                    <span className={styles.label}>ลิงก์ไฟล์ใน Telegram (ไฟล์เล็ก)</span>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="https://t.me/c/..."
                      value={telegramUrl}
                      onChange={(e) => setTelegramUrl(e.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>ลิงก์สำรอง Google Drive (ไฟล์ใหญ่)</span>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="https://drive.google.com/file/d/..."
                      value={driveUrl}
                      onChange={(e) => setDriveUrl(e.target.value)}
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
                      <em>เปิดให้เฉพาะสมาชิกเท่านั้น</em>
                    </span>
                  </label>
                </fieldset>
              </div>

              <div className={styles.sideCol}>
                <span className={styles.label}>ตัวอย่างรูปปก</span>
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
                
                <div style={{ textAlign: 'center', margin: '0.5rem 0', color: 'var(--fg-3)', fontSize: '12px' }}>หรือวางลิงก์</div>

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
              </div>
            </form>
          )}
        </div>
        
        <div className={styles.footer}>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>ยกเลิก</button>
          <button type="button" className="btn btn-solid" onClick={submit} disabled={saving || loading || !fields}>
            {saving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
          </button>
        </div>
      </div>
    </>
  );
}
