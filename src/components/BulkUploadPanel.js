'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import DriveStatus from '@/components/DriveStatus';
import { useToast } from '@/context/ToastContext';
import CreatableSelect from 'react-select/creatable';
import { selectStyles } from '@/lib/selectStyles';
import { getNextBookId } from '@/lib/sequentialId';
import { getDropdownSettings } from '@/lib/settings';
import { uploadPdfToDrive } from '@/lib/googleDrive';
import { mirrorToTelegram, canMirror } from '@/lib/mirror';
import { useAuth } from '@/context/AuthContext';
import { X, UploadCloud, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import styles from './BookFormPanel.module.css';

export default function BulkUploadPanel({ isOpen, onClose, onSaved }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [mirrorBackup, setMirrorBackup] = useState(true);

  const [options, setOptions] = useState({});

  // Defaults applied to every book in the batch
  const [defaultCategory, setDefaultCategory] = useState('');
  const [defaultAuthor, setDefaultAuthor] = useState('');
  const [defaultLanguage, setDefaultLanguage] = useState('');
  const [restricted, setRestricted] = useState(false);

  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [googleToken, setGoogleToken] = useState(null);

  // Set when the panel closes mid-run so the loop can stop cleanly instead of
  // writing books for a batch the owner already walked away from.
  const cancelled = useRef(false);

  const handleToken = useCallback((value) => setGoogleToken(value), []);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Load dropdown options
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;
    cancelled.current = false;

    const fetchData = async () => {
      try {
        const [settings, snap] = await Promise.all([
          getDropdownSettings(),
          getDocs(collection(db, 'books')),
        ]);
        if (!isMounted) return;

        const { categories: predefinedCategories, languages: predefinedLanguages } = settings;

        const opts = { author: new Set(), category: new Set(), language: new Set() };
        snap.forEach((dSnap) => {
          const d = dSnap.data();
          Object.keys(opts).forEach((k) => {
            if (d[k] !== undefined && d[k] !== null && d[k] !== '') opts[k].add(String(d[k]));
          });
        });

        const formattedOpts = {};
        Object.keys(opts).forEach((k) => {
          formattedOpts[k] = Array.from(opts[k]).sort().map((v) => ({ value: v, label: v }));
        });

        const dynamicCats = formattedOpts.category.filter(
          (c) => !predefinedCategories.some((g) => g.options?.some((o) => o.value === c.value))
        );
        formattedOpts.category = [...predefinedCategories];
        if (dynamicCats.length > 0) {
          formattedOpts.category.push({ label: 'หมวดหมู่อื่นๆ', options: dynamicCats });
        }

        const dynamicLangs = formattedOpts.language.filter(
          (l) => !predefinedLanguages.some((p) => p.value === l.value)
        );
        formattedOpts.language = [...predefinedLanguages, ...dynamicLangs];

        setOptions(formattedOpts);
      } catch (err) {
        console.error('Error fetching data:', err);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, [isOpen]);

  // Dropzone
  const onDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) handleFilesSelection(Array.from(e.dataTransfer.files));
  };
  const onFileChange = (e) => {
    if (e.target.files) handleFilesSelection(Array.from(e.target.files));
    e.target.value = '';
  };

  const handleFilesSelection = (selectedFiles) => {
    const validFiles = selectedFiles.filter((f) => f.type === 'application/pdf');
    if (validFiles.length < selectedFiles.length) {
      toast.error('ไฟล์บางอันไม่ใช่ PDF จึงถูกคัดออก');
    }

    setFiles((prev) => [
      ...prev,
      ...validFiles.map((file) => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        title: file.name.replace(/\.[^/.]+$/, ''),
        status: 'pending', // pending | uploading | success | error
        progress: 0,
        error: '',
      })),
    ]);
  };

  const removeFile = (id) => {
    if (uploading) return;
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const patch = (id, changes) =>
    setFiles((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));

  const startUpload = async () => {
    if (files.length === 0) return;
    if (!googleToken) {
      toast.error('กรุณาเชื่อมต่อ Google Drive ก่อนเริ่มอัปโหลด');
      return;
    }

    setUploading(true);
    cancelled.current = false;

    // Snapshot the queue up front. Reading files[i].status inside the loop only
    // ever saw the stale closure, so a retry re-uploaded everything.
    const queue = files.filter((f) => f.status !== 'success');
    let done = 0;
    let failed = 0;

    // Sequential on purpose: a dozen parallel PDF uploads starve the tab.
    for (const f of queue) {
      if (cancelled.current) break;
      patch(f.id, { status: 'uploading', error: '', progress: 0 });

      try {
        const { url } = await uploadPdfToDrive({
          token: googleToken,
          file: f.file,
          name: f.title,
          onProgress: (p) => patch(f.id, { progress: p }),
        });

        if (cancelled.current) break;

        // A backup copy, if the file is inside Telegram's 20MB fetch ceiling.
        // Telegram pulls it from the Drive link, so this costs one small
        // request rather than a second upload of the whole file.
        let telegramFileId = '';
        if (mirrorBackup && canMirror(f.file.size)) {
          patch(f.id, { stage: 'mirror' });
          const idToken = await user.getIdToken();
          const mirrored = await mirrorToTelegram({
            idToken,
            driveUrl: url,
            title: f.title,
            sizeBytes: f.file.size,
            persist: false,
          });
          if (mirrored.ok) telegramFileId = mirrored.fileId;
          else console.warn('Mirror skipped:', mirrored.error);
        }

        const finalId = await getNextBookId();
        const payload = {
          title: f.title,
          author: defaultAuthor || '',
          category: defaultCategory || 'ทั่วไป',
          language: defaultLanguage || 'ภาษาไทย',
          restricted,
          driveUrl: url,
          telegramFileId,
          telegramUrl: '',
          coverUrl: '',
          createdAt: new Date(),
          downloadCount: 0,
          format: 'PDF',
          sizeBytes: f.file.size,
          size: `${(f.file.size / (1024 * 1024)).toFixed(2)} MB`,
        };

        await setDoc(doc(db, 'books', finalId), payload);
        onSaved?.({ id: finalId, ...payload });

        patch(f.id, { status: 'success', progress: 100, stage: '', mirrored: Boolean(telegramFileId) });
        done += 1;
      } catch (fileErr) {
        console.error(fileErr);
        patch(f.id, { status: 'error', error: fileErr.message });
        failed += 1;
      }
    }

    setUploading(false);

    if (cancelled.current) return;
    if (failed === 0) toast.success(`อัปโหลดสำเร็จทั้งหมด ${done} เล่ม`);
    else toast.error(`สำเร็จ ${done} เล่ม · ไม่สำเร็จ ${failed} เล่ม`);
  };

  const handleClose = () => {
    if (uploading) {
      if (!confirm('การอัปโหลดกำลังทำงานอยู่ หากปิดตอนนี้ไฟล์ที่เหลือจะถูกยกเลิก แน่ใจหรือไม่?')) return;
      cancelled.current = true;
    }
    setFiles([]);
    setUploading(false);
    onClose();
  };

  if (!isOpen) return null;

  const pending = files.filter((f) => f.status !== 'success').length;

  return (
    <>
      <div className={styles.backdrop} onClick={handleClose} />
      <div className={styles.panel} style={{ maxWidth: '820px', width: '92vw' }}>
        <div className={styles.header}>
          <h2 className={styles.title}>อัปโหลดหลายเล่ม</h2>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="ปิด">
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          <DriveStatus active={isOpen} onToken={handleToken} />

          <div className={styles.filesGrid}>
            {/* Defaults */}
            <fieldset className={styles.block} style={{ marginBottom: 0 }}>
              <legend className={styles.blockTitle}>ตั้งค่าเริ่มต้นสำหรับทุกเล่ม</legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <label className={styles.field}>
                  <span className={styles.label}>หมวดหมู่</span>
                  <CreatableSelect
                    isClearable
                    styles={selectStyles}
                    options={options.category || []}
                    value={defaultCategory ? { value: defaultCategory, label: defaultCategory } : null}
                    onChange={(s) => setDefaultCategory(s ? s.value : '')}
                    placeholder="ค้นหาหรือเพิ่มใหม่..."
                    classNamePrefix="react-select"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>ผู้แต่ง</span>
                  <CreatableSelect
                    isClearable
                    styles={selectStyles}
                    options={options.author || []}
                    value={defaultAuthor ? { value: defaultAuthor, label: defaultAuthor } : null}
                    onChange={(s) => setDefaultAuthor(s ? s.value : '')}
                    placeholder="เว้นว่างได้..."
                    classNamePrefix="react-select"
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>ภาษา</span>
                  <CreatableSelect
                    isClearable
                    styles={selectStyles}
                    options={options.language || []}
                    value={defaultLanguage ? { value: defaultLanguage, label: defaultLanguage } : null}
                    onChange={(s) => setDefaultLanguage(s ? s.value : '')}
                    placeholder="ภาษาไทย..."
                    classNamePrefix="react-select"
                  />
                </label>
                <label className={styles.toggle} style={{ marginTop: '0.25rem' }}>
                  <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
                  <span>
                    <strong>สงวนสิทธิ์</strong>
                    <em>เปิดให้เฉพาะสมาชิกที่ได้รับอนุมัติ</em>
                  </span>
                </label>

                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={mirrorBackup}
                    onChange={(e) => setMirrorBackup(e.target.checked)}
                  />
                  <span>
                    <strong>สำรองไปที่ Telegram ด้วย</strong>
                    <em>เฉพาะไฟล์ไม่เกิน 20MB · ใช้เปิดแทนเมื่อ Drive มีปัญหา</em>
                  </span>
                </label>
              </div>
            </fieldset>

            {/* Dropzone */}
            <fieldset className={styles.block} style={{ marginBottom: 0 }}>
              <legend className={styles.blockTitle}>เลือกไฟล์ PDF</legend>
              <div
                className={`${styles.dropzone} ${isDragging ? styles.dragging : ''}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => document.getElementById('bulkPdfInput')?.click()}
              >
                <input
                  type="file"
                  id="bulkPdfInput"
                  accept="application/pdf"
                  multiple
                  style={{ display: 'none' }}
                  onChange={onFileChange}
                />
                <UploadCloud size={30} className={styles.dropIcon} />
                <div className={styles.dropLead}>ลากไฟล์ PDF หลายไฟล์มาวางที่นี่</div>
                <div className={styles.dropHint}>
                  ชื่อไฟล์จะกลายเป็นชื่อหนังสือ · อัปขึ้น Google Drive ทีละเล่มตามลำดับ
                </div>
              </div>
            </fieldset>
          </div>

          {/* Queue */}
          {files.length > 0 && (
            <div className={styles.queue}>
              <div className={styles.queueHead}>
                <h3 className={styles.queueTitle}>รายการไฟล์ ({files.length} เล่ม)</h3>
                {!uploading && (
                  <button type="button" className={styles.queueClear} onClick={() => setFiles([])}>
                    ล้างทั้งหมด
                  </button>
                )}
              </div>
              <ul className={styles.queueList}>
                {files.map((f) => (
                  <li key={f.id} className={styles.queueRow}>
                    <div className={styles.queueBody}>
                      <div className={styles.uploadHead}>
                        <span className={styles.uploadName}>{f.title}</span>
                        <span className={styles.uploadSize}>
                          {(f.file.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>

                      {f.status === 'uploading' && (
                        <>
                          <div className={styles.progressRow}>
                            <span>{f.stage === 'mirror' ? 'กำลังสำรองไปที่ Telegram' : 'Google Drive'}</span>
                            <span>{f.progress}%</span>
                          </div>
                          <div className={styles.progressTrack}>
                            <div className={styles.progressFill} style={{ width: `${f.progress}%` }} />
                          </div>
                        </>
                      )}
                      {f.status === 'success' && (
                        <p className={styles.uploadOk}>
                          <CheckCircle size={14} />
                          {f.mirrored ? 'อัปโหลด + สำรองแล้ว' : 'อัปโหลดสำเร็จ'}
                        </p>
                      )}
                      {f.status === 'error' && (
                        <p className={styles.uploadFail}><AlertCircle size={14} /> {f.error}</p>
                      )}
                    </div>

                    {f.status === 'pending' && !uploading && (
                      <button
                        type="button"
                        onClick={() => removeFile(f.id)}
                        className={styles.queueRemove}
                        aria-label={`เอา ${f.title} ออก`}
                      >
                        <X size={17} />
                      </button>
                    )}
                    {f.status === 'uploading' && <Loader2 size={17} className={styles.spin} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <button type="button" className="btn" onClick={handleClose}>
            {uploading ? 'หยุดและปิด' : 'ปิด'}
          </button>
          <button
            type="button"
            className="btn btn-solid"
            onClick={startUpload}
            disabled={uploading || !googleToken || pending === 0}
          >
            {uploading ? 'กำลังอัปโหลด…' : `เริ่มอัปโหลด ${pending} เล่ม`}
          </button>
        </div>
      </div>
    </>
  );
}
