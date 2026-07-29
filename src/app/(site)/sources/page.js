'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Globe, MonitorPlay, Send, Users, HardDrive, Library, Link2, ArrowUpRight,
} from 'lucide-react';
import { loadSources, SOURCE_KINDS, kindOf } from '@/lib/sources';
import styles from './page.module.css';

/** Resolved here rather than in lib/sources so that module stays renderable
    from anywhere, including a server component. */
const ICONS = { Globe, MonitorPlay, Send, Users, HardDrive, Library, Link2 };

/**
 * One row, not one card.
 *
 * A grid of boxes, each with a coloured icon puck and a lift-on-hover, gave
 * seven links the weight of seven products. This is a directory: the useful
 * comparison is down the column — title against title, host against host —
 * which a list on a shared baseline gives and a card grid does not.
 */
function SourceRow({ source }) {
  const kind = kindOf(source.kind);
  const Icon = ICONS[kind.icon] || Link2;

  let host = '';
  try {
    host = new URL(source.url).hostname.replace(/^www\./, '');
  } catch {
    /* loadSources already rejected anything unparseable */
  }

  return (
    <li className={styles.row}>
      <a
        className={styles.link}
        href={source.url}
        target="_blank"
        // noreferrer as well as noopener: these are third-party sites and there
        // is no reason to tell them which shelf the reader came from.
        rel="noopener noreferrer"
      >
        <Icon size={16} className={styles.icon} aria-hidden />

        <span className={styles.text}>
          <span className={styles.title}>{source.title}</span>
          {source.description && (
            <span className={styles.desc}>{source.description}</span>
          )}
          <span className={styles.meta}>
            <span className={styles.host}>{host}</span>
            <span className={styles.dot} aria-hidden>·</span>
            <span>{kind.label}</span>
          </span>
        </span>

        <ArrowUpRight size={15} className={styles.go} aria-hidden />
      </a>
    </li>
  );
}

export default function SourcesPage() {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [kindFilter, setKindFilter] = useState('');

  useEffect(() => {
    let alive = true;
    loadSources()
      .then((items) => {
        if (!alive) return;
        setSources(items);
      })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  // Only offer a chip for kinds that actually have something behind them.
  const present = SOURCE_KINDS.map((kind) => ({
    ...kind,
    count: sources.filter((s) => s.kind === kind.key).length,
  })).filter((kind) => kind.count > 0);

  const shown = kindFilter ? sources.filter((s) => s.kind === kindFilter) : sources;

  return (
    <div className={`container ${styles.page}`}>
      <header className={`${styles.header} rise`}>
        <p className="eyebrow">แหล่งหนังสืออื่นๆ</p>
        <h1 className={styles.pageTitle}>ที่อื่นที่มีหนังสือดีๆ ให้อ่านต่อ</h1>
        <p className="lede">
          รวมเว็บไซต์ ช่องยูทูป ช่องเทเลแกรม เพจเฟซบุ๊ก และโฟลเดอร์ไดรฟ์
          ที่เผยแพร่ตำราและบทเรียนไว้ให้ค้นต่อ คลังนี้เพียงรวบรวมลิงก์ไว้
          เนื้อหาและการดูแลเป็นของแต่ละแหล่งเอง
        </p>
      </header>

      {present.length > 1 && (
        <div className={styles.chips} role="group" aria-label="กรองตามประเภทแหล่ง">
          <button
            className={`chip ${!kindFilter ? 'chip-on' : ''}`}
            onClick={() => setKindFilter('')}
          >
            ทั้งหมด <span className={styles.chipCount}>{sources.length}</span>
          </button>
          {present.map((kind) => (
            <button
              key={kind.key}
              className={`chip ${kindFilter === kind.key ? 'chip-on' : ''}`}
              onClick={() => setKindFilter(kindFilter === kind.key ? '' : kind.key)}
            >
              {kind.label} <span className={styles.chipCount}>{kind.count}</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className={styles.list} aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`${styles.skeleton} shimmer`} />
          ))}
        </div>
      ) : failed ? (
        <div className={styles.empty}>
          <p className={styles.emptyLead}>โหลดรายการไม่สำเร็จ</p>
          <p className={styles.emptyBody}>การเชื่อมต่ออาจขัดข้องชั่วคราว ลองโหลดหน้านี้ใหม่อีกครั้ง</p>
        </div>
      ) : shown.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyLead}>ยังไม่มีแหล่งหนังสือในรายการ</p>
          <p className={styles.emptyBody}>
            ระหว่างนี้เปิดดูคลังของเราได้เลย มีตำราหลายภาษาหลายแนวให้เลือกอ่าน
          </p>
          <Link href="/" className={styles.emptyLink}>
            <span className="tlink">ดูคลังหนังสือ</span>
          </Link>
        </div>
      ) : (
        <ul className={styles.list}>
          {shown.map((source) => (
            <SourceRow key={source.id} source={source} />
          ))}
        </ul>
      )}
    </div>
  );
}
