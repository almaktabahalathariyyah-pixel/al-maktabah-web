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
  'not-an-image': 'ไฟล์ที่เก็บไว้ไม่ใช่นามสกุลรูปภาพที่รองรับ',
  'not-shared': 'ไฟล์ใน Drive ยังไม่ได้ตั้งเป็น “ใครมีลิงก์ก็เปิดได้”',
  'too-large': 'ไฟล์รูปใหญ่เกินกำหนด',
  'proxy-threw': 'ตัวกลางโหลดรูปมีข้อผิดพลาด',
  'http-error': 'เรียกไม่สำเร็จ',
};

const SAMPLE_SIZE = 12;
/** Covers fetched at once. All 400 in parallel is what stalls the tab. */
const BATCH = 8;

export default function CoverCheck({ books }) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);

  const withCover = books.filter((b) => b.coverUrl);
  /**
   * The books this check can say nothing about, because there is no cover to
   * fetch. They were counted in one line of prose and never listed, so the
   * one question the owner actually has here — WHICH books need a cover —
   * had no answer on the page that exists to answer it.
   */
  const missing = books.filter((b) => !b.coverUrl);

  /** `all` checks every cover in the library; otherwise a spread of twelve. */
  const run = async (all = false) => {
    if (withCover.length === 0) {
      toast.info('ยังไม่มีเล่มไหนบันทึกลิงก์ปกไว้เลย — ปัญหาอยู่ที่ตอนสร้างปก ไม่ใช่ตอนแสดง');
      return;
    }

    setRunning(true);
    setResult(null);

    let queue;
    if (all) {
      queue = withCover;
    } else {
      // A spread across the library, not the newest 12: a token change breaks
      // old covers while new ones still work, and sampling one end hides that.
      const step = Math.max(1, Math.floor(withCover.length / SAMPLE_SIZE));
      queue = [];
      for (let i = 0; i < withCover.length && queue.length < SAMPLE_SIZE; i += step) {
        queue.push(withCover[i]);
      }
    }

    setProgress({ done: 0, total: queue.length });

    const one = async (book) => {
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
    };

    // In batches, so checking all 400 does not open 400 sockets at once.
    const checked = [];
    for (let i = 0; i < queue.length; i += BATCH) {
      checked.push(...(await Promise.all(queue.slice(i, i + BATCH).map(one))));
      setProgress({ done: Math.min(i + BATCH, queue.length), total: queue.length });
    }

    const failures = checked.filter((c) => !c.ok);
    setResult({ checked, failures, all });
    setRunning(false);

    if (failures.length === 0) toast.success(`ตรวจ ${checked.length} เล่ม — ปกโหลดได้ปกติทั้งหมด`);
    else toast.error(`ปกโหลดไม่ได้ ${failures.length} จาก ${checked.length} เล่ม`);
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
        </div>

        <div className={styles.headActs}>
          <button className="btn" onClick={() => run(false)} disabled={running}>
            {running
              ? <><Loader2 size={15} className={styles.spin} /> {progress.done}/{progress.total}</>
              : `สุ่ม ${SAMPLE_SIZE} เล่ม`}
          </button>
          <button className="btn btn-solid" onClick={() => run(true)} disabled={running}>
            ตรวจทั้งหมด ({withCover.length.toLocaleString('th-TH')})
          </button>
        </div>
      </div>

      {/* The actionable half of this page: not "12 books are missing covers"
          but which twelve. Listed first, because it is the list the owner can
          do something about — every other result here is a server problem. */}
      {missing.length > 0 && (
        <details className={styles.missing}>
          <summary className={styles.missingHead}>
            ยังไม่มีปก {missing.length.toLocaleString('th-TH')} เล่ม — กดดูรายชื่อ
          </summary>
          <ul className={styles.rows}>
            {missing.map((b) => (
              <li key={b.id} className={styles.row}>
                <CircleX size={14} className={styles.bad} />
                <span className={styles.rowTitle} dir="auto">{b.title}</span>
                <span className={styles.rowNote}>ไม่มีลิงก์ปก</span>
              </li>
            ))}
          </ul>
        </details>
      )}

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
