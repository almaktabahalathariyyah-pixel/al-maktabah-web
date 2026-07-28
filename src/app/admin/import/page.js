'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { setDoc, doc } from 'firebase/firestore';
import { Upload, FileJson, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { getNextBookId } from '@/lib/sequentialId';
import styles from './page.module.css';

/**
 * Bulk import from a Telegram JSON export.
 *
 * Deliberately a two-step flow: parse and preview first, write second.
 * A bad file would otherwise create hundreds of junk documents that
 * each cost a write to make and another to delete.
 */
export default function ImportPage() {
  const router = useRouter();
  const [baseLink, setBaseLink] = useState('');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(null);

  const readFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setParsed(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data.messages) throw new Error('ไม่พบรายการข้อความในไฟล์');

        const docs = data.messages.filter(
          (m) =>
            m.mime_type === 'application/pdf' ||
            m.file?.endsWith?.('.pdf') ||
            (m.media_type === 'document' && m.file_name)
        );

        if (docs.length === 0) {
          setError('ไม่พบไฟล์เอกสารในไฟล์ JSON นี้');
          return;
        }
        setParsed(docs);
      } catch (err) {
        console.error(err);
        setError('อ่านไฟล์ไม่สำเร็จ กรุณาตรวจสอบว่าเป็น JSON ที่ส่งออกจาก Telegram');
      }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  const runImport = async () => {
    if (!baseLink.trim()) {
      setError('กรุณาใส่ลิงก์ฐานของกลุ่ม Telegram ก่อน');
      return;
    }
    setError('');
    const base = baseLink.trim().replace(/\/$/, '');
    setProgress({ done: 0, total: parsed.length });

    try {
      for (let i = 0; i < parsed.length; i++) {
        const msg = parsed[i];
        // Running ids, the same as every other way a book enters the library.
        // addDoc used to mint random ids here, leaving the collection with two
        // incompatible id schemes and breaking the /book/<id> links people share.
        const id = await getNextBookId();
        await setDoc(doc(db, 'books', id), {
          title: msg.file_name ? msg.file_name.replace(/\.pdf$/i, '') : 'ไม่ทราบชื่อ',
          author: '',
          category: 'อื่นๆ',
          publisher: '',
          year: '',
          pages: 0,
          format: 'PDF',
          coverUrl: '',
          driveUrl: '',
          telegramUrl: `${base}/${msg.id}`,
          description: typeof msg.text === 'string' ? msg.text : '',
          restricted: false,
          downloadCount: 0,
          createdAt: new Date(msg.date || Date.now()),
        });
        setProgress({ done: i + 1, total: parsed.length });
      }
      router.push('/admin');
    } catch (err) {
      console.error(err);
      setError('นำเข้าไม่สำเร็จระหว่างทาง บางเล่มอาจถูกเพิ่มไปแล้ว');
      setProgress(null);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>นำเข้าจาก Telegram</h1>
        <p className={styles.sub}>
          ส่งออกประวัติแชตเป็น JSON จาก Telegram Desktop แล้วอัปโหลดที่นี่
          ระบบจะดึงเฉพาะข้อความที่แนบไฟล์เอกสาร
        </p>
      </header>

      <div className={styles.steps}>
        <section className={styles.card}>
          <span className={styles.stepNo}>1</span>
          <div className={styles.cardBody}>
            <h2 className={styles.cardTitle}>ลิงก์ฐานของกลุ่ม</h2>
            <p className={styles.cardText}>
              ใช้ต่อท้ายด้วยหมายเลขข้อความ เพื่อสร้างลิงก์ไปยังไฟล์แต่ละเล่ม
            </p>
            <input
              type="text"
              className={styles.input}
              placeholder="https://t.me/c/1234567890"
              value={baseLink}
              onChange={(e) => setBaseLink(e.target.value)}
            />
          </div>
        </section>

        <section className={styles.card}>
          <span className={styles.stepNo}>2</span>
          <div className={styles.cardBody}>
            <h2 className={styles.cardTitle}>เลือกไฟล์ JSON</h2>
            <p className={styles.cardText}>ระบบจะอ่านและแสดงผลก่อน ยังไม่บันทึกลงฐานข้อมูล</p>
            <label className={styles.drop}>
              <FileJson size={20} />
              <span>{parsed ? 'เลือกไฟล์อื่น' : 'เลือกไฟล์ result.json'}</span>
              <input type="file" accept=".json" onChange={readFile} hidden />
            </label>
          </div>
        </section>
      </div>

      {error && (
        <p className={styles.error}>
          <AlertTriangle size={15} /> {error}
        </p>
      )}

      {parsed && (
        <section className={styles.result}>
          <div className={styles.resultHead}>
            <div>
              <p className={styles.resultCount}>พบ {parsed.length} ไฟล์</p>
              <p className={styles.cardText}>
                ตรวจรายชื่อด้านล่างก่อน แล้วจึงยืนยันการนำเข้า
              </p>
            </div>
            <button
              className="btn btn-solid"
              onClick={runImport}
              disabled={!!progress}
            >
              <Upload size={15} />
              {progress
                ? `กำลังนำเข้า ${progress.done}/${progress.total}`
                : 'ยืนยันนำเข้า'}
            </button>
          </div>

          {progress && (
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </div>
          )}

          <ul className={styles.preview}>
            {parsed.slice(0, 40).map((m, i) => (
              <li key={i} className={styles.previewRow}>
                <span className={styles.previewIdx}>{i + 1}</span>
                <span className={styles.previewName}>
                  {m.file_name ? m.file_name.replace(/\.pdf$/i, '') : 'ไม่ทราบชื่อ'}
                </span>
              </li>
            ))}
          </ul>
          {parsed.length > 40 && (
            <p className={styles.more}>และอีก {parsed.length - 40} รายการ</p>
          )}
        </section>
      )}
    </div>
  );
}
