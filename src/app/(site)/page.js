'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { Search, Lock, SlidersHorizontal, X } from 'lucide-react';
import BookCover from '@/components/BookCover';
import FilterRail from '@/components/FilterRail';
import { useAuth } from '@/context/AuthContext';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { loadBookFields } from '@/lib/bookFields';
import styles from './page.module.css';

export default function Home() {
  const [queryText, setQueryText] = useState('');
  const [filters, setFilters] = useState({});
  const [books, setBooks] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [railOpen, setRailOpen] = useState(false);
  // Signing in is not enough — restricted titles need the owner's approval.
  const { approved } = useAuth();

  useEffect(() => {
    const load = async () => {
      try {
        // Field config is a single document read; books are one collection read.
        const [fieldConfig, snapshot] = await Promise.all([
          loadBookFields(),
          getDocs(query(collection(db, 'books'), orderBy('createdAt', 'desc'))),
        ]);
        const fetched = [];
        snapshot.forEach((d) => fetched.push({ id: d.id, ...d.data() }));
        setFields(fieldConfig);
        setBooks(fetched);
      } catch (error) {
        console.error('Error loading library:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const results = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return books.filter((book) => {
      for (const [key, value] of Object.entries(filters)) {
        if (!value) continue;
        if (String(book[key] ?? '').trim() !== value) return false;
      }
      if (!q) return true;
      return `${book.title ?? ''} ${book.author ?? ''} ${book.translator ?? ''} ${book.publisher ?? ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [books, filters, queryText]);

  const activeCount = Object.values(filters).filter(Boolean).length;
  const narrowed = activeCount > 0 || queryText.trim() !== '';

  const setFilter = (key, value) =>
    setFilters((prev) => ({ ...prev, [key]: value }));
  const resetAll = () => { setFilters({}); setQueryText(''); };

  return (
    <div className="container">
      {/* ---------------- Compact header: the shelf is the page ---------------- */}
      <header className={styles.bar}>
        <div className={styles.barText}>
          <h1 className={styles.title}>คลังหนังสือ</h1>
          <p className={styles.count}>
            {loading
              ? 'กำลังโหลด…'
              : narrowed
                ? `พบ ${results.length} จาก ${books.length} เล่ม`
                : `${books.length} เล่ม`}
          </p>
        </div>

        <div className={styles.barTools}>
          <div className={styles.searchWrap}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.search}
              type="text"
              placeholder="ค้นหาชื่อเรื่อง ผู้แต่ง สำนักพิมพ์…"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
            />
            {queryText && (
              <button
                className={styles.searchClear}
                onClick={() => setQueryText('')}
                aria-label="ล้างคำค้นหา"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <button
            className={styles.railToggle}
            onClick={() => setRailOpen((v) => !v)}
          >
            <SlidersHorizontal size={15} />
            ตัวกรอง
            {activeCount > 0 && <span className={styles.pip}>{activeCount}</span>}
          </button>
        </div>
      </header>

      <div className={styles.layout}>
        {/* ---------------- Filters ---------------- */}
        <div className={`${styles.railWrap} ${railOpen ? styles.railOpen : ''}`}>
          <FilterRail
            fields={fields}
            books={books}
            active={filters}
            onChange={setFilter}
            onReset={resetAll}
          />
        </div>

        {/* ---------------- Shelf ---------------- */}
        <div className={styles.shelf}>
          {loading ? (
            <section className={styles.grid} aria-hidden>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className={styles.skeleton}>
                  <div className={styles.skeletonCover} />
                  <div className={styles.skeletonLine} />
                  <div className={`${styles.skeletonLine} ${styles.skeletonShort}`} />
                </div>
              ))}
            </section>
          ) : results.length === 0 ? (
            <div className={styles.emptyBlock}>
              <p className={styles.emptyLead}>
                {books.length === 0 ? 'ยังไม่มีหนังสือในคลัง' : 'ไม่พบหนังสือที่ตรงกับเงื่อนไข'}
              </p>
              <p className={styles.emptyBody}>
                {books.length === 0
                  ? 'เริ่มต้นด้วยการเพิ่มเล่มแรก หรือนำเข้าทั้งหมดจาก Telegram ในครั้งเดียว'
                  : 'ลองเปลี่ยนคำค้นหา หรือล้างตัวกรองบางตัวออก'}
              </p>
              {books.length === 0 ? (
                <Link href="/admin" className="btn">เพิ่มหนังสือ</Link>
              ) : (
                <button className="btn" onClick={resetAll}>ล้างทั้งหมด</button>
              )}
            </div>
          ) : (
            <section className={`${styles.grid} stagger`}>
              {results.map((book) => {
                const sealed = book.restricted && !approved;
                const Wrapper = sealed ? 'div' : Link;
                const props = sealed ? {} : { href: `/book/${book.id}` };

                return (
                  <Wrapper
                    key={book.id}
                    className={`${styles.item} ${sealed ? styles.sealed : ''}`}
                    {...props}
                  >
                    <div className={styles.coverWrap}>
                      <BookCover
                        src={book.coverUrl}
                        title={book.title}
                        author={book.author}
                      />
                      {sealed && (
                        <>
                          <span className={styles.scrim} />
                          <span className={styles.lockTag}>
                            <Lock size={12} /> ต้องขอสิทธิ์
                          </span>
                        </>
                      )}
                    </div>

                    <div className={styles.meta}>
                      <h3 className={styles.bookTitle}>{book.title}</h3>
                      <p className={styles.author}>{book.author}</p>
                    </div>
                  </Wrapper>
                );
              })}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
