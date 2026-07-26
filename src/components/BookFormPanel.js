'use client';

import { useEffect, useState, useRef } from 'react';
import { collection, getDocs, getDoc, setDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { loadBookFields } from '@/lib/bookFields';
import BookCover from '@/components/BookCover';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import CreatableSelect from 'react-select/creatable';
import { selectStyles } from '@/lib/selectStyles';
import { getNextBookId } from '@/lib/sequentialId';
import { getDropdownSettings } from '@/lib/settings';
import { X, UploadCloud, CheckCircle, AlertCircle } from 'lucide-react';
import styles from './BookFormPanel.module.css';

export default function BookFormPanel({ isOpen, onClose, bookId = null, onSaved }) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [fields, setFields] = useState(null);
  const [values, setValues] = useState({});
  const [restricted, setRestricted] = useState(false);
  const [coverUrl, setCoverUrl] = useState('');
  
  const [telegramUrl, setTelegramUrl] = useState('');
  const [telegramFileId, setTelegramFileId] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  
  const [options, setOptions] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [note, setNote] = useState('');

  // Dual Uploader States
  const [isDragging, setIsDragging] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  const [tgProgress, setTgProgress] = useState(0);
  const [driveProgress, setDriveProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, uploading, success, error
  const [googleToken, setGoogleToken] = useState(null);

  // Initialize Google Auth Client
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.google) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  }, []);

  const handleGoogleAuth = () => {
    if (!window.google) {
      toast.error('Google API ยังไม่พร้อมใช้งาน กรุณารอสักครู่');
      return;
    }
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      toast.error('ยังไม่ได้ตั้งค่า NEXT_PUBLIC_GOOGLE_CLIENT_ID');
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/drive.file',
      callback: (response) => {
        if (response.error) {
          toast.error('การยืนยันตัวตน Google ล้มเหลว');
          return;
        }
        setGoogleToken(response.access_token);
        localStorage.setItem('googleDriveToken', JSON.stringify({
          token: response.access_token,
          expiresAt: Date.now() + 55 * 60 * 1000 // expires in 55 mins
        }));
        toast.success('เชื่อมต่อ Google Drive สำเร็จ');
      },
    });
    tokenClient.requestAccessToken();
  };

  // Restore Google Token from localStorage
  useEffect(() => {
    if (isOpen) {
      const savedData = localStorage.getItem('googleDriveToken');
      if (savedData) {
        try {
          const { token, expiresAt } = JSON.parse(savedData);
          if (Date.now() < expiresAt) {
            setGoogleToken(token);
          } else {
            localStorage.removeItem('googleDriveToken');
          }
        } catch (e) {
          localStorage.removeItem('googleDriveToken');
        }
      }
    }
  }, [isOpen]);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Stable refs for callbacks used inside useEffect
  const toastRef = useRef(toast);
  const onCloseRef = useRef(onClose);
  useEffect(() => { toastRef.current = toast; }, [toast]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

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

        const [settings, snap] = await Promise.all([
          getDropdownSettings(),
          getDocs(collection(db, 'books'))
        ]);
        
        if (!isMounted) return;
        const { categories: predefinedCategories, languages: predefinedLanguages, types: predefinedTypes = [], authors: predefinedAuthors = [], translators: predefinedTranslators = [], publishers: predefinedPublishers = [] } = settings;

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
        
        const dynamicCats = formattedOpts.category.filter(c => !predefinedCategories.some(g => g.options.some(o => o.value === c.value)));
        formattedOpts.category = [...predefinedCategories];
        if (dynamicCats.length > 0) formattedOpts.category.push({ label: 'หมวดหมู่อื่นๆ', options: dynamicCats });
        
        const dynamicLangs = formattedOpts.language.filter(l => !predefinedLanguages.some(p => p.value === l.value));
        formattedOpts.language = [...predefinedLanguages, ...dynamicLangs];
        
        const mergeSimplePredefined = (key, predefinedArr) => {
          const preOpts = predefinedArr.map(p => ({ value: p, label: p }));
          const dynamicOpts = formattedOpts[key].filter(d => !preOpts.some(p => p.value === d.value));
          formattedOpts[key] = [...preOpts, ...dynamicOpts];
        };

        mergeSimplePredefined('type', predefinedTypes);
        mergeSimplePredefined('author', predefinedAuthors);
        mergeSimplePredefined('translator', predefinedTranslators);
        mergeSimplePredefined('publisher', predefinedPublishers);
        
        const currentYear = new Date().getFullYear();
        const yearOptions = Array.from({length: 100}, (_, i) => { const y = String(currentYear - i); return { value: y, label: y }; });
        const dynamicYears = formattedOpts.year.filter(y => !yearOptions.some(o => o.value === y.value));
        formattedOpts.year = [...yearOptions, ...dynamicYears].sort((a,b) => Number(b.value) - Number(a.value));

        setOptions(formattedOpts);

        if (bookId) {
          const docSnap = await getDoc(doc(db, 'books', bookId));
          if (docSnap.exists() && isMounted) {
            const data = docSnap.data();
            setCoverUrl(data.coverUrl || '');
            setTelegramUrl(data.telegramUrl || '');
            setTelegramFileId(data.telegramFileId || '');
            setDriveUrl(data.driveUrl || '');
            setRestricted(data.restricted || false);
            
            const vals = {};
            for (const key of Object.keys(data)) {
              if (!['coverUrl', 'telegramUrl', 'telegramFileId', 'driveUrl', 'restricted', 'createdAt'].includes(key)) {
                vals[key] = data[key];
              }
            }
            setValues(vals);
          } else if (isMounted) {
            toastRef.current.error('ไม่พบข้อมูลหนังสือ');
            onCloseRef.current();
          }
        } else {
          setValues({});
          setCoverUrl('');
          setTelegramUrl('');
          setTelegramFileId('');
          setDriveUrl('');
          setRestricted(false);
          setPdfFile(null);
          setUploadStatus('idle');
          setTgProgress(0);
          setDriveProgress(0);
        }
      } catch (err) {
        console.error("Error fetching data:", err);
        if (isMounted) toastRef.current.error('เกิดข้อผิดพลาดในการโหลดข้อมูล');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchData();
    return () => { isMounted = false; };
  }, [isOpen, bookId]);

  const set = (key, value) => setValues((prev) => ({ ...prev, [key]: value }));

  // Dropzone Handlers
  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };
  const onFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleFileSelection = (file) => {
    if (file.type !== 'application/pdf') {
      toast.error('รองรับเฉพาะไฟล์ PDF เท่านั้น');
      return;
    }
    setPdfFile(file);
    setUploadStatus('idle');
    setTgProgress(0);
    setDriveProgress(0);
  };

  const startUpload = async () => {
    if (!pdfFile) return;
    if (!googleToken) {
      toast.error('กรุณาลงชื่อเข้าใช้ Google Drive ก่อนเริ่มอัปโหลด');
      return;
    }

    setUploadStatus('uploading');
    
    try {
      const idToken = await user.getIdToken();
      
      // 1. Get Telegram Config
      const confRes = await fetch(`/api/admin/config?token=${idToken}`);
      const conf = await confRes.json();
      if (!confRes.ok) throw new Error(conf.error || 'Failed to get Telegram config');
      if (!conf.telegramBotToken || !conf.telegramChatId) throw new Error('Telegram Bot Token หรือ Chat ID ยังไม่ได้ตั้งค่าในเซิร์ฟเวอร์');

      // Helper function to handle XHR upload for progress tracking
      const uploadWithProgress = (url, method, headers, body, onProgress) => {
        return new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open(method, url);
          Object.keys(headers).forEach(k => xhr.setRequestHeader(k, headers[k]));
          
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              onProgress(percent);
            }
          };
          
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
            else reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.responseText}`));
          };
          
          xhr.onerror = () => reject(new Error('Network Error'));
          xhr.send(body);
        });
      };

      // 2. Upload to Telegram (Only if <= 50MB)
      const isLargeFile = pdfFile.size > 50 * 1024 * 1024;
      let tgPromise = Promise.resolve();
      
      if (!isLargeFile) {
        tgPromise = (async () => {
          const tgFormData = new FormData();
          tgFormData.append('chat_id', conf.telegramChatId);
          tgFormData.append('document', pdfFile);
          
          const tgResult = await uploadWithProgress(
            `https://api.telegram.org/bot${conf.telegramBotToken}/sendDocument`,
            'POST',
            {},
            tgFormData,
            setTgProgress
          );
          
          if (tgResult.ok && tgResult.result.document) {
            setTelegramFileId(tgResult.result.document.file_id);
          } else {
            throw new Error('Telegram upload rejected');
          }
        })();
      } else {
        setTgProgress(100); // Skip Telegram visually
      }

      // 3. Upload to Google Drive (Resumable Upload for large files)
      const drivePromise = (async () => {
        const metadata = {
          name: pdfFile.name,
          mimeType: 'application/pdf',
        };
        
        // Step 1: Initiate Resumable Upload
        const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${googleToken}`,
            'Content-Type': 'application/json',
            'X-Upload-Content-Type': 'application/pdf',
            'X-Upload-Content-Length': pdfFile.size
          },
          body: JSON.stringify(metadata)
        });
        
        if (!initRes.ok) {
          const errText = await initRes.text();
          throw new Error(`Drive Init Failed (${initRes.status}): ${errText}`);
        }
        const uploadUrl = initRes.headers.get('Location');
        
        if (!uploadUrl) throw new Error('No upload URL returned from Google Drive');

        // Step 2: Upload actual file data to the resumable URL
        const driveResult = await uploadWithProgress(
          uploadUrl,
          'PUT',
          { 'Content-Type': 'application/pdf' },
          pdfFile,
          setDriveProgress
        );
        
        if (driveResult.id) {
          // Set permissions to "Anyone with link"
          await fetch(`https://www.googleapis.com/drive/v3/files/${driveResult.id}/permissions`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${googleToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ role: 'reader', type: 'anyone' })
          });
          
          setDriveUrl(`https://drive.google.com/file/d/${driveResult.id}/view`);
        } else {
          throw new Error('Google Drive upload rejected');
        }
      })();

      await Promise.all([tgPromise, drivePromise]);
      setUploadStatus('success');
      toast.success('อัปโหลดไฟล์เสร็จสมบูรณ์');

    } catch (err) {
      console.error(err);
      setUploadStatus('error');
      toast.error('อัปโหลดล้มเหลว: ' + err.message);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    const inputEl = e.target; // save reference before async
    if (!file) return;

    // 1. Show immediate preview using FileReader (instant feedback)
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCoverUrl(ev.target.result); // data:image/... preview
    };
    reader.readAsDataURL(file);

    // 2. Upload to Telegram in the background
    setUploadingImage(true);
    setNote('');
    const formData = new FormData();
    formData.append('image', file);

    try {
      const idToken = await user.getIdToken();
      
      const res = await fetch('/api/admin/upload-cover', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`
        },
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        setCoverUrl(data.url); // replace preview with permanent Telegram URL
        toast.success('อัปโหลดรูปปกสำเร็จ');
      } else {
        // Keep the preview image but show warning
        setNote('อัปโหลดไม่สำเร็จ แต่รูปตัวอย่างยังแสดงอยู่ — ลองวางลิงก์เองด้านล่าง');
        console.error('Upload cover failed:', data.error);
      }
    } catch (err) {
      console.error('Upload cover error:', err);
      setNote('อัปโหลดไม่สำเร็จ — ลองวางลิงก์รูปปกด้านล่างแทน');
    } finally {
      setUploadingImage(false);
      try { inputEl.value = ''; } catch (_) { /* ignore */ }
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
      // Don't save base64 data URLs to Firestore (temporary preview only)
      const finalCoverUrl = coverUrl.startsWith('data:') ? '' : coverUrl;
      const payload = { ...values, coverUrl: finalCoverUrl, telegramUrl, telegramFileId, driveUrl, restricted };
      
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

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
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
            <form className={styles.formLayout} onSubmit={submit} onKeyDown={handleKeyDown}>
              
              {/* 1. ข้อมูลทั่วไป (General Info) */}
              <fieldset className={styles.block}>
                <legend className={styles.blockTitle}>ข้อมูลทั่วไป</legend>
                <div className={styles.fieldGrid}>
                  {fields.filter(f => f.key === 'title' || f.key === 'description').map((field) => (
                    <label key={field.key} className={`${styles.field} ${field.type === 'textarea' ? styles.wide : ''}`}>
                      <span className={styles.label}>{field.label}</span>
                      {field.type === 'textarea' ? (
                        <textarea rows={4} className={styles.input} value={values[field.key] || ''} onChange={(e) => set(field.key, e.target.value)} />
                      ) : field.type === 'bool' ? (
                        <select className={styles.input} value={values[field.key] ?? 'false'} onChange={(e) => set(field.key, e.target.value === 'true')}>
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
                        <input type={field.type === 'number' ? 'number' : 'text'} className={styles.input} value={values[field.key] || ''} onChange={(e) => set(field.key, e.target.value)} />
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* 2. ไฟล์และหน้าปก (Files & Cover) */}
              <div className={styles.filesGrid}>
                
                {/* 2.1 ไฟล์ PDF */}
                <fieldset className={styles.block} style={{ margin: 0 }}>
                  <legend className={styles.blockTitle}>ไฟล์ PDF (อัปโหลดคู่อัตโนมัติ)</legend>
                  
                  {!googleToken ? (
                    <div style={{ background: 'var(--brand-muted)', padding: '1.5rem', borderRadius: '8px', textAlign: 'center' }}>
                      <p style={{ color: 'var(--brand-dark)', fontSize: '0.9rem', marginBottom: '1rem', fontWeight: 500 }}>
                        ในการอัปโหลดไฟล์เข้า Google Drive อัตโนมัติ คุณต้องเชื่อมต่อบัญชีก่อน
                      </p>
                      <button type="button" onClick={handleGoogleAuth} className="btn btn-solid" style={{ background: '#3b82f6', border: 'none' }}>
                        Sign in with Google
                      </button>
                    </div>
                  ) : (
                    <div 
                      className={`${styles.dropzone} ${isDragging ? styles.dragging : ''}`}
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                      onClick={() => document.getElementById('pdf-upload').click()}
                    >
                      <input 
                        id="pdf-upload" 
                        type="file" 
                        accept="application/pdf" 
                        onChange={onFileChange} 
                        style={{ display: 'none' }} 
                      />
                      <UploadCloud size={32} color="var(--fg-3)" style={{ marginBottom: '1rem' }} />
                      <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>ลากไฟล์ PDF มาวางที่นี่</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--fg-3)' }}>ระบบจะอัปโหลดไปที่ Telegram และ Google Drive อัตโนมัติ (หากไฟล์ใหญ่กว่า 50MB จะอัปโหลดขึ้น Drive เพียงอย่างเดียว)</div>
                    </div>
                  )}

                  {pdfFile && (
                    <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--surface-2)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                          <FileText size={20} color="var(--brand)" />
                          <span style={{ fontSize: '0.9rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pdfFile.name}</span>
                        </div>
                        <span style={{ color: 'var(--fg-3)' }}>{(pdfFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                      </div>
                      
                      {uploadStatus === 'idle' && (
                        <button type="button" onClick={startUpload} className="btn btn-solid" style={{ width: '100%' }}>
                          เริ่มอัปโหลดไฟล์
                        </button>
                      )}

                      {uploadStatus !== 'idle' && (
                        <div>
                          {pdfFile.size <= 50 * 1024 * 1024 && (
                            <div style={{ marginBottom: '0.5rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.2rem' }}>
                                <span>Telegram</span>
                                <span>{tgProgress}%</span>
                              </div>
                              <div style={{ width: '100%', height: '6px', background: 'var(--bg-1)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${tgProgress}%`, height: '100%', background: 'var(--brand)', transition: 'width 0.2s' }} />
                              </div>
                            </div>
                          )}
                          
                          <div style={{ marginBottom: '0.5rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.2rem' }}>
                              <span>Google Drive</span>
                              <span>{driveProgress}%</span>
                            </div>
                            <div style={{ width: '100%', height: '6px', background: 'var(--bg-1)', borderRadius: '3px', overflow: 'hidden' }}>
                              <div style={{ width: `${driveProgress}%`, height: '100%', background: 'var(--brand)', transition: 'width 0.2s' }} />
                            </div>
                          </div>
                          
                          {uploadStatus === 'success' && (
                            <div style={{ display: 'flex', alignItems: 'center', color: '#10b981', marginTop: '1rem', fontSize: '0.9rem' }}>
                              <CheckCircle size={16} style={{ marginRight: '0.5rem' }} /> อัปโหลดเสร็จสมบูรณ์ ระบบกรอกลิงก์ให้แล้ว
                            </div>
                          )}
                          {uploadStatus === 'error' && (
                            <div style={{ display: 'flex', alignItems: 'center', color: '#ef4444', marginTop: '1rem', fontSize: '0.9rem' }}>
                              <AlertCircle size={16} style={{ marginRight: '0.5rem' }} /> เกิดข้อผิดพลาดในการอัปโหลด
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <label className={styles.field} style={{ marginTop: '1.5rem' }}>
                    <span className={styles.label}>ลิงก์สำรอง Google Drive (ใส่เองเมื่อจำเป็น)</span>
                    <input type="text" className={styles.input} placeholder="https://drive.google.com/file/d/..." value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--fg-3)', marginTop: '4px' }}>ใช้ในกรณีฉุกเฉินหรือต้องการวางลิงก์ด้วยตัวเอง (ระบบอัปโหลดไฟล์ขนาดใหญ่กว่า 50MB ขึ้น Drive อัตโนมัติอยู่แล้ว)</span>
                  </label>
                  
                  <div style={{ display: 'none' }}>
                    {/* Hidden inputs to store IDs manually if needed */}
                    <input type="hidden" value={telegramFileId} />
                    <input type="hidden" value={telegramUrl} />
                  </div>
                </fieldset>

                {/* 2.2 หน้าปก */}
                <fieldset className={styles.block} style={{ margin: 0 }}>
                  <legend className={styles.blockTitle}>ภาพหน้าปก</legend>
                  
                  <div className={styles.preview}>
                    <BookCover src={coverUrl} title={values.title || 'ชื่อหนังสือ'} author={values.author || 'ผู้แต่ง'} />
                  </div>

                  <label className={styles.field}>
                    <span className={styles.label}>อัปโหลดรูปปก (อัตโนมัติ)</span>
                    <input type="file" accept="image/*" className={styles.input} onChange={handleImageUpload} disabled={uploadingImage} style={{ padding: '0.4rem' }} />
                  </label>
                  {uploadingImage && <p style={{ fontSize: '12px', color: 'var(--brand)', marginBottom: '0.5rem' }}>กำลังอัปโหลด...</p>}
                  
                  <div style={{ textAlign: 'center', margin: '0.5rem 0', color: 'var(--fg-3)', fontSize: '12px' }}>หรือวางลิงก์</div>

                  <label className={styles.field}>
                    <span className={styles.label}>ลิงก์รูปปก</span>
                    <input type="text" className={styles.input} placeholder="https://…" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
                  </label>

                  {note && <p className={styles.err}>{note}</p>}
                </fieldset>
              </div>

              {/* 3. รายละเอียดเพิ่มเติม (Additional Details) */}
              <fieldset className={styles.block}>
                <legend className={styles.blockTitle}>รายละเอียดเพิ่มเติม</legend>
                <div className={styles.fieldGrid}>
                  {fields.filter(f => f.key !== 'title' && f.key !== 'description').map((field) => (
                    <label key={field.key} className={`${styles.field} ${field.type === 'textarea' ? styles.wide : ''}`}>
                      <span className={styles.label}>{field.label}</span>
                      {field.type === 'textarea' ? (
                        <textarea rows={4} className={styles.input} value={values[field.key] || ''} onChange={(e) => set(field.key, e.target.value)} />
                      ) : field.type === 'bool' ? (
                        <select className={styles.input} value={values[field.key] ?? 'false'} onChange={(e) => set(field.key, e.target.value === 'true')}>
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
                        <input type={field.type === 'number' ? 'number' : 'text'} className={styles.input} value={values[field.key] || ''} onChange={(e) => set(field.key, e.target.value)} />
                      )}
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* 4. การตั้งค่า (Settings) */}
              <fieldset className={styles.block}>
                <legend className={styles.blockTitle}>การมองเห็น</legend>
                <label className={styles.toggle} style={{ marginTop: '0' }}>
                  <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
                  <span>
                    <strong>สงวนสิทธิ์</strong>
                    <em>เปิดให้เฉพาะสมาชิกเท่านั้น</em>
                  </span>
                </label>
              </fieldset>

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
