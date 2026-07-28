'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Globe, MonitorPlay, Send, Users, HardDrive, Library, Link2, ArrowUpRight, Compass,
} from 'lucide-react';
import { loadSources, SOURCE_KINDS, kindOf } from '@/lib/sources';
import styles from './page.module.css';

/** Resolved here rather than in lib/sources so that module stays renderable
    from anywhere, including a server component. */
const ICONS = { Globe, MonitorPlay, Send, Users, HardDrive, Library, Link2 };

function SourceCard({ source }) {
  const kind = kindOf(source.kind);
  const Icon = ICONS[kind.icon] || Link2;

  let host = '';
  try {
    host = new URL(source.url).hostname.replace(/^www\./, '');
  } catch {
    /* loadSources already rejected anything unparseable */
  }

  return (
    <a
      className={`${styles.card} hover-card`}
      href={source.url}
      target="_blank"
      // noreferrer as well as noopener: these are third-party sites and there
      // is no reason to tell them which shelf the reader came from.
      rel="noopener noreferrer"
    >
      <span className={`${styles.cardIcon} ${styles[source.kind] || ''}`}>
        <Icon size={18} />
      </span>

      <span className={styles.cardBody}>
        <span className={styles.cardTitle}>{source.title}</span>
        {source.description && (
          <span className={styles.cardDesc}>{source.description}</span>
        )}
        <span className={styles.cardHost}>{host}</span>
      </span>

      <ArrowUpRight size={15} className={styles.cardGo} aria-hidden />
    </a>
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
    <div className="container">
      <header className={`${styles.header} rise`}>
        <p className="eyebrow">แหล่งหนังสืออื่นๆ</p>
        <h1 className={styles.title}>
          ที่อื่นที่มีหนังสือดีๆ ให้<em>อ่านต่อ</em>
        </h1>
        <p className="lede">
          รวมเว็บไซต์ ช่องยูทูป ช่องเทเลแกรม เพจเฟซบุ๊ก และโฟลเดอร์ไดรฟ์
          ที่เผยแพร่ตำราและบทเรียนไว้ให้ค้นต่อ — คลังนี้เพียงรวบรวมลิงก์ไว้
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
        <div className={styles.grid} aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
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
          <span className={styles.emptyIcon}><Compass size={22} /></span>
          <p className={styles.emptyLead}>ยังไม่มีแหล่งหนังสือในรายการ</p>
          <p className={styles.emptyBody}>
            ระหว่างนี้เปิดดูคลังของเราได้เลย มีตำราหลายภาษาหลายแนวให้เลือกอ่าน
          </p>
          <Link href="/" className="btn btn-solid">ดูคลังหนังสือ</Link>
        </div>
      ) : (
        <section className={`${styles.grid} stagger`}>
          {shown.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </section>
      )}
    </div>
  );
}
