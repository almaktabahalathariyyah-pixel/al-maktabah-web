'use client';

import { useState } from 'react';
import { Stethoscope, Loader2, CircleCheck, CircleX } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import styles from './CoverCheck.module.css';

/**
 * Answers one question — which books will not show a cover, and why.
 *
 * It used to answer two at once, badly: a twelve-book "sample" beside a
 * check-everything button, with no way to tell from the screen what a sample
 * was for. There is one button now. Every cover gets fetched, and the books
 * that have no cover recorded at all are listed without needing a run, since
 * fetching nothing proves nothing about them.
 *
 * "ทำไมรูปปกไม่แสดง" has at least six causes that all look identical in the
 * grid — no coverUrl, a bot token that no longer matches the bot that sent
 * the photo, a Drive copy that was never shared, and so on. The proxies name
 * the failing stage in an X-Cover-Error header and this reads it back.
 */

/** Header value → what the owner should do about it. */
const REASONS = {
  'bad-id': 'รหัสไฟล์ผิดรูปแบบ — ต้องอัปโหลดปกใหม่',
  'no-token': 'เซิร์ฟเวอร์ไม่มี TELEGRAM_BOT_TOKEN',
  'bad-token': 'TELEGRAM_BOT_TOKEN คนละบอทกับที่ส่งรูปนี้',
  'getfile-failed': 'Telegram หาไฟล์ไม่เจอ',
  'download-failed': 'Telegram โหลดไฟล์ไม่ได้',
  'not-an-image': 'ไม่ใช่ไฟล์รูปภาพ',
  'not-shared': 'ไฟล์ใน Drive ยังไม่ได้ตั้งเป็นสาธารณะ',
  'too-large': 'ไฟล์ใหญ่เกินกำหนด',
  'proxy-threw': 'ตัวกลางโหลดรูปมีข้อผิดพลาด',
  'http-error': 'เรียกไม่สำเร็จ',
};

/** Covers fetched at once. All 400 in parallel is what stalls the tab. */
const BATCH = 8;

export default function CoverCheck({ books }) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState(null);

  const withCover = books.filter((b) => b.coverUrl);
  // Nothing to fetch, so nothing to wait for — these are known the moment the
  // page loads and are shown without a run.
  const missing = books.filter((b) => !b.coverUrl);

  const run = async () => {
    if (withCover.length === 0) {
      toast.info('ยังไม่มีเล่มไหนบันทึกลิงก์ปกไว้เลย');
      return;
    }

    setRunning(true);
    setResult(null);
    setProgress({ done: 0, total: withCover.length });

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

    // In batches, so this does not open four hundred sockets at once.
    const checked = [];
    for (let i = 0; i < withCover.length; i += BATCH) {
      checked.push(...(await Promise.all(withCover.slice(i, i + BATCH).map(one))));
      setProgress({ done: Math.min(i + BATCH, withCover.length), total: withCover.length });
    }

    const failures = checked.filter((c) => !c.ok);
    setResult({ total: checked.length, failures });
    setRunning(false);

    if (failures.length === 0) toast.success(`ปกโหลดได้ครบทั้ง ${checked.length} เล่ม`);
    else toast.error(`ปกเสีย ${failures.length} เล่ม`);
  };

  // Only the failures are listed. A wall of four hundred "โหลดได้" rows is
  // not a report, and the owner cannot act on a single one of them.
  const byReason = result
    ? Object.entries(
        result.failures.reduce((acc, f) => {
          (acc[f.reason] ||= []).push(f);
          return acc;
        }, {})
      ).sort((a, b) => b[1].length - a[1].length)
    : [];

  return (
    <section className={styles.box}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <Stethoscope size={16} className={styles.titleIcon} />
          ตรวจรูปหน้าปก
        </h2>
        <button className="btn btn-solid" onClick={run} disabled={running}>
          {running
            ? <><Loader2 size={15} className={styles.spin} /> {progress.done}/{progress.total}</>
            : `ตรวจ ${withCover.length.toLocaleString('th-TH')} เล่ม`}
        </button>
      </div>

      {/* Two counts, no prose. */}
      <div className={styles.tallies}>
        <span className={styles.tally}>
          <CircleCheck size={14} className={styles.good} />
          มีลิงก์ปก {withCover.length.toLocaleString('th-TH')}
        </span>
        {missing.length > 0 && (
          <span className={styles.tally}>
            <CircleX size={14} className={styles.bad} />
            ยังไม่มีปก {missing.length.toLocaleString('th-TH')}
          </span>
        )}
        {result && (
          <span className={styles.tally}>
            {result.failures.length === 0
              ? <><CircleCheck size={14} className={styles.good} /> ปกเสีย 0</>
              : <><CircleX size={14} className={styles.bad} /> ปกเสีย {result.failures.length}</>}
          </span>
        )}
      </div>

      {missing.length > 0 && (
        <details className={styles.group}>
          <summary className={styles.groupHead}>
            ยังไม่มีปก — {missing.length.toLocaleString('th-TH')} เล่ม
          </summary>
          <ul className={styles.rows}>
            {missing.map((b) => (
              <li key={b.id} className={styles.row}>
                <CircleX size={13} className={styles.bad} />
                <span className={styles.rowTitle} dir="auto">{b.title}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Failures grouped by cause: one heading per fix, not one row per book. */}
      {byReason.map(([reason, list]) => (
        <details key={reason} className={styles.group}>
          <summary className={styles.groupHead}>
            {REASONS[reason] || reason} — {list.length.toLocaleString('th-TH')} เล่ม
          </summary>
          <ul className={styles.rows}>
            {list.map((c) => (
              <li key={c.id} className={styles.row}>
                <CircleX size={13} className={styles.bad} />
                <span className={styles.rowTitle} dir="auto">{c.title}</span>
                <span className={styles.rowNote}>{c.status || '—'}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}

      {result && result.failures.length === 0 && (
        <p className={styles.allGood}>
          <CircleCheck size={15} className={styles.good} />
          ปกโหลดได้ครบทุกเล่ม
        </p>
      )}
    </section>
  );
}
