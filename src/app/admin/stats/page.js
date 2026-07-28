'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { BookOpen, Download, HardDrive, TrendingUp, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { getLangPath } from '@/lib/langPath';
import { dayKey } from '@/lib/stats';
import { formatBytes } from '@/lib/googleDrive';
import { canMirror, bookSizeBytes } from '@/lib/mirror';
import MirrorRunner from '@/components/MirrorRunner';
import styles from './page.module.css';

const WINDOW_DAYS = 30;

/** The last N day keys, oldest first, so gaps show as zero rather than vanish. */
function recentDays(count) {
  const days = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(dayKey(d));
  }
  return days;
}

export default function StatsPage() {
  const [books, setBooks] = useState([]);
  const [daily, setDaily] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const [bookSnap, statSnap] = await Promise.all([
          getDocs(collection(db, 'books')),
          // Pre-aggregated: ~30 documents, not one per download ever recorded.
          getDocs(query(collection(db, 'stats'), orderBy('day', 'desc'), limit(WINDOW_DAYS))),
        ]);
        if (!alive) return;

        const rows = [];
        bookSnap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        setBooks(rows);

        const totals = {};
        statSnap.forEach((d) => { totals[d.id] = d.data(); });
        setDaily(totals);
      } catch (err) {
        console.error('Error loading stats:', err);
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
  }, []);

  const summary = useMemo(() => {
    const totalBytes = books.reduce((sum, b) => sum + bookSizeBytes(b), 0);
    const sized = books.filter((b) => bookSizeBytes(b) > 0).length;
    const avgBytes = sized > 0 ? totalBytes / sized : 0;

    return {
      total: books.length,
      restricted: books.filter((b) => b.restricted).length,
      noFile: books.filter((b) => !b.driveUrl && !b.telegramFileId && !b.telegramUrl).length,
      telegramOnly: books.filter((b) => !b.driveUrl && (b.telegramFileId || b.telegramUrl)).length,
      // Eligible for a Telegram backup but not mirrored yet.
      unmirrored: books.filter(
        (b) => b.driveUrl && !b.telegramFileId && canMirror(bookSizeBytes(b))
      ).length,
      noCover: books.filter((b) => !b.coverUrl).length,
      downloads: books.reduce((sum, b) => sum + (b.downloadCount || 0), 0),
      totalBytes,
      avgBytes,
      sized,
    };
  }, [books]);

  const series = useMemo(() => {
    const days = recentDays(WINDOW_DAYS);
    const values = days.map((day) => ({ day, total: daily[day]?.total || 0 }));
    const peak = Math.max(1, ...values.map((v) => v.total));
    return { values, peak, sum: values.reduce((a, v) => a + v.total, 0) };
  }, [daily]);

  const topBooks = useMemo(
    () => [...books].sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0)).slice(0, 8),
    [books]
  );

  if (loading) {
    return <div className="container" style={{ paddingTop: '3rem' }}>กำลังโหลดสถิติ…</div>;
  }

  const cards = [
    { icon: BookOpen, label: 'หนังสือทั้งหมด', value: summary.total.toLocaleString('th-TH') },
    { icon: Download, label: 'ยอดเปิดอ่านสะสม', value: summary.downloads.toLocaleString('th-TH') },
    {
      icon: HardDrive,
      label: 'ขนาดคลังโดยประมาณ',
      value: formatBytes(summary.totalBytes),
      note: summary.sized < summary.total
        ? `คำนวณจาก ${summary.sized} เล่มที่บันทึกขนาดไว้`
        : null,
    },
    {
      icon: TrendingUp,
      label: `เปิดอ่าน ${WINDOW_DAYS} วันล่าสุด`,
      value: series.sum.toLocaleString('th-TH'),
    },
  ];

  // A rough runway so the owner can decide about storage before hitting a wall.
  const projection = summary.avgBytes > 0
    ? {
        avg: formatBytes(summary.avgBytes),
        per15gb: Math.floor((15 * 1024 ** 3) / summary.avgBytes),
        per100gb: Math.floor((100 * 1024 ** 3) / summary.avgBytes),
        per2tb: Math.floor((2 * 1024 ** 4) / summary.avgBytes),
      }
    : null;

  return (
    <div className="container" style={{ paddingBottom: '4rem' }}>
      <header className={styles.header}>
        <p className="eyebrow">ผู้ดูแลระบบ</p>
        <h1 className={styles.title}>สถิติและสุขภาพคลัง</h1>
        <p className="lede">ภาพรวมการใช้งาน พื้นที่ที่ใช้ และเล่มที่ยังมีปัญหา</p>
      </header>

      <div className={styles.cards}>
        {cards.map((card) => (
          <div key={card.label} className={styles.card}>
            <card.icon size={17} className={styles.cardIcon} />
            <div className={styles.cardValue}>{card.value}</div>
            <div className={styles.cardLabel}>{card.label}</div>
            {card.note && <div className={styles.cardNote}>{card.note}</div>}
          </div>
        ))}
      </div>

      {/* ---------- Health ---------- */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>สุขภาพไฟล์</h2>

        {summary.noFile === 0 && summary.telegramOnly === 0 && summary.unmirrored === 0 ? (
          <p className={styles.allGood}>ทุกเล่มมีไฟล์ใน Google Drive และมีสำเนาสำรองครบแล้ว</p>
        ) : (
          <div className={styles.alerts}>
            {summary.noFile > 0 && (
              <Link href="/admin?health=nofile" className={`${styles.alert} ${styles.alertHot}`}>
                <AlertTriangle size={16} />
                <span>
                  <strong>{summary.noFile} เล่มไม่มีไฟล์เลย</strong>
                  เปิดอ่านไม่ได้ — ต้องอัปโหลด PDF เพิ่ม
                </span>
              </Link>
            )}
            {summary.telegramOnly > 0 && (
              <Link href="/admin?health=telegram" className={styles.alert}>
                <AlertTriangle size={16} />
                <span>
                  <strong>{summary.telegramOnly} เล่มมีแต่ไฟล์ Telegram</strong>
                  เล่มที่ใหญ่กว่า 20MB จะเปิดไม่ได้ — ควรอัปขึ้น Drive
                </span>
              </Link>
            )}
          </div>
        )}

        <div style={{ marginTop: '1.25rem' }}>
          <MirrorRunner />
        </div>


        <p className={styles.subNote}>
          {summary.noCover > 0
            ? `${summary.noCover} เล่มยังไม่มีภาพหน้าปก (ระบบแสดงปกตัวอักษรแทน)`
            : 'ทุกเล่มมีภาพหน้าปกแล้ว'}
        </p>
      </section>

      {/* ---------- Storage runway ---------- */}
      {projection && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>ประมาณการพื้นที่</h2>
          <p className={styles.subNote}>
            ขนาดเฉลี่ยต่อเล่มตอนนี้ <strong>{projection.avg}</strong> — ที่อัตรานี้เก็บได้ราวๆ
          </p>
          <div className={styles.runway}>
            <div className={styles.runwayItem}>
              <span className={styles.runwayValue}>{projection.per15gb.toLocaleString('th-TH')}</span>
              <span className={styles.runwayLabel}>เล่ม · Drive ฟรี 15GB</span>
            </div>
            <div className={styles.runwayItem}>
              <span className={styles.runwayValue}>{projection.per100gb.toLocaleString('th-TH')}</span>
              <span className={styles.runwayLabel}>เล่ม · Google One 100GB</span>
            </div>
            <div className={styles.runwayItem}>
              <span className={styles.runwayValue}>{projection.per2tb.toLocaleString('th-TH')}</span>
              <span className={styles.runwayLabel}>เล่ม · Google One 2TB</span>
            </div>
          </div>
        </section>
      )}

      {/* ---------- Daily chart ---------- */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>การเปิดอ่านรายวัน</h2>
        {series.sum === 0 ? (
          <p className={styles.subNote}>ยังไม่มีข้อมูลการเปิดอ่านในช่วง {WINDOW_DAYS} วันที่ผ่านมา</p>
        ) : (
          <div className={styles.chart} role="img" aria-label={`กราฟการเปิดอ่าน ${WINDOW_DAYS} วันล่าสุด`}>
            {series.values.map((v) => (
              <div key={v.day} className={styles.barWrap} title={`${v.day} · ${v.total} ครั้ง`}>
                <div
                  className={styles.bar}
                  style={{ height: `${Math.max(2, (v.total / series.peak) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Most read ---------- */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>เล่มที่ถูกเปิดมากที่สุด</h2>
        {topBooks.length === 0 || !topBooks[0]?.downloadCount ? (
          <p className={styles.subNote}>ยังไม่มีสถิติการเปิดอ่าน</p>
        ) : (
          <ol className={styles.top}>
            {topBooks
              .filter((b) => b.downloadCount)
              .map((b, i) => (
                <li key={b.id} className={styles.topRow}>
                  <span className={styles.topRank}>{i + 1}</span>
                  <Link href={`/book/${getLangPath(b.language)}/${b.id}`} className={styles.topTitle}>
                    {b.title}
                  </Link>
                  <span className={styles.topCount}>{b.downloadCount.toLocaleString('th-TH')}</span>
                </li>
              ))}
          </ol>
        )}
      </section>
    </div>
  );
}
