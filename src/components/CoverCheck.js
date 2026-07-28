'use client';

import { useState } from 'react';
import { Stethoscope, Loader2, CircleCheck, CircleX } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import styles from './CoverCheck.module.css';

/**
 * Actually fetches a sample of cover URLs and reports what came back.
 *
 * "ทำไมรูปปกไม่แสดง" has at least six causes that all look identical in the
 * grid — the record has no coverUrl, the bot token no longer matches the bot
 * that sent the photo, Telegram cannot find the file, the Drive copy was never
 * shared publicly, and so on. Guessing between them from the outside wasted a
 * round trip, so the proxies now name the failing stage in an X-Cover-Error
 * header and this reads it back.
 */

/** Header value → what the owner should do about it. */
const REASONS = {
  'bad-id': 'รหัสไฟล์ในระบบผิดรูปแบบ — ต้องอัปโหลดปกใหม่',
  'no-token': 'เซิร์ฟเวอร์ไม่มี TELEGRAM_BOT_TOKEN — ตั้งค่าใน Vercel แล้ว deploy ใหม่',
  'bad-token': 'TELEGRAM_BOT_TOKEN ไม่ใช่บอทตัวที่ส่งรูปนี้ — ปกเก่าจะอ่านไม่ได้ทั้งหมด',
  'getfile-failed': 'Telegram หาไฟล์นี้ไม่เจอ (อาจถูกลบ หรือคนละบอท/คนละแชนแนล)',
  'download-failed': 'Telegram รู้จักไฟล์ แต่ดาวน์โหลดไม่ได้',
  'not-an-image': 'ไฟล์ที่ได้กลับมาไม่ใช่รูปภาพ',
  'not-shared': 'ไฟล์ใน Drive ยังไม่ได้ตั้งเป็น “ใครมีลิงก์ก็เปิดได้”',
  'too-large': 'ไฟล์รูปใหญ่เกินกำหนด',
  'proxy-threw': 'ตัวกลางโหลดรูปมีข้อผิดพลาด',
  'http-error': 'เรียกไม่สำเร็จ',
};

const SAMPLE_SIZE = 12;

export default function CoverCheck({ books }) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const withCover = books.filter((b) => b.coverUrl);
  const withoutCover = books.length - withCover.length;

  const run = async () => {
    if (withCover.length === 0) {
      toast.info('ยังไม่มีเล่มไหนบันทึกลิงก์ปกไว้เลย — ปัญหาอยู่ที่ตอนสร้างปก ไม่ใช่ตอนแสดง');
      return;
    }

    setRunning(true);
    setResult(null);

    // A spread across the library, not the newest 12: a token change breaks old
    // covers while new ones still work, and sampling one end hides that.
    const step = Math.max(1, Math.floor(withCover.length / SAMPLE_SIZE));
    const sample = [];
    for (let i = 0; i < withCover.length && sample.length < SAMPLE_SIZE; i += step) {
      sample.push(withCover[i]);
    }

    const checked = await Promise.all(
      sample.map(async (book) => {
        try {
          // HEAD would be cheaper, but the proxies only implement GET.
          const res = await fetch(book.coverUrl, { cache: 'no-store' });
          return {
            id: book.id,
            title: book.title,
            ok: res.ok,
            reason: res.ok ? '' : res.headers.get('X-Cover-Error') || 'http-error',
            status: res.status,
          };
        } catch {
          return { id: book.id, title: book.title, ok: false, reason: 'proxy-threw', status: 0 };
        }
      })
    );

    const failures = checked.filter((c) => !c.ok);
    setResult({ checked, failures });
    setRunning(false);

    if (failures.length === 0) toast.success(`ตรวจ ${checked.length} เล่ม — ปกโหลดได้ปกติทั้งหมด`);
    else toast.error(`ปกโหลดไม่ได้ ${failures.length} จาก ${checked.length} เล่มที่สุ่มตรวจ`);
  };

  // The dominant failure is the one worth acting on first.
  const worst = result?.failures.length
    ? Object.entries(
        result.failures.reduce((acc, f) => ({ ...acc, [f.reason]: (acc[f.reason] || 0) + 1 }), {})
      ).sort((a, b) => b[1] - a[1])[0]
    : null;

  return (
    <section className={styles.box}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>
            <Stethoscope size={16} className={styles.titleIcon} />
            ตรวจรูปหน้าปก
          </h2>
          <p className={styles.lede}>
            สุ่มโหลดปกจริงจากคลัง แล้วบอกว่าติดที่ขั้นไหน
            {withoutCover > 0 && ` · มี ${withoutCover.toLocaleString('th-TH')} เล่มที่ยังไม่มีลิงก์ปกเลย`}
          </p>
        </div>

        <button className="btn" onClick={run} disabled={running}>
          {running ? <><Loader2 size={15} className={styles.spin} /> กำลังตรวจ…</> : 'ตรวจเลย'}
        </button>
      </div>

      {result && (
        <div className={styles.result}>
          {worst ? (
            <p className={styles.verdict}>
              <CircleX size={15} className={styles.bad} />
              <span>
                <strong>สาเหตุหลัก: {REASONS[worst[0]] || worst[0]}</strong>
                {` (${worst[1]} จาก ${result.failures.length} เล่มที่พลาด)`}
              </span>
            </p>
          ) : (
            <p className={styles.verdict}>
              <CircleCheck size={15} className={styles.good} />
              <span>ปกที่สุ่มตรวจโหลดได้ทั้งหมด — ถ้ายังไม่เห็นปกในหน้าเว็บ ให้ล้างแคชเบราว์เซอร์แล้วลองใหม่</span>
            </p>
          )}

          <ul className={styles.rows}>
            {result.checked.map((c) => (
              <li key={c.id} className={styles.row}>
                {c.ok
                  ? <CircleCheck size={14} className={styles.good} />
                  : <CircleX size={14} className={styles.bad} />}
                <span className={styles.rowTitle}>{c.title}</span>
                <span className={styles.rowNote}>
                  {c.ok ? 'โหลดได้' : `${c.status || '—'} · ${REASONS[c.reason] || c.reason}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
