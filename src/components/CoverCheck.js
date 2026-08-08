'use client';

import { useState } from 'react';
import { Stethoscope, Loader2, CircleCheck, CircleX, RotateCcw } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import styles from './CoverCheck.module.css';

/**
 * Answers one question — which books will not show a cover, and why.
 *
 * Every verdict is remembered, so a second visit only fetches what has no
 * answer yet. Checking four hundred covers takes minutes; doing it again from
 * scratch to find the one book added since is the kind of thing that stops
 * the check from being run at all.
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

/** Covers fetched at once. All four hundred in parallel is what stalls a tab. */
const BATCH = 8;
/** Where the verdicts live between visits. */
const STORE = 'coverCheck.v1';

/**
 * What has been checked, as `{ [bookId]: { url, ok, reason, status } }`.
 *
 * The url is stored beside the verdict so that replacing one book's cover
 * puts that book back in the queue and leaves the other four hundred alone.
 * Kept in localStorage on purpose: it is a cache of an HTTP result, not
 * library data, and it must not cost a Firestore write.
 */
function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE) || '{}');
  } catch {
    return {};
  }
}

export default function CoverCheck({ books }) {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  // Read once, lazily. The guard is what makes that safe: AdminShell renders
  // its permission gate instead of this until auth resolves, so there is no
  // server pass to mismatch — but a bare localStorage read in a render body
  // is a crash waiting for the day that changes.
  const [seen, setSeen] = useState(() =>
    typeof window === 'undefined' ? {} : loadStore()
  );

  const withCover = books.filter((b) => b.coverUrl);
  // Nothing to fetch, so nothing to wait for — these are known the moment the
  // page loads and are listed without a run.
  const missing = books.filter((b) => !b.coverUrl);

  /** Already answered, for the cover this book currently has. */
  const isChecked = (b) => seen[b.id] && seen[b.id].url === b.coverUrl;
  const unchecked = withCover.filter((b) => !isChecked(b));
  const failures = withCover
    .filter((b) => isChecked(b) && !seen[b.id].ok)
    .map((b) => ({ id: b.id, title: b.title, ...seen[b.id] }));

  /** `again` re-tests everything; otherwise only what has no verdict yet. */
  const run = async (again = false) => {
    const queue = again ? withCover : unchecked;
    if (queue.length === 0) {
      toast.info('ตรวจครบทุกเล่มแล้ว');
      return;
    }

    setRunning(true);
    setProgress({ done: 0, total: queue.length });

    const one = async (book) => {
      try {
        // HEAD would be cheaper, but the proxies only implement GET.
        const res = await fetch(book.coverUrl, { cache: 'no-store' });
        return {
          url: book.coverUrl,
          ok: res.ok,
          reason: res.ok ? '' : res.headers.get('X-Cover-Error') || 'http-error',
          status: res.status,
        };
      } catch {
        return { url: book.coverUrl, ok: false, reason: 'proxy-threw', status: 0 };
      }
    };

    // Written away batch by batch, so stopping half way through — closing the
    // tab, losing the network — still banks what has been answered so far.
    let store = again ? {} : { ...seen };
    for (let i = 0; i < queue.length; i += BATCH) {
      const slice = queue.slice(i, i + BATCH);
      const verdicts = await Promise.all(slice.map(one));
      slice.forEach((book, n) => { store[book.id] = verdicts[n]; });
      try {
        localStorage.setItem(STORE, JSON.stringify(store));
      } catch {
        /* quota or private mode — the check still works, it just forgets */
      }
      setSeen(store);
      setProgress({ done: Math.min(i + BATCH, queue.length), total: queue.length });
    }

    setRunning(false);

    const bad = queue.filter((b) => store[b.id] && !store[b.id].ok).length;
    if (bad === 0) toast.success(`ตรวจ ${queue.length} เล่ม — ปกโหลดได้ทั้งหมด`);
    else toast.error(`ตรวจ ${queue.length} เล่ม — ปกเสีย ${bad}`);
  };

  const forget = () => {
    try {
      localStorage.removeItem(STORE);
    } catch {
      /* nothing to clear */
    }
    setSeen({});
  };

  // Only failures are listed, grouped by cause: one heading per fix. A wall of
  // four hundred "โหลดได้" rows is not a report — there is nothing to do with
  // a single one of them.
  const byReason = Object.entries(
    failures.reduce((acc, f) => {
      (acc[f.reason] ||= []).push(f);
      return acc;
    }, {})
  ).sort((a, b) => b[1].length - a[1].length);

  const checkedCount = withCover.length - unchecked.length;

  return (
    <section className={styles.box}>
      <div className={styles.head}>
        <h2 className={styles.title}>
          <Stethoscope size={16} className={styles.titleIcon} />
          ตรวจรูปหน้าปก
        </h2>
        <div className={styles.headActs}>
          {checkedCount > 0 && !running && (
            <button className="btn" onClick={forget} title="ลืมผลเดิม แล้วเริ่มนับใหม่">
              <RotateCcw size={15} /> ตรวจใหม่หมด
            </button>
          )}
          <button
            className="btn btn-solid"
            onClick={() => run(false)}
            disabled={running || unchecked.length === 0}
          >
            {running
              ? <><Loader2 size={15} className={styles.spin} /> {progress.done}/{progress.total}</>
              : unchecked.length === 0
                ? 'ตรวจครบแล้ว'
                : `ตรวจ ${unchecked.length.toLocaleString('th-TH')} เล่มที่เหลือ`}
          </button>
        </div>
      </div>

      {/* Counts, in place of the paragraph that used to explain them. */}
      <div className={styles.tallies}>
        <span className={styles.tally}>
          <CircleCheck size={14} className={styles.good} />
          ตรวจแล้ว {checkedCount.toLocaleString('th-TH')} / {withCover.length.toLocaleString('th-TH')}
        </span>
        {unchecked.length > 0 && (
          <span className={styles.tally}>
            <RotateCcw size={14} className={styles.pendingIcon} />
            ยังไม่ตรวจ {unchecked.length.toLocaleString('th-TH')}
          </span>
        )}
        <span className={styles.tally}>
          {failures.length === 0
            ? <><CircleCheck size={14} className={styles.good} /> ปกเสีย 0</>
            : <><CircleX size={14} className={styles.bad} /> ปกเสีย {failures.length.toLocaleString('th-TH')}</>}
        </span>
        {missing.length > 0 && (
          <span className={styles.tally}>
            <CircleX size={14} className={styles.bad} />
            ยังไม่มีปก {missing.length.toLocaleString('th-TH')}
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

      {checkedCount === withCover.length && failures.length === 0 && withCover.length > 0 && (
        <p className={styles.allGood}>
          <CircleCheck size={15} className={styles.good} />
          ปกโหลดได้ครบทุกเล่ม
        </p>
      )}
    </section>
  );
}
