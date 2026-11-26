'use client';

import { useState, useMemo } from 'react';
import { Download, FileText, Search, X, ExternalLink } from 'lucide-react';
import { PAMPHLETS, PAMPHLET_CATEGORIES, PAMPHLET_BUNDLES } from '@/lib/pamphlets';
import styles from './page.module.css';

export default function PamphletsPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [collection, setCollection] = useState('');

  const collections = useMemo(() => {
    const counts = new Map();
    for (const p of PAMPHLETS) {
      if (!p.collection) continue;
      counts.set(p.collection, (counts.get(p.collection) || 0) + 1);
    }
    return Array.from(counts, ([name, count]) => ({ name, count }));
  }, []);

  const needle = query.trim().toLowerCase();
  const shown = PAMPHLETS.filter((p) => {
    if (category && p.category !== category) return false;
    if (collection && p.collection !== collection) return false;
    if (!needle) return true;
    return `${p.num} ${p.titleTh} ${p.titleEn || ''} ${p.author || ''} ${p.collection || ''}`
      .toLowerCase()
      .includes(needle);
  });

  const filtering = Boolean(needle || category || collection);

  return (
    <div className="container">
      <header className={`${styles.header} rise`}>
        <p className="eyebrow">คลังแผ่นพับดะอ์วะฮ์ · ไฟล์ PDF พร้อมพิมพ์</p>
        <h1 className={styles.title}>
          แผ่นพับดะอ์วะฮ์ <em>PDF พร้อมพิมพ์</em>
        </h1>
        <p className="lede">
          รวบรวมแผ่นพับความรู้ศาสนาอิสลามฉบับภาษาไทย จัดหน้าเป็นไฟล์{' '}
          <strong>PDF พร้อมพิมพ์ 3 คอลัมน์ หน้า-หลัง (A4 แนวนอน)</strong>{' '}
          สามารถเปิดอ่าน ดาวน์โหลด และสั่งพิมพ์พับแจกจ่ายได้ทันที (ปัจจุบันมี{' '}
          {PAMPHLETS.length.toLocaleString('th-TH')} เรื่อง)
        </p>

        {PAMPHLET_BUNDLES.length > 0 && (
          <div className={styles.heroActions}>
            {PAMPHLET_BUNDLES.map((bundle) => (
              <div key={bundle.id} style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                <a
                  href={bundle.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-solid"
                >
                  <FileText size={16} aria-hidden />
                  {bundle.label}
                </a>
                <a
                  href={bundle.pdfUrl}
                  download={bundle.downloadName}
                  className="btn"
                >
                  <Download size={16} aria-hidden />
                  ดาวน์โหลดชุดรวม PDF
                </a>
              </div>
            ))}
          </div>
        )}
      </header>

      <div className={styles.searchWrap}>
        <Search size={16} className={styles.searchIcon} aria-hidden />
        <input
          type="text"
          className={styles.search}
          value={query}
          placeholder="ค้นหาชื่อเรื่องภาษาไทย, ภาษาอังกฤษ, ผู้เขียน หรือชุดแผ่นพับ…"
          onChange={(e) => setQuery(e.target.value)}
          aria-label="ค้นหาแผ่นพับ"
        />
        {query && (
          <button
            className={styles.searchClear}
            onClick={() => setQuery('')}
            aria-label="ล้างคำค้น"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className={styles.chips} role="group" aria-label="กรองตามหมวดหมู่">
        <button
          className={`chip ${!category ? 'chip-on' : ''}`}
          onClick={() => setCategory('')}
        >
          ทั้งหมด <span className={styles.chipCount}>{PAMPHLETS.length}</span>
        </button>
        {PAMPHLET_CATEGORIES.map((cat) => {
          const count = PAMPHLETS.filter((p) => p.category === cat.key).length;
          if (count === 0) return null;
          return (
            <button
              key={cat.key}
              className={`chip ${category === cat.key ? 'chip-on' : ''}`}
              onClick={() => setCategory(category === cat.key ? '' : cat.key)}
            >
              {cat.label} <span className={styles.chipCount}>{count}</span>
            </button>
          );
        })}
      </div>

      {collections.length > 1 && (
        <div className={styles.chips} role="group" aria-label="กรองตามชุดแผ่นพับ">
          <button
            className={`chip ${!collection ? 'chip-on' : ''}`}
            onClick={() => setCollection('')}
          >
            ทุกชุด
          </button>
          {collections.map((col) => (
            <button
              key={col.name}
              className={`chip ${collection === col.name ? 'chip-on' : ''}`}
              onClick={() => setCollection(collection === col.name ? '' : col.name)}
            >
              {col.name} <span className={styles.chipCount}>{col.count}</span>
            </button>
          ))}
        </div>
      )}

      {filtering && (
        <p className={styles.resultNote}>
          พบ {shown.length} จาก {PAMPHLETS.length} เรื่อง
        </p>
      )}

      {shown.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyLead}>ไม่พบแผ่นพับที่ค้นหา</p>
          <p className={styles.emptyBody}>ลองเปลี่ยนคำค้น หรือเลือกดูหมวดหมู่อื่น</p>
          <button
            className="btn btn-solid"
            onClick={() => { setQuery(''); setCategory(''); setCollection(''); }}
          >
            ดูทั้งหมด ({PAMPHLETS.length} เรื่อง)
          </button>
        </div>
      ) : (
        <section className={`${styles.grid} stagger`}>
          {shown.map((item) => (
            <article key={item.slug} className={styles.card}>
              <a
                href={item.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.coverLink}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.cover}
                  alt={item.titleTh}
                  className={styles.coverImg}
                  loading="lazy"
                />
                <span className={styles.coverBadge}>
                  PDF{item.num ? ` · #${item.num}` : ''}
                </span>
              </a>

              <div className={styles.cardBody}>
                <h2 className={styles.cardTitle}>
                  <a href={item.pdfUrl} target="_blank" rel="noopener noreferrer">
                    {item.titleTh}
                  </a>
                </h2>
                {item.titleEn && <p className={styles.cardEn}>{item.titleEn}</p>}
                <p className={styles.cardAuthor}>
                  {item.author ? `โดย: ${item.author}` : ''}
                  {item.author && item.collection ? ' · ' : ''}
                  {item.collection || ''}
                </p>

                <div className={styles.cardActions}>
                  <a
                    href={item.pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.btnOpen}
                  >
                    <FileText size={14} aria-hidden />
                    เปิดอ่าน PDF
                  </a>
                  <a
                    href={item.pdfUrl}
                    download={`${item.slug}.pdf`}
                    className={styles.btnJump}
                    title="ดาวน์โหลดไฟล์ PDF"
                  >
                    <Download size={14} aria-hidden />
                  </a>
                  {item.sourceUrl && (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.btnSource}
                      title="แหล่งต้นฉบับ"
                      aria-label="แหล่งต้นฉบับ"
                    >
                      <ExternalLink size={14} aria-hidden />
                    </a>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
