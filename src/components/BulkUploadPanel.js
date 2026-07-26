'use client';

import { useEffect, useState, useRef } from 'react';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import CreatableSelect from 'react-select/creatable';
import { selectStyles } from '@/lib/selectStyles';
import { getNextBookId } from '@/lib/sequentialId';
import { getDropdownSettings } from '@/lib/settings';
import { X, UploadCloud, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import styles from './BookFormPanel.module.css';

export default function BulkUploadPanel({ isOpen, onClose, onSaved }) {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [options, setOptions] = useState({});
  const [loadingSettings, setLoadingSettings] = useState(false);
  
  // Default Settings for Bulk
  const [defaultCategory, setDefaultCategory] = useState('');
  const [defaultAuthor, setDefaultAuthor] = useState('');
  const [defaultLanguage, setDefaultLanguage] = useState('');
  const [restricted, setRestricted] = useState(false);

  // Files State
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
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

  // Lock body scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Load Settings options
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    
    const fetchData = async () => {
      setLoadingSettings(true);
      try {
        const [settings, snap] = await Promise.all([
          getDropdownSettings(),
          getDocs(collection(db, 'books'))
        ]);
        
        if (!isMounted) return;
        const { categories: predefinedCategories, languages: predefinedLanguages } = settings;

        const opts = { author: new Set(), category: new Set(), language: new Set() };
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

        setOptions(formattedOpts);
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        if (isMounted) setLoadingSettings(false);
      }
    };
    
    fetchData();
    return () => { isMounted = false; };
  }, [isOpen]);

  // Dropzone Handlers
  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFilesSelection(Array.from(e.dataTransfer.files));
    }
  };
  const onFileChange = (e) => {
    if (e.target.files) {
      handleFilesSelection(Array.from(e.target.files));
    }
  };

  const handleFilesSelection = (selectedFiles) => {
    const validFiles = selectedFiles.filter(f => f.type === 'application/pdf');
    if (validFiles.length < selectedFiles.length) {
      toast.error('ไฟล์บางอันไม่ใช่ PDF จึงถูกคัดออก');
    }
    
    const newFiles = validFiles.map((file) => ({
      id: Math.random().toString(36).substring(7),
      file,
      title: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
      status: 'pending', // pending, uploading, success, error
      tgProgress: 0,
      driveProgress: 0,
      error: ''
    }));

    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id) => {
    if (uploading) return;
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  // Upload Logic
  const startUpload = async () => {
    if (files.length === 0) return;
    if (!googleToken) {
      toast.error('กรุณาลงชื่อเข้าใช้ Google Drive ก่อนเริ่มอัปโหลด');
      return;
    }

    setUploading(true);
    
    try {
      const idToken = await user.getIdToken();
      const confRes = await fetch(`/api/admin/config?token=${idToken}`);
      const conf = await confRes.json();
      if (!confRes.ok) throw new Error(conf.error || 'Failed to get Telegram config');
      if (!conf.telegramBotToken || !conf.telegramChatId) throw new Error('Telegram Bot Token ไม่พร้อมใช้งาน');

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
            else reject(new Error(`Status ${xhr.status}`));
          };
          xhr.onerror = () => reject(new Error('Network Error'));
          xhr.send(body);
        });
      };

      // Process sequentially to avoid memory/network overload
      for (let i = 0; i < files.length; i++) {
        if (files[i].status === 'success') continue; // Skip already uploaded
        
        const f = files[i];
        
        setFiles(prev => prev.map(item => item.id === f.id ? { ...item, status: 'uploading' } : item));

        try {
          const isLargeFile = f.file.size > 50 * 1024 * 1024;
          let telegramFileId = '';
          let driveUrl = '';

          // Update progress wrapper
          const updateProgress = (type, progress) => {
            setFiles(prev => prev.map(item => item.id === f.id ? { ...item, [type]: progress } : item));
          };

          // 1. Telegram
          if (!isLargeFile) {
            const tgFormData = new FormData();
            tgFormData.append('chat_id', conf.telegramChatId);
            tgFormData.append('document', f.file);
            
            const tgResult = await uploadWithProgress(
              `https://api.telegram.org/bot${conf.telegramBotToken}/sendDocument`,
              'POST', {}, tgFormData,
              (p) => updateProgress('tgProgress', p)
            );
            
            if (tgResult.ok && tgResult.result.document) {
              telegramFileId = tgResult.result.document.file_id;
            } else {
              throw new Error('Telegram rejected');
            }
          } else {
            updateProgress('tgProgress', 100);
          }

          // 2. Google Drive
          const metadata = { name: f.file.name, mimeType: 'application/pdf' };
          const initRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${googleToken}`,
              'Content-Type': 'application/json',
              'X-Upload-Content-Type': 'application/pdf',
              'X-Upload-Content-Length': f.file.size
            },
            body: JSON.stringify(metadata)
          });
          
          if (!initRes.ok) {
            const errText = await initRes.text();
            throw new Error(`Drive Init Failed (${initRes.status}): ${errText}`);
          }
          const uploadUrl = initRes.headers.get('Location');
          
          const driveResult = await uploadWithProgress(
            uploadUrl, 'PUT', { 'Content-Type': 'application/pdf' }, f.file,
            (p) => updateProgress('driveProgress', p)
          );
          
          if (driveResult.id) {
            await fetch(`https://www.googleapis.com/drive/v3/files/${driveResult.id}/permissions`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${googleToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ role: 'reader', type: 'anyone' })
            });
            driveUrl = `https://drive.google.com/file/d/${driveResult.id}/view`;
          } else {
            throw new Error('Drive upload failed');
          }

          // 3. Save to Firestore
          const finalId = await getNextBookId();
          const payload = {
            title: f.title,
            author: defaultAuthor || '',
            category: defaultCategory || 'ทั่วไป',
            language: defaultLanguage || 'ภาษาไทย',
            restricted,
            telegramFileId,
            driveUrl,
            telegramUrl: '',
            coverUrl: '',
            createdAt: new Date(),
            downloadCount: 0,
            format: 'PDF',
            size: (f.file.size / (1024 * 1024)).toFixed(2) + ' MB'
          };

          await setDoc(doc(db, 'books', finalId), payload);
          if (onSaved) onSaved({ id: finalId, ...payload });

          setFiles(prev => prev.map(item => item.id === f.id ? { ...item, status: 'success' } : item));

        } catch (fileErr) {
          console.error(fileErr);
          setFiles(prev => prev.map(item => item.id === f.id ? { ...item, status: 'error', error: fileErr.message } : item));
        }
      }

      toast.success('กระบวนการ Bulk Upload เสร็จสิ้น');
    } catch (err) {
      console.error(err);
      toast.error('ระบบเกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (uploading) {
      if (!confirm('การอัปโหลดกำลังทำงานอยู่ หากปิดตอนนี้การอัปโหลดที่เหลือจะถูกยกเลิก แน่ใจหรือไม่?')) return;
    }
    // Clean up
    setFiles([]);
    setUploading(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={handleClose} />
      <div className={styles.panel} style={{ maxWidth: '800px', width: '90vw' }}>
        <div className={styles.header}>
          <h2 className={styles.title}>อัปโหลดหลายเล่ม (Bulk Upload)</h2>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            {/* Settings Column */}
            <fieldset className={styles.block} style={{ marginBottom: 0 }}>
              <legend className={styles.blockTitle}>ตั้งค่าเริ่มต้นสำหรับหนังสือทุกเล่ม</legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label>
                  <div style={{ fontSize: '0.85rem', color: 'var(--fg-2)', marginBottom: '0.3rem' }}>หมวดหมู่เริ่มต้น</div>
                  <CreatableSelect
                    isClearable
                    styles={selectStyles}
                    options={options.category || []}
                    value={defaultCategory ? { value: defaultCategory, label: defaultCategory } : null}
                    onChange={(selected) => setDefaultCategory(selected ? selected.value : '')}
                    placeholder="ค้นหาหรือเพิ่มใหม่..."
                  />
                </label>
                <label>
                  <div style={{ fontSize: '0.85rem', color: 'var(--fg-2)', marginBottom: '0.3rem' }}>ผู้แต่งเริ่มต้น</div>
                  <CreatableSelect
                    isClearable
                    styles={selectStyles}
                    options={options.author || []}
                    value={defaultAuthor ? { value: defaultAuthor, label: defaultAuthor } : null}
                    onChange={(selected) => setDefaultAuthor(selected ? selected.value : '')}
                    placeholder="เว้นว่างได้..."
                  />
                </label>
                <label>
                  <div style={{ fontSize: '0.85rem', color: 'var(--fg-2)', marginBottom: '0.3rem' }}>ภาษาเริ่มต้น</div>
                  <CreatableSelect
                    isClearable
                    styles={selectStyles}
                    options={options.language || []}
                    value={defaultLanguage ? { value: defaultLanguage, label: defaultLanguage } : null}
                    onChange={(selected) => setDefaultLanguage(selected ? selected.value : '')}
                    placeholder="ภาษาไทย..."
                  />
                </label>
                <label className={styles.toggle} style={{ marginTop: '0.5rem' }}>
                  <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
                  <span><strong>สงวนสิทธิ์</strong> <em>(เฉพาะสมาชิก)</em></span>
                </label>
              </div>
            </fieldset>

            {/* Dropzone Column */}
            <fieldset className={styles.block} style={{ marginBottom: 0 }}>
              <legend className={styles.blockTitle}>เลือกไฟล์ PDF (เพิ่มได้เรื่อยๆ)</legend>
              
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: googleToken ? '#10b98120' : '#3b82f620', borderRadius: '8px', border: `1px solid ${googleToken ? '#10b98140' : '#3b82f640'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: googleToken ? '#10b981' : '#ef4444' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--fg-1)' }}>
                    Google Drive API: {googleToken ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}
                  </span>
                </div>
                {!googleToken ? (
                  <button type="button" onClick={handleGoogleAuth} style={{ padding: '0.3rem 0.8rem', background: '#3b82f6', color: 'white', borderRadius: '4px', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>
                    เชื่อมต่อเลย
                  </button>
                ) : (
                  <button type="button" onClick={handleGoogleAuth} style={{ padding: '0.3rem 0.8rem', background: 'transparent', color: 'var(--fg-2)', borderRadius: '4px', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '0.8rem' }}>
                    ต่ออายุสิทธิ์
                  </button>
                )}
              </div>

              <div 
                className={`${styles.dropzone} ${isDragging ? styles.dragging : ''}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                style={{
                  border: isDragging ? '2px dashed var(--brand)' : '2px dashed var(--border)',
                  padding: '2rem',
                  textAlign: 'center',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: isDragging ? 'var(--bg-2)' : 'transparent',
                  height: googleToken ? '100%' : 'auto'
                }}
                onClick={() => document.getElementById('bulkPdfInput').click()}
              >
                <input type="file" id="bulkPdfInput" accept="application/pdf" multiple style={{ display: 'none' }} onChange={onFileChange} />
                <UploadCloud size={32} style={{ color: 'var(--brand)', marginBottom: '0.5rem' }} />
                <p style={{ margin: 0, fontWeight: 'bold' }}>ลากไฟล์ PDF หลายไฟล์มาวางที่นี่</p>
                <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem', color: 'var(--fg-3)' }}>ชื่อไฟล์จะถูกใช้เป็น "ชื่อหนังสือ" อัตโนมัติ</p>
              </div>
            </fieldset>
          </div>

          {/* Files List */}
          {files.length > 0 && (
            <div style={{ background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1rem' }}>รายการไฟล์ ({files.length} เล่ม)</h3>
                {!uploading && (
                  <button type="button" onClick={() => setFiles([])} style={{ background: 'none', border: 'none', color: 'var(--hot)', cursor: 'pointer' }}>ล้างทั้งหมด</button>
                )}
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: '40vh', overflowY: 'auto' }}>
                {files.map(f => (
                  <li key={f.id} style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <div style={{ fontWeight: '500', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.title}</div>
                        <div style={{ color: 'var(--fg-3)', fontSize: '0.85rem', flexShrink: 0, marginLeft: '1rem' }}>{(f.file.size / (1024*1024)).toFixed(2)} MB</div>
                      </div>
                      
                      {f.status === 'uploading' && (
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.75rem', marginBottom: '2px', display: 'flex', justifyContent: 'space-between' }}><span>Telegram</span><span>{f.tgProgress}%</span></div>
                            <div style={{ height: '4px', background: 'var(--bg-1)', borderRadius: '2px', overflow: 'hidden' }}><div style={{ width: `${f.tgProgress}%`, height: '100%', background: 'var(--brand)', transition: 'width 0.2s' }} /></div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.75rem', marginBottom: '2px', display: 'flex', justifyContent: 'space-between' }}><span>Drive</span><span>{f.driveProgress}%</span></div>
                            <div style={{ height: '4px', background: 'var(--bg-1)', borderRadius: '2px', overflow: 'hidden' }}><div style={{ width: `${f.driveProgress}%`, height: '100%', background: '#10b981', transition: 'width 0.2s' }} /></div>
                          </div>
                        </div>
                      )}
                      
                      {f.status === 'success' && <div style={{ fontSize: '0.85rem', color: '#10b981', display: 'flex', alignItems: 'center' }}><CheckCircle size={14} style={{ marginRight: '4px' }} /> อัปโหลดสำเร็จ</div>}
                      {f.status === 'error' && <div style={{ fontSize: '0.85rem', color: '#ef4444', display: 'flex', alignItems: 'center' }}><AlertCircle size={14} style={{ marginRight: '4px' }} /> {f.error}</div>}
                    </div>
                    
                    {f.status === 'pending' && !uploading && (
                      <button type="button" onClick={() => removeFile(f.id)} style={{ background: 'none', border: 'none', color: 'var(--fg-3)', cursor: 'pointer' }}><X size={18} /></button>
                    )}
                    {f.status === 'uploading' && <Loader2 size={18} style={{ color: 'var(--brand)', animation: 'spin 2s linear infinite' }} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        
        <div className={styles.footer}>
          <button type="button" className="btn" onClick={handleClose} disabled={uploading}>ปิด</button>
          <button 
            type="button" 
            className="btn btn-solid" 
            onClick={startUpload} 
            disabled={uploading || files.length === 0 || files.every(f => f.status === 'success')}
          >
            {uploading ? 'กำลังอัปโหลด...' : 'เริ่มอัปโหลดไฟล์ทั้งหมด'}
          </button>
        </div>
      </div>
    </>
  );
}
