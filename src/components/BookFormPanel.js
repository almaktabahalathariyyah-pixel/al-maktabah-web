'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { collection, getDocs, getDoc, setDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { loadBookFields } from '@/lib/bookFields';
import BookCover from '@/components/BookCover';
import DriveStatus from '@/components/DriveStatus';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useAuth } from '@/context/AuthContext';
import CreatableSelect from 'react-select/creatable';
import { selectStyles } from '@/lib/selectStyles';
import { getNextBookId } from '@/lib/sequentialId';
import { getDropdownSettings, rememberDropdowns } from '@/lib/settings';
import { uploadPdfToDrive } from '@/lib/googleDrive';
import { mirrorToTelegram, canMirror, bookSizeBytes } from '@/lib/mirror';
import { asList } from '@/lib/people';
import { X, UploadCloud, CheckCircle, AlertCircle, FileText, Lock, LifeBuoy } from 'lucide-react';
import styles from './BookFormPanel.module.css';

/** Fields the form owns directly; everything else comes from the schema. */
const RESERVED = ['coverUrl', 'telegramUrl', 'telegramFileId', 'driveUrl', 'driveOwner', 'restricted', 'createdAt'];

export default function BookFormPanel({ isOpen, onClose, bookId = null, onSaved }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { user } = useAuth();

  const [fields, setFields] = useState(null);
  const [values, setValues] = useState({});
  const [restricted, setRestricted] = useState(false);
  const [coverUrl, setCoverUrl] = useState('');

  const [telegramUrl, setTelegramUrl] = useState('');
  const [telegramFileId, setTelegramFileId] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  // The Google account the file sits in: what was recorded when the book was
  // saved, and what is connected right now. They can differ.
  const [driveOwner, setDriveOwner] = useState('');
  const [connectedOwner, setConnectedOwner] = useState('');

  const [options, setOptions] = useState({});
  // What the saved lists already hold — the dropdown offers more than this
  // (every value harvested from the books), so only these count as "known"
  // when deciding whether a save has something new to announce.
  const known = useRef(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [note, setNote] = useState('');

  // Uploader state. Google Drive only — see startUpload.
  const [isDragging, setIsDragging] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  const [driveProgress, setDriveProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle | uploading | success | error
  const [uploadError, setUploadError] = useState('');
  const [googleToken, setGoogleToken] = useState(null);

  // Telegram backup copy
  const [mirroring, setMirroring] = useState(false);
  const [mirrorNote, setMirrorNote] = useState('');
  const [sizeBytes, setSizeBytes] = useState(0);

  const handleToken = useCallback((value) => setGoogleToken(value), []);
  const handleAccount = useCallback((value) => setConnectedOwner(value), []);

  // The freshly picked file knows its own size; a saved book carries it.
  const fileBytes = pdfFile?.size || sizeBytes;
  const mirrorEligible = canMirror(fileBytes);

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
        const {
          categories: predefinedCategories,
          languages: predefinedLanguages,
          types: predefinedTypes,
          authors: predefinedAuthors,
          translators: predefinedTranslators,
          publishers: predefinedPublishers,
        } = settings;

        known.current = {
          authors: new Set(predefinedAuthors),
          translators: new Set(predefinedTranslators),
          publishers: new Set(predefinedPublishers),
          types: new Set(predefinedTypes),
          // A language is stored as {value,label} and a category as groups of
          // them, so both are flattened to the plain value being compared.
          languages: new Set(predefinedLanguages.map((l) => l?.value ?? l)),
          categories: new Set(
            predefinedCategories.flatMap((g) => (g?.options || []).map((o) => o?.value)).filter(Boolean)
          ),
        };

        const opts = { author: new Set(), category: new Set(), publisher: new Set(), translator: new Set(), language: new Set(), type: new Set(), year: new Set() };
        snap.forEach(dSnap => {
          const d = dSnap.data();
          Object.keys(opts).forEach(k => {
            // A book with two authors contributes both to the dropdown.
            // String(d[k]) on an array would have offered "A,B" as one name.
            asList(d[k]).forEach((value) => opts[k].add(value));
          });
        });

        const formattedOpts = {};
        Object.keys(opts).forEach(k => {
          formattedOpts[k] = Array.from(opts[k]).sort().map(v => ({ value: v, label: v }));
        });

        // A category group saved without an options array must not crash the form.
        const dynamicCats = formattedOpts.category.filter(c => !predefinedCategories.some(g => g.options?.some(o => o.value === c.value)));
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
            setDriveOwner(data.driveOwner || '');
            setRestricted(data.restricted || false);
            setSizeBytes(bookSizeBytes(data));

            const vals = {};
            for (const key of Object.keys(data)) {
              if (!RESERVED.includes(key)) vals[key] = data[key];
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
          setDriveOwner('');
          setRestricted(false);
          setPdfFile(null);
          setUploadStatus('idle');
          setUploadError('');
          setDriveProgress(0);
          setSizeBytes(0);
          setMirrorNote('');
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
    if (e.dataTransfer.files?.[0]) handleFileSelection(e.dataTransfer.files[0]);
  };
  const onFileChange = (e) => {
    if (e.target.files?.[0]) handleFileSelection(e.target.files[0]);
  };

  const handleFileSelection = (file) => {
    if (file.type !== 'application/pdf') {
      toast.error('รองรับเฉพาะไฟล์ PDF เท่านั้น');
      return;
    }
    setPdfFile(file);
    setUploadStatus('idle');
    setUploadError('');
    setDriveProgress(0);
  };

  const startUpload = async () => {
    if (!pdfFile) return;
    if (!googleToken) {
      toast.error('กรุณาเชื่อมต่อ Google Drive ก่อนเริ่มอัปโหลด');
      return;
    }

    setUploadStatus('uploading');
    setUploadError('');
    setDriveProgress(0);

    try {
      // Straight from this browser to Drive. This used to fan out to Telegram
      // as well, which meant pulling the bot token into the page and living
      // with Telegram's 50MB upload / 20MB read-back ceiling.
      const { url } = await uploadPdfToDrive({
        token: googleToken,
        file: pdfFile,
        name: (values.title || pdfFile.name).trim(),
        onProgress: setDriveProgress,
      });

      setDriveUrl(url);
      // Stamp the account that actually received the file, not whichever one
      // happens to be connected when the form is next opened.
      if (connectedOwner) setDriveOwner(connectedOwner);
      setSizeBytes(pdfFile.size);
      setUploadStatus('success');
      toast.success(
        connectedOwner
          ? `อัปโหลดขึ้น Google Drive (${connectedOwner}) สำเร็จ`
          : 'อัปโหลดขึ้น Google Drive สำเร็จ'
      );
    } catch (err) {
      console.error(err);
      setUploadStatus('error');
      setUploadError(err.message);
      toast.error(err.message);
    }
  };

  /**
   * Copies the Drive file into the Telegram channel as a backup.
   * Persists only for a saved book; a brand-new one gets the id written with
   * the rest of the form on submit.
   */
  const runMirror = async () => {
    setMirroring(true);
    setMirrorNote('');
    try {
      const idToken = await user.getIdToken();
      const result = await mirrorToTelegram({
        idToken,
        bookId,
        driveUrl,
        title: values.title || 'book',
        sizeBytes: fileBytes,
        persist: Boolean(bookId),
      });

      if (result.ok) {
        setTelegramFileId(result.fileId);
        toast.success('สำรองไปที่ Telegram แล้ว');
      } else {
        setMirrorNote(result.error);
        toast.error(result.error);
      }
    } finally {
      setMirroring(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    const inputEl = e.target; // save reference before async
    if (!file) return;

    // 1. Show immediate preview using FileReader (instant feedback)
    const reader = new FileReader();
    reader.onload = (ev) => setCoverUrl(ev.target.result);
    reader.readAsDataURL(file);

    // 2. Store it in the Telegram channel, never in Drive — that quota belongs
    //    to the books, and covers would eat into it for no benefit.
    setUploadingImage(true);
    setNote('');

    try {
      const formData = new FormData();
      formData.append('image', file);
      const idToken = await user.getIdToken();

      const res = await fetch('/api/admin/upload-cover', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });
      const data = await res.json().catch(() => null);

      if (data?.success) {
        setCoverUrl(data.url);
        toast.success('อัปโหลดรูปปกสำเร็จ');
      } else {
        const reason = data?.error || `อัปโหลดรูปปกไม่สำเร็จ (${res.status})`;
        setNote(`${reason} — หรือวางลิงก์รูปปกเองด้านล่าง`);
        toast.error(reason);
      }
    } catch (err) {
      console.error('Upload cover error:', err);
      setNote(`${err.message} — ลองวางลิงก์รูปปกด้านล่างแทน`);
      toast.error(err.message || 'อัปโหลดรูปปกไม่สำเร็จ');
    } finally {
      setUploadingImage(false);
      try { inputEl.value = ''; } catch { /* ignore */ }
    }
  };

  /**
   * Anything typed into a dropdown joins the saved lists on save, so
   * /admin/names and the settings panel show it without anyone pressing
   * "ดึงจากหนังสือ". Costs a write only when the book introduces a new value.
   */
  const rememberNewValues = async (payload) => {
    if (!known.current) return;
    const seen = known.current;

    // Which book field feeds which list. asList covers both shapes: the multi
    // fields hand back an array, the plain selects a single string.
    const fresh = {
      authors: asList(payload.author),
      translators: asList(payload.translator),
      publishers: asList(payload.publisher),
      types: asList(payload.type),
      languages: asList(payload.language),
      categories: asList(payload.category),
    };
    for (const key of Object.keys(fresh)) {
      fresh[key] = fresh[key].filter((value) => !seen[key].has(value));
    }
    if (!Object.values(fresh).some((list) => list.length > 0)) return;

    if (await rememberDropdowns(fresh)) {
      // Saving the same book twice must not write the same values twice.
      for (const key of Object.keys(fresh)) fresh[key].forEach((value) => seen[key].add(value));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!values.title?.trim()) {
      setNote('กรุณากรอกชื่อหนังสือ');
      return;
    }
    // The base64 preview must never reach Firestore, but dropping it silently
    // meant saving before the background upload landed threw the cover away
    // with no hint that it had happened.
    if (uploadingImage) {
      setNote('รูปปกยังอัปโหลดไม่เสร็จ — รอสักครู่แล้วกดบันทึกอีกครั้ง');
      toast.info('รูปปกยังอัปโหลดไม่เสร็จ กรุณารอสักครู่');
      return;
    }
    if (coverUrl.startsWith('data:')) {
      const keepGoing = await confirm({
        title: 'บันทึกโดยไม่มีรูปปก?',
        message: 'รูปที่เลือกไว้ยังเก็บไม่สำเร็จ ถ้าบันทึกตอนนี้เล่มนี้จะแสดงปกตัวอักษรแทน',
        confirmLabel: 'บันทึกไปก่อน',
      });
      if (!keepGoing) return;
    }

    setSaving(true);
    setNote('');
    try {
      const finalCoverUrl = coverUrl.startsWith('data:') ? '' : coverUrl;
      const payload = { ...values, coverUrl: finalCoverUrl, telegramUrl, telegramFileId, driveUrl, driveOwner, restricted };

      // Numeric bytes, not only the "12.34 MB" string, so the mirror limit and
      // the storage projection never have to parse prose.
      if (fileBytes > 0) {
        payload.sizeBytes = fileBytes;
        payload.size = `${(fileBytes / (1024 * 1024)).toFixed(2)} MB`;
      }

      for (const field of fields) {
        if (field.type === 'number' && payload[field.key] !== undefined) {
          payload[field.key] = Number(payload[field.key]) || 0;
        }
        // Multi fields always land as an array, including the empty case, so
        // a book cannot flip between a string and a list across two saves.
        if (field.type === 'multi') {
          payload[field.key] = asList(payload[field.key]);
        }
      }

      let finalId = bookId;
      if (bookId) {
        await updateDoc(doc(db, 'books', bookId), payload);
        toast.success('บันทึกการแก้ไขเรียบร้อย');
      } else {
        payload.createdAt = new Date();
        payload.downloadCount = 0;
        finalId = await getNextBookId();
        await setDoc(doc(db, 'books', finalId), payload);
        toast.success('เพิ่มหนังสือใหม่เรียบร้อย');
      }

      await rememberNewValues(payload);

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

  /** One field, rendered from the schema. */
  const renderField = (field) => (
    <label key={field.key} className={`${styles.field} ${field.type === 'textarea' ? styles.wide : ''}`}>
      <span className={styles.label}>{field.label}</span>
      {field.type === 'textarea' ? (
        <textarea rows={4} className={styles.input} value={values[field.key] || ''} onChange={(e) => set(field.key, e.target.value)} />
      ) : field.type === 'bool' ? (
        <select className={styles.input} value={values[field.key] ?? 'false'} onChange={(e) => set(field.key, e.target.value === 'true')}>
          <option value="false">ไม่ใช่</option>
          <option value="true">ใช่</option>
        </select>
      ) : field.type === 'multi' ? (
        /* Several people on one book. Stored as an array, and read back
           through asList so a book still holding a single string opens with
           that name already in place. */
        <CreatableSelect
          isMulti
          isClearable
          styles={selectStyles}
          options={options[field.key] || []}
          value={asList(values[field.key]).map((v) => ({ value: v, label: v }))}
          onChange={(selected) => set(field.key, (selected || []).map((s) => s.value))}
          placeholder="ค้นหาหรือเพิ่มใหม่ เลือกได้หลายคน..."
          formatCreateLabel={(inputValue) => `เพิ่ม "${inputValue}"`}
          noOptionsMessage={() => 'พิมพ์เพื่อเพิ่มชื่อใหม่'}
          classNamePrefix="react-select"
        />
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
  );

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>{bookId ? 'แก้ไขหนังสือ' : 'เพิ่มหนังสือใหม่'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="ปิด">
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          {loading || !fields ? (
            <div className={styles.loadingState}>กำลังโหลดข้อมูล...</div>
          ) : (
            <form className={styles.formLayout} onSubmit={submit} onKeyDown={handleKeyDown}>

              {/* 1. ข้อมูลทั่วไป */}
              <fieldset className={styles.block}>
                <legend className={styles.blockTitle}>ข้อมูลทั่วไป</legend>
                <div className={styles.fieldGrid}>
                  {fields.filter(f => f.key === 'title' || f.key === 'description').map(renderField)}
                </div>
              </fieldset>

              {/* 2. ไฟล์และหน้าปก */}
              <div className={styles.filesGrid}>

                {/* 2.1 ไฟล์ PDF */}
                <fieldset className={styles.block} style={{ margin: 0 }}>
                  <legend className={styles.blockTitle}>ไฟล์ PDF</legend>

                  <DriveStatus active={isOpen} onToken={handleToken} onAccount={handleAccount} />

                  {restricted && (
                    <p className={styles.warnNote}>
                      <Lock size={14} />
                      เล่มสงวนสิทธิ์: ไฟล์ใน Drive ยังต้องตั้งเป็น &ldquo;ใครมีลิงก์ก็เปิดได้&rdquo;
                      เพราะระบบส่งผู้อ่านไปเปิดที่ Drive โดยตรง การล็อกในเว็บจึงกันได้เฉพาะคนที่ยังไม่มีลิงก์
                      — อย่าเผยแพร่ลิงก์ Drive ของเล่มนี้
                    </p>
                  )}

                  {/* The dropzone used to simply not render without a token,
                      which read as a missing feature rather than a missing
                      connection. It is shown either way now, and says which. */}
                  <div
                    className={`${styles.dropzone} ${isDragging ? styles.dragging : ''} ${!googleToken ? styles.dropzoneOff : ''}`}
                    onDragOver={googleToken ? onDragOver : (e) => e.preventDefault()}
                    onDragLeave={onDragLeave}
                    onDrop={googleToken ? onDrop : (e) => {
                      e.preventDefault();
                      setIsDragging(false);
                      toast.error('กรุณาเชื่อมต่อ Google Drive ก่อนอัปโหลดไฟล์');
                    }}
                    onClick={() => {
                      if (!googleToken) {
                        toast.error('กรุณาเชื่อมต่อ Google Drive ก่อนอัปโหลดไฟล์');
                        return;
                      }
                      document.getElementById('pdf-upload')?.click();
                    }}
                  >
                    <input
                      id="pdf-upload"
                      type="file"
                      accept="application/pdf"
                      onChange={onFileChange}
                      style={{ display: 'none' }}
                    />
                    <UploadCloud size={30} className={styles.dropIcon} />
                    <div className={styles.dropLead}>
                      {googleToken ? 'ลากไฟล์ PDF มาวางที่นี่' : 'กรุณาเชื่อมต่อไดรฟ์ก่อน'}
                    </div>
                    <div className={styles.dropHint}>
                      {googleToken
                        ? 'อัปขึ้น Google Drive ตรงจากเครื่องคุณ ไม่ผ่านเซิร์ฟเวอร์ จึงไม่จำกัดขนาดไฟล์'
                        : 'กด “เชื่อมต่อเลย” ด้านบน แล้วช่องนี้จะพร้อมรับไฟล์'}
                    </div>
                  </div>

                  {pdfFile && (
                    <div className={styles.uploadCard}>
                      <div className={styles.uploadHead}>
                        <span className={styles.uploadName}>
                          <FileText size={17} className={styles.dropIcon} />
                          {pdfFile.name}
                        </span>
                        <span className={styles.uploadSize}>
                          {(pdfFile.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>

                      {uploadStatus === 'idle' && (
                        <button type="button" onClick={startUpload} className="btn btn-solid btn-block">
                          เริ่มอัปโหลดขึ้น Drive
                        </button>
                      )}

                      {uploadStatus !== 'idle' && (
                        <div>
                          <div className={styles.progressRow}>
                            <span>Google Drive</span>
                            <span>{driveProgress}%</span>
                          </div>
                          <div className={styles.progressTrack}>
                            <div className={styles.progressFill} style={{ width: `${driveProgress}%` }} />
                          </div>

                          {uploadStatus === 'success' && (
                            <p className={styles.uploadOk}>
                              <CheckCircle size={15} /> อัปโหลดเสร็จแล้ว ระบบกรอกลิงก์ให้อัตโนมัติ
                            </p>
                          )}
                          {uploadStatus === 'error' && (
                            <p className={styles.uploadFail}>
                              <AlertCircle size={15} /> {uploadError || 'อัปโหลดไม่สำเร็จ'}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <label className={styles.field} style={{ marginTop: '1.5rem' }}>
                    <span className={styles.label}>ลิงก์ Google Drive</span>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="https://drive.google.com/file/d/..."
                      value={driveUrl}
                      onChange={(e) => setDriveUrl(e.target.value)}
                    />
                    <span className={styles.fieldHint}>
                      ระบบกรอกให้เองหลังอัปโหลด วางเองได้ถ้าไฟล์อยู่ใน Drive อยู่แล้ว
                    </span>
                  </label>

                  {/* Which inbox to search when this file needs chasing down. */}
                  <label className={styles.field}>
                    <span className={styles.label}>บัญชี Google ที่เก็บไฟล์นี้</span>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder={connectedOwner || 'name@gmail.com'}
                      value={driveOwner}
                      onChange={(e) => setDriveOwner(e.target.value)}
                    />
                    <span className={styles.fieldHint}>
                      {driveOwner && connectedOwner && driveOwner !== connectedOwner
                        ? `⚠ ตอนนี้เชื่อมต่ออยู่กับ ${connectedOwner} — ไฟล์เล่มนี้อยู่ในบัญชี ${driveOwner} การลบไฟล์จะไม่สำเร็จจนกว่าจะสลับบัญชี`
                        : driveOwner
                          ? 'ค้นหาไฟล์เล่มนี้ได้ในเมลของบัญชีนี้'
                          : 'ระบบบันทึกให้เองหลังอัปโหลด เล่มเก่าที่ยังว่างสามารถกรอกเองได้'}
                    </span>
                  </label>

                  {/* Backup copy. Telegram is not a second upload target —
                      the server hands it the Drive link and Telegram fetches
                      the file itself, so nothing large crosses our server. */}
                  <div className={styles.mirrorBox}>
                    <div className={styles.mirrorHead}>
                      <span className={styles.mirrorState}>
                        <span
                          className={`${styles.mirrorDot} ${telegramFileId ? styles.mirrorOn : ''}`}
                        />
                        สำเนาสำรองบน Telegram: {telegramFileId ? 'มีแล้ว' : 'ยังไม่มี'}
                      </span>

                      <button
                        type="button"
                        className={styles.mirrorBtn}
                        onClick={runMirror}
                        disabled={mirroring || !driveUrl || !mirrorEligible}
                      >
                        <LifeBuoy size={14} />
                        {mirroring ? 'กำลังสำรอง…' : telegramFileId ? 'สำรองใหม่' : 'สำรองตอนนี้'}
                      </button>
                    </div>

                    <p className={styles.mirrorHint}>
                      {!driveUrl
                        ? 'ต้องมีไฟล์ใน Drive ก่อนจึงจะสำรองได้'
                        : !mirrorEligible
                          ? `ไฟล์นี้ใหญ่เกิน 20MB — Telegram สำรองไม่ได้ (เก็บที่ Drive อย่างเดียว)`
                          : 'ใช้เปิดแทนอัตโนมัติเมื่อ Drive ติดโควตาดาวน์โหลดรายวัน'}
                    </p>

                    {mirrorNote && <p className={styles.mirrorErr}>{mirrorNote}</p>}
                  </div>

                  {telegramUrl && !telegramFileId && (
                    <p className={styles.legacyNote}>
                      เล่มนี้มีลิงก์ Telegram เดิมอยู่ ระบบยังเปิดให้อ่านได้
                      แต่ไม่ใช่สำเนาที่ระบบจัดการเอง แนะนำให้กด &ldquo;สำรองตอนนี้&rdquo;
                    </p>
                  )}
                </fieldset>

                {/* 2.2 หน้าปก */}
                <fieldset className={styles.block} style={{ margin: 0 }}>
                  <legend className={styles.blockTitle}>ภาพหน้าปก</legend>

                  <div className={styles.preview}>
                    <BookCover src={coverUrl} title={values.title || 'ชื่อหนังสือ'} author={values.author || 'ผู้แต่ง'} />
                  </div>

                  <label className={styles.field}>
                    <span className={styles.label}>อัปโหลดรูปปก</span>
                    <input type="file" accept="image/*" className={styles.input} onChange={handleImageUpload} disabled={uploadingImage} style={{ padding: '0.4rem' }} />
                  </label>
                  {uploadingImage && <p className={styles.fieldHint}>กำลังอัปโหลด…</p>}

                  <div className={styles.orRule}>หรือวางลิงก์</div>

                  <label className={styles.field}>
                    <span className={styles.label}>ลิงก์รูปปก</span>
                    <input type="text" className={styles.input} placeholder="https://…" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
                  </label>

                  {note && <p className={styles.err}>{note}</p>}
                </fieldset>
              </div>

              {/* 3. รายละเอียดเพิ่มเติม */}
              <fieldset className={styles.block}>
                <legend className={styles.blockTitle}>รายละเอียดเพิ่มเติม</legend>
                <div className={styles.fieldGrid}>
                  {fields.filter(f => f.key !== 'title' && f.key !== 'description').map(renderField)}
                </div>
              </fieldset>

              {/* 4. การมองเห็น */}
              <fieldset className={styles.block}>
                <legend className={styles.blockTitle}>การมองเห็น</legend>
                <label className={styles.toggle} style={{ marginTop: '0' }}>
                  <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
                  <span>
                    <strong>สงวนสิทธิ์</strong>
                    <em>เปิดให้เฉพาะสมาชิกที่ได้รับอนุมัติ</em>
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
