'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { collection, getDocs, setDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import DriveStatus from '@/components/DriveStatus';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { useAuth } from '@/context/AuthContext';
import { getNextBookId } from '@/lib/sequentialId';
import { uploadPdfToDrive } from '@/lib/googleDrive';
import { loadCatalog, matchRow, bookFromRow } from '@/lib/csvCatalog';
import { rememberDropdowns } from '@/lib/settings';
import { canMirror } from '@/lib/mirror';
import { makeCover } from '@/lib/pdfCover';
import { useTabLock } from '@/lib/tabLock';
import { bumpCatalogRev } from '@/lib/catalogRev';
import {
  X, UploadCloud, CheckCircle, AlertCircle, Loader2, FileSpreadsheet,
  FolderOpen, Play, Pause, SkipForward,
} from 'lucide-react';
import styles from './BulkUploadPanel.module.css';

/** A small gap between books; Drive is happy back-to-back, this is courtesy. */
const DEFAULT_DELAY_MS = 500;

const STATUS_LABEL = {
  pending: 'รอคิว',
  uploading: 'กำลังอัป',
  covering: 'ทำหน้าปก',
  saving: 'กำลังบันทึก',
  done: 'เสร็จแล้ว',
  error: 'ไม่สำเร็จ',
  skipped: 'มีอยู่แล้ว',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function BulkUploadPanel({ isOpen, onClose, onSaved }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { user } = useAuth();
  // Two tabs uploading the same folder both read the "already in the library"
  // set before either has written anything, so both treat every file as new.
  const { runExclusive, busyElsewhere } = useTabLock('bulk-upload');

  const [catalog, setCatalog] = useState(null);
  const [catalogName, setCatalogName] = useState('');
  const [items, setItems] = useState([]);
  const [existing, setExisting] = useState(new Set());

  const [restricted, setRestricted] = useState(false);
  const [autoCover, setAutoCover] = useState(true);
  const [delayMs, setDelayMs] = useState(DEFAULT_DELAY_MS);

  const [googleToken, setGoogleToken] = useState(null);
  const [driveOwner, setDriveOwner] = useState('');
  const [running, setRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // The loop reads refs between files, so Pause and Close take effect at a safe
  // point rather than tearing down mid-upload. `isPaused` is the same flag as
  // state, because the button label has to re-render and a ref cannot do that.
  const paused = useRef(false);
  const cancelled = useRef(false);

  const togglePause = () => {
    paused.current = !paused.current;
    setIsPaused(paused.current);
  };

  const handleToken = useCallback((value) => setGoogleToken(value), []);
  const handleAccount = useCallback((value) => setDriveOwner(value), []);

  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Which books are already in the library, so a second run does not duplicate
  // everything. Books added by this panel carry the filename they came from.
  useEffect(() => {
    if (!isOpen) return;
    cancelled.current = false;
    paused.current = false;

    let alive = true;
    getDocs(collection(db, 'books'))
      .then((snap) => {
        if (!alive) return;
        const seen = new Set();
        snap.forEach((d) => {
          const data = d.data();
          if (data.sourceFile) seen.add(String(data.sourceFile).toLowerCase());
        });
        setExisting(seen);
      })
      .catch((err) => console.error('Could not read existing books:', err));

    return () => { alive = false; };
  }, [isOpen]);

  // ------------------------------------------------------------- catalogue --

  const readCatalog = async (file) => {
    try {
      const text = await file.text();
      const loaded = loadCatalog(text);

      if (loaded.rows.length === 0) {
        toast.error('อ่านไฟล์ CSV ไม่ได้ หรือไม่มีข้อมูล');
        return;
      }
      if (loaded.missing.length) {
        toast.error(`CSV ขาดคอลัมน์: ${loaded.missing.join(', ')}`);
        return;
      }

      setCatalog(loaded);
      setCatalogName(file.name);
      toast.success(`อ่านแคตตาล็อกแล้ว ${loaded.rows.length} รายการ`);
      setItems((prev) => prev.map((it) => ({ ...it, row: matchRow(loaded, it.file.name) })));
    } catch (err) {
      console.error(err);
      toast.error('อ่านไฟล์ CSV ไม่สำเร็จ');
    }
  };

  // ----------------------------------------------------------------- files --

  const addFiles = (picked) => {
    const pdfs = picked.filter((f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    const rejected = picked.length - pdfs.length;
    if (rejected > 0) toast.info(`ข้ามไฟล์ที่ไม่ใช่ PDF ${rejected} ไฟล์`);

    setItems((prev) => {
      const known = new Set(prev.map((it) => it.file.name.toLowerCase()));
      const added = pdfs
        .filter((f) => !known.has(f.name.toLowerCase()))
        .map((f) => ({
          id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 8)}`,
          file: f,
          row: matchRow(catalog, f.name),
          status: existing.has(f.name.toLowerCase()) ? 'skipped' : 'pending',
          progress: 0,
          error: '',
        }));
      return [...prev, ...added];
    });
  };

  const onFilePick = (e) => {
    addFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(Array.from(e.dataTransfer.files || []));
  };

  const patch = (id, changes) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...changes } : it)));

  // ----------------------------------------------------------------- upload --

  const run = () =>
    runExclusive(runQueue, () =>
      toast.error('การอัปโหลดกำลังทำงานอยู่ในอีกแท็บ — ปิดแท็บนั้น หรือรอให้เสร็จก่อน')
    );

  const runQueue = async () => {
    // Reachable now: the button used to be `disabled` without a token, so a
    // click did nothing at all and never said why.
    if (!googleToken) {
      toast.error('กรุณาเชื่อมต่อ Google Drive ก่อน แล้วจึงเริ่มอัปโหลด');
      return;
    }

    const queue = items.filter((it) => it.status === 'pending' || it.status === 'error');
    if (queue.length === 0) {
      toast.info('ยังไม่มีไฟล์ในคิว — เลือกไฟล์ PDF ก่อน');
      return;
    }

    setRunning(true);
    paused.current = false;
    setIsPaused(false);
    cancelled.current = false;

    let ok = 0;
    let failed = 0;
    // Covers fail independently of the book itself, so they get their own
    // tally — a silent cover failure is what left the shelf blank.
    let coversFailed = 0;
    let firstCoverError = '';
    // Everything the CSV brings in, announced once when the run ends rather
    // than per book — 300 files would otherwise be 300 extra writes.
    const seen = {
      authors: new Set(), translators: new Set(), publishers: new Set(),
      types: new Set(), languages: new Set(), categories: new Set(),
    };

    for (const item of queue) {
      if (cancelled.current) break;

      // Pausing waits here rather than unwinding, so nothing is half-written.
      while (paused.current && !cancelled.current) await sleep(400);
      if (cancelled.current) break;

      try {
        patch(item.id, { status: 'uploading', progress: 0, error: '' });

        const title = item.row?.title?.trim() || item.file.name.replace(/\.pdf$/i, '');

        const { url } = await uploadPdfToDrive({
          token: googleToken,
          file: item.file,
          name: title,
          onProgress: (p) => patch(item.id, { progress: p }),
        });

        if (cancelled.current) break;

        // The first page of these books is the cover, so render it rather
        // than leaving 362 blank frames for the owner to fill by hand.
        let coverUrl = '';
        if (autoCover) {
          patch(item.id, { status: 'covering' });
          const idToken = await user.getIdToken();
          const cover = await makeCover(item.file, { idToken });
          coverUrl = cover.url;

          if (!cover.url) {
            coversFailed += 1;
            if (!firstCoverError) firstCoverError = cover.error;
            // The book still saves — a missing cover is cosmetic — but the row
            // says so instead of reporting an unqualified success.
            patch(item.id, { coverError: cover.error });
          }
        }

        patch(item.id, { status: 'saving' });

        const payload = bookFromRow(item.row, {
          file: item.file,
          driveUrl: url,
          driveOwner,
          coverUrl,
          restricted,
        });

        const id = await getNextBookId();
        await setDoc(doc(db, 'books', id), payload);
        onSaved?.({ id, ...payload });

        patch(item.id, { status: 'done', progress: 100 });
        setExisting((prev) => new Set(prev).add(item.file.name.toLowerCase()));
        payload.author.forEach((n) => seen.authors.add(n));
        payload.translator.forEach((n) => seen.translators.add(n));
        if (payload.publisher) seen.publishers.add(payload.publisher);
        if (payload.type) seen.types.add(payload.type);
        if (payload.language) seen.languages.add(payload.language);
        if (payload.category) seen.categories.add(payload.category);
        ok += 1;

        // Spacing the requests keeps Telegram from rate-limiting the channel.
        if (delayMs > 0) await sleep(delayMs);
      } catch (err) {
        console.error(err);
        patch(item.id, { status: 'error', error: err.message });
        failed += 1;
      }
    }

    setRunning(false);

    // Even a cancelled run wrote books, and their values belong in the lists.
    await rememberDropdowns(
      Object.fromEntries(Object.entries(seen).map(([key, values]) => [key, [...values]]))
    );
    // Same reasoning: a cancelled run still changed the shelf.
    if (ok > 0) await bumpCatalogRev();

    if (cancelled.current) return;

    if (failed === 0) toast.success(`อัปโหลดสำเร็จ ${ok} เล่ม`);
    else toast.error(`สำเร็จ ${ok} เล่ม · ไม่สำเร็จ ${failed} เล่ม (กด "เริ่ม" อีกครั้งเพื่อลองใหม่)`);

    if (coversFailed > 0) {
      toast.error(
        `ทำรูปปกไม่สำเร็จ ${coversFailed} เล่ม — ${firstCoverError || 'ไม่ทราบสาเหตุ'} · เล่มเหล่านี้จะแสดงปกตัวอักษรแทน`
      );
    }
  };

  const handleClose = async () => {
    if (running) {
      const agreed = await confirm({
        title: 'ปิดหน้าต่างระหว่างอัปโหลด?',
        message: 'ระบบจะหยุดหลังไฟล์ที่กำลังอัปโหลดอยู่เสร็จ เล่มที่เหลือในคิวจะไม่ถูกอัป',
        confirmLabel: 'หยุดแล้วปิด',
        tone: 'danger',
      });
      if (!agreed) return;

      cancelled.current = true;
      paused.current = false;
      setIsPaused(false);
    }
    setItems([]);
    setRunning(false);
    onClose();
  };

  if (!isOpen) return null;

  const counts = items.reduce((acc, it) => ({ ...acc, [it.status]: (acc[it.status] || 0) + 1 }), {});
  const queued = (counts.pending || 0) + (counts.error || 0);
  const matched = items.filter((it) => it.row).length;
  const tooBig = items.filter((it) => !canMirror(it.file.size)).length;

  return (
    <>
      <div className={styles.backdrop} onClick={handleClose} />
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 className={styles.title}>อัปโหลดหลายเล่ม</h2>
          <button className={styles.closeBtn} onClick={handleClose} aria-label="ปิด">
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          <DriveStatus active={isOpen} onToken={handleToken} onAccount={handleAccount} />

          {/* ---------- 1. catalogue ---------- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>1</span> แนบแคตตาล็อก (CSV)
            </h3>
            <p className={styles.stepHint}>
              ไฟล์จาก <code>book-catalog.csv</code> — ระบบจับคู่ตามชื่อไฟล์แล้วกรอกชื่อเรื่อง
              ผู้แต่ง หมวดหมู่ ประเภท จำนวนหน้า ให้อัตโนมัติ ไม่แนบก็อัปได้ แต่จะได้แค่ชื่อไฟล์
            </p>

            <label className={styles.fileBtn}>
              <FileSpreadsheet size={16} />
              {catalogName || 'เลือกไฟล์ CSV'}
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => e.target.files?.[0] && readCatalog(e.target.files[0])}
              />
            </label>

            {catalog && (
              <p className={styles.ok}>
                <CheckCircle size={14} /> อ่านได้ {catalog.rows.length} รายการ
              </p>
            )}
          </section>

          {/* ---------- 2. files ---------- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>2</span> เลือกไฟล์ PDF
            </h3>

            <div
              className={`${styles.dropzone} ${isDragging ? styles.dragging : ''}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            >
              <UploadCloud size={28} className={styles.dropIcon} />
              <div className={styles.dropLead}>ลากไฟล์ทั้งหมดมาวางที่นี่</div>
              <div className={styles.dropActions}>
                <label className={styles.fileBtn}>
                  <FolderOpen size={16} /> เลือกทั้งโฟลเดอร์
                  <input type="file" webkitdirectory="" directory="" multiple hidden onChange={onFilePick} />
                </label>
                <label className={styles.fileBtn}>
                  เลือกทีละไฟล์
                  <input type="file" accept="application/pdf" multiple hidden onChange={onFilePick} />
                </label>
              </div>
            </div>

            {items.length > 0 && (
              <div className={styles.summary}>
                <span><strong>{items.length}</strong> ไฟล์</span>
                <span>จับคู่ CSV ได้ <strong>{matched}</strong></span>
                {counts.skipped > 0 && <span>มีอยู่แล้ว <strong>{counts.skipped}</strong></span>}
                {tooBig > 0 && <span className={styles.warn}>เกิน 20MB (สำรองไม่ได้) <strong>{tooBig}</strong></span>}
              </div>
            )}
          </section>

          {/* ---------- 3. options ---------- */}
          <section className={styles.step}>
            <h3 className={styles.stepTitle}>
              <span className={styles.stepNum}>3</span> ตัวเลือก
            </h3>

            <label className={styles.toggle}>
              <input type="checkbox" checked={autoCover} onChange={(e) => setAutoCover(e.target.checked)} />
              <span>
                <strong>สร้างรูปปกจากหน้าแรกอัตโนมัติ</strong>
                <em>เรนเดอร์หน้าแรกของ PDF เป็นรูปปก · ทำในเครื่องคุณ ไม่ส่งไฟล์ทั้งเล่มขึ้นเซิร์ฟเวอร์</em>
              </span>
            </label>

            <label className={styles.toggle}>
              <input type="checkbox" checked={restricted} onChange={(e) => setRestricted(e.target.checked)} />
              <span>
                <strong>ตั้งเป็นสงวนสิทธิ์ทั้งหมด</strong>
                <em>เปิดให้เฉพาะสมาชิกที่ได้รับอนุมัติ</em>
              </span>
            </label>

            <label className={styles.field}>
              <span className={styles.label}>หน่วงเวลาระหว่างเล่ม</span>
              <select
                className={styles.select}
                value={delayMs}
                onChange={(e) => setDelayMs(Number(e.target.value))}
              >
                <option value={0}>ไม่หน่วง (เร็วสุด)</option>
                <option value={500}>0.5 วินาที (แนะนำ)</option>
                <option value={2000}>2 วินาที</option>
              </select>
              <span className={styles.fieldHint}>
                การสำรองไปที่ Telegram แยกไปอยู่หน้า &ldquo;สถิติและสุขภาพคลัง&rdquo; แล้ว
                จึงไม่ต้องหน่วงรอ Telegram ระหว่างอัปอีก
              </span>
            </label>
          </section>

          {/* ---------- queue ---------- */}
          {items.length > 0 && (
            <div className={styles.queue}>
              <div className={styles.queueHead}>
                <h3 className={styles.queueTitle}>รายการ ({items.length})</h3>
                {!running && (
                  <button className={styles.queueClear} onClick={() => setItems([])}>ล้างรายการ</button>
                )}
              </div>

              <ul className={styles.queueList}>
                {items.map((it) => (
                  <li key={it.id} className={styles.row}>
                    <div className={styles.rowBody}>
                      <div className={styles.rowTop}>
                        <span className={styles.rowTitle}>
                          {it.row?.title?.trim() || it.file.name}
                        </span>
                        <span className={`${styles.badge} ${styles[it.status]}`}>
                          {STATUS_LABEL[it.status]}
                        </span>
                      </div>

                      <div className={styles.rowMeta}>
                        {it.row ? (
                          <>
                            {it.row.category && <span className={styles.tag}>{it.row.category}</span>}
                            {it.row.type && <span className={styles.tag}>{it.row.type}</span>}
                            {it.row.language && <span className={styles.tag}>{it.row.language}</span>}
                            {it.row.author && <span className={styles.dim}>{it.row.author}</span>}
                            {it.row.pages && <span className={styles.dim}>{it.row.pages} หน้า</span>}
                          </>
                        ) : (
                          <span className={styles.nomatch}>ไม่พบใน CSV — จะใช้ชื่อไฟล์เป็นชื่อเรื่อง</span>
                        )}
                        <span className={styles.dim}>{(it.file.size / 1024 / 1024).toFixed(1)} MB</span>
                      </div>

                      {it.status === 'uploading' && (
                        <div className={styles.progressTrack}>
                          <div className={styles.progressFill} style={{ width: `${it.progress}%` }} />
                        </div>
                      )}
                      {it.status === 'error' && <p className={styles.err}>{it.error}</p>}
                      {it.coverError && it.status === 'done' && (
                        <p className={styles.warn}>ไม่มีรูปปก — {it.coverError}</p>
                      )}
                    </div>

                    {['uploading', 'covering', 'saving'].includes(it.status) ? (
                      <Loader2 size={16} className={styles.spin} />
                    ) : it.status === 'done' ? (
                      <CheckCircle size={16} className={styles.iconOk} />
                    ) : it.status === 'error' ? (
                      <AlertCircle size={16} className={styles.iconBad} />
                    ) : it.status === 'skipped' ? (
                      <SkipForward size={16} className={styles.iconDim} />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerCount}>
            {!googleToken && (
              <span className={styles.warn} id="drive-required">
                กรุณาเชื่อมต่อไดรฟ์ก่อน
              </span>
            )}
            {busyElsewhere && !running && (
              <span className={styles.warn}>กำลังอัปโหลดอยู่ในอีกแท็บ</span>
            )}
            {counts.done > 0 && <span className={styles.ok}>เสร็จ {counts.done}</span>}
            {counts.error > 0 && <span className={styles.warn}>ไม่สำเร็จ {counts.error}</span>}
          </div>

          <button type="button" className="btn" onClick={handleClose}>ปิด</button>

          {running ? (
            <button type="button" className="btn" onClick={togglePause}>
              {isPaused ? <><Play size={16} /> ทำต่อ</> : <><Pause size={16} /> หยุดชั่วคราว</>}
            </button>
          ) : (
            // Deliberately NOT disabled when Drive is unconnected — a dead
            // button is why "why is nothing happening?" was the whole bug.
            // It stays clickable and run() explains what is missing.
            <button
              type="button"
              className="btn btn-solid"
              onClick={run}
              aria-describedby={!googleToken ? 'drive-required' : undefined}
            >
              <Play size={16} /> เริ่มอัปโหลด {queued} เล่ม
            </button>
          )}
        </div>
      </div>
    </>
  );
}
