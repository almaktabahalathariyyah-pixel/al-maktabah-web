'use client';

import { useState } from 'react';
import { Printer, BookOpen, Search, X, ExternalLink, FileText } from 'lucide-react';
import { PAMPHLETS, PAMPHLET_CATEGORIES } from '@/lib/pamphlets';
import styles from './page.module.css';

export default function PamphletsPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');

  const needle = query.trim().toLowerCase();
  const shown = PAMPHLETS.filter((p) => {
    if (category && p.category !== category) return false;
    if (!needle) return true;
    return `${p.num} ${p.titleTh} ${p.titleEn} ${p.author}`.toLowerCase().includes(needle);
  });

  const filtering = Boolean(needle || category);

  return (
    <div className="container">
      <header className={`${styles.header} rise`}>
        <p className="eyebrow">TROID Digital Daʿwah · ฉบับภาษาไทย</p>
        <h1 className={styles.title}>
          แผ่นพับดะอ์วะฮ์<em>พร้อมพิมพ์</em>ครบ 25 เรื่อง
        </h1>
        <p className="lede">
          แปลฉบับสมบูรณ์จากคลังแผ่นพับของ TROID และ Salafi Publications
          จัดวางบนกราฟิกต้นฉบับในรูปแบบ <strong>Desktop Trifold 3 คอลัมน์ หน้า-หลัง (A4 แนวนอน)</strong>{' '}
          สำหรับพิมพ์ 2 หน้าแล้วพับแจกจ่ายได้ทันที
        </p>

        <div className={styles.heroActions}>
          <a
            href="/pamphlets/all-trifolds-print.html"
            className="btn btn-solid"
          >
            <Printer size={16} aria-hidden />
            เปิดฉบับรวมพิมพ์ 3 คอลัมน์ (ครบ 25 เรื่อง / 50 หน้า)
          </a>
          <a
            href="/pamphlets/all-pamphlets-print.html"
            className="btn"
          >
            <BookOpen size={16} aria-hidden />
            ฉบับรวมเล่มอ่านยาว (A4 แนวตั้ง)
          </a>
        </div>
      </header>

      <div className={styles.searchWrap}>
        <Search size={16} className={styles.searchIcon} aria-hidden />
        <input
          type="text"
          className={styles.search}
          value={query}
          placeholder="ค้นหาชื่อเรื่องภาษาไทย, ภาษาอังกฤษ หรือชื่อผู้เขียน…"
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
            onClick={() => { setQuery(''); setCategory(''); }}
          >
            ดูทั้งหมด 25 เรื่อง
          </button>
        </div>
      ) : (
        <section className={`${styles.grid} stagger`}>
          {shown.map((item) => (
            <article key={item.num} className={styles.card}>
              <a href={item.trifoldUrl} className={styles.coverLink}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.cover}
                  alt={item.titleTh}
                  className={styles.coverImg}
                  loading="lazy"
                />
                <span className={styles.coverBadge}>แผ่นพับที่ {item.num}</span>
              </a>

              <div className={styles.cardBody}>
                <h2 className={styles.cardTitle}>
                  <a href={item.trifoldUrl}>{item.titleTh}</a>
                </h2>
                <p className={styles.cardEn}>{item.titleEn}</p>
                <p className={styles.cardAuthor}>โดย: {item.author}</p>

                <div className={styles.cardActions}>
                  <a href={item.trifoldUrl} className={styles.btnOpen}>
                    <FileText size={14} aria-hidden />
                    เปิด / พิมพ์ 3 คอลัมน์
                  </a>
                  <a
                    href={`/pamphlets/all-trifolds-print.html#trifold-${item.num}`}
                    className={styles.btnJump}
                    title="ดูในหน้าฉบับรวม 25 เรื่อง"
                  >
                    ในฉบับรวม
                  </a>
                  <a
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.btnSource}
                    title="ต้นฉบับภาษาอังกฤษที่ troid.org"
                    aria-label="ต้นฉบับภาษาอังกฤษที่ troid.org"
                  >
                    <ExternalLink size={14} aria-hidden />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
