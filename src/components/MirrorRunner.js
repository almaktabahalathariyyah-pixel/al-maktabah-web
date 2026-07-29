'use client';

import { useEffect, useRef, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { LifeBuoy, Play, Pause, Square, CheckCircle, AlertCircle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { mirrorToTelegram, canMirror, bookSizeBytes, MIRROR_LIMIT } from '@/lib/mirror';
import { useTabLock } from '@/lib/tabLock';
import styles from './MirrorRunner.module.css';

/**
 * Backs up every book that still needs it, in one pass.
 *
 * Mirroring used to happen inline during upload, which was the wrong place for
 * it. Telegram wants a pause between messages and Google Drive does not, so
 * pacing the mirror meant pacing the upload — eighteen minutes of waiting
 * across a full library, for a step that is not even on the critical path. And
 * when Telegram failed, the failure was scattered one book at a time with no
 * way to pick it back up.
 *
 * Here it is a single resumable job that can be run whenever, retried freely,
 * and stopped without consequence: a book with no backup still opens from Drive.
 */

const DELAY_MS = 3000; // Telegram allows roughly 20 messages a minute per channel
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function MirrorRunner() {
  const { user } = useAuth();
  const { toast } = useToast();
  // One pass at a time across the whole browser: two runners pacing themselves
  // at 3s each believe they are alone and together exceed what Telegram accepts.
  const { runExclusive, busyElsewhere } = useTabLock('mirror');

  const [pending, setPending] = useState([]);
  const [tooBig, setTooBig] = useState(0);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState(0);
  const [current, setCurrent] = useState('');
  const [lastError, setLastError] = useState('');

  const paused = useRef(false);
  const stopped = useRef(false);

  const scan = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'books'));
      const needs = [];
      let oversize = 0;

      snap.forEach((d) => {
        const data = d.data();
        if (!data.driveUrl || data.telegramFileId) return;
        const size = bookSizeBytes(data);
        if (canMirror(size)) {
          needs.push({ id: d.id, title: data.title || d.id, driveUrl: data.driveUrl, size });
        } else if (size > MIRROR_LIMIT) {
          oversize += 1;
        }
      });

      setPending(needs);
      setTooBig(oversize);
      setDone(0);
      setFailed(0);
      setLastError('');
    } catch (err) {
      console.error(err);
      toast.error('อ่านรายชื่อหนังสือไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = () =>
    runExclusive(runPass, () =>
      toast.error('การสำรองกำลังทำงานอยู่ในอีกแท็บ — ปิดแท็บนั้น หรือรอให้เสร็จก่อน')
    );

  const runPass = async () => {
    if (pending.length === 0) return;

    setRunning(true);
    paused.current = false;
    stopped.current = false;
    setIsPaused(false);
    setDone(0);
    setFailed(0);

    let ok = 0;
    let bad = 0;
    const remaining = [...pending];
    const finished = new Set();

    for (const book of remaining) {
      if (stopped.current) break;
      while (paused.current && !stopped.current) await sleep(400);
      if (stopped.current) break;

      setCurrent(book.title);

      try {
        const idToken = await user.getIdToken();
        const result = await mirrorToTelegram({
          idToken,
          bookId: book.id,
          driveUrl: book.driveUrl,
          title: book.title,
          sizeBytes: book.size,
          persist: true,
        });

        if (result.ok) {
          ok += 1;
          finished.add(book.id);
          setDone(ok);
        } else {
          bad += 1;
          setFailed(bad);
          setLastError(result.error);
        }
      } catch (err) {
        bad += 1;
        setFailed(bad);
        setLastError(err.message);
      }

      await sleep(DELAY_MS);
    }

    // Drop what succeeded so a second run only retries what is left.
    setPending((prev) => prev.filter((b) => !finished.has(b.id)));
    setCurrent('');
    setRunning(false);

    if (stopped.current) return;
    if (bad === 0) toast.success(`สำรองสำเร็จ ${ok} เล่ม`);
    else toast.error(`สำเร็จ ${ok} · ไม่สำเร็จ ${bad} — กดเริ่มอีกครั้งเพื่อลองใหม่`);
  };

  const total = pending.length + done;
  const percent = total > 0 ? Math.round(((done + failed) / total) * 100) : 0;
  const minutes = Math.ceil((pending.length * (DELAY_MS + 1500)) / 60000);

  if (loading) return <p className={styles.state}>กำลังตรวจรายการ…</p>;

  return (
    <section className={styles.wrap}>
      <header className={styles.head}>
        <h3 className={styles.title}>
          <LifeBuoy size={17} /> สำรองไปที่ Telegram
        </h3>
        {!running && (
          <button className={styles.rescan} onClick={scan}>ตรวจใหม่</button>
        )}
      </header>

      {pending.length === 0 && !running ? (
        <p className={styles.allGood}>
          <CheckCircle size={15} /> ทุกเล่มที่สำรองได้ มีสำเนาครบแล้ว
        </p>
      ) : (
        <>
          <p className={styles.summary}>
            <strong>{pending.length}</strong> เล่มยังไม่มีสำเนาสำรอง
            {!running && pending.length > 0 && <> · ใช้เวลาราว {minutes} นาที</>}
          </p>

          {running && (
            <>
              <div className={styles.track}>
                <div className={styles.fill} style={{ width: `${percent}%` }} />
              </div>
              <p className={styles.now}>
                {isPaused ? 'หยุดชั่วคราว' : `กำลังสำรอง: ${current}`}
                {' · '}สำเร็จ {done}
                {failed > 0 && ` · ไม่สำเร็จ ${failed}`}
              </p>
            </>
          )}

          {!running && (done > 0 || failed > 0) && (
            <p className={styles.now}>สำเร็จ {done} · ไม่สำเร็จ {failed}</p>
          )}

          {lastError && (
            <p className={styles.err}>
              <AlertCircle size={14} /> {lastError}
            </p>
          )}

          <div className={styles.actions}>
            {running ? (
              <>
                <button
                  className="btn"
                  onClick={() => {
                    paused.current = !paused.current;
                    setIsPaused(paused.current);
                  }}
                >
                  {isPaused ? <><Play size={15} /> ทำต่อ</> : <><Pause size={15} /> หยุดชั่วคราว</>}
                </button>
                <button
                  className="btn"
                  onClick={() => { stopped.current = true; paused.current = false; }}
                >
                  <Square size={15} /> หยุด
                </button>
              </>
            ) : (
              <button
                className="btn btn-solid"
                onClick={run}
                disabled={pending.length === 0 || busyElsewhere}
              >
                <Play size={15} />
                {busyElsewhere ? 'กำลังทำงานในอีกแท็บ' : `เริ่มสำรอง ${pending.length} เล่ม`}
              </button>
            )}
          </div>
        </>
      )}

      {busyElsewhere && !running && (
        <p className={styles.note}>
          มีอีกแท็บกำลังสำรองอยู่ ปุ่มจะกลับมากดได้เองเมื่อแท็บนั้นทำเสร็จหรือถูกปิด
        </p>
      )}

      {tooBig > 0 && (
        <p className={styles.note}>
          อีก {tooBig} เล่มใหญ่เกิน 20MB จึงสำรองไปที่ Telegram ไม่ได้ — เล่มเหล่านี้พึ่ง Google Drive อย่างเดียว
        </p>
      )}

      <p className={styles.note}>
        หยุดกลางคันได้ทุกเมื่อ กลับมากดต่อภายหลังได้ · เล่มที่ยังไม่มีสำเนายังเปิดอ่านได้ตามปกติ
        สำเนานี้ใช้เมื่อ Drive ติดโควตาดาวน์โหลดรายวันเท่านั้น
      </p>
    </section>
  );
}
