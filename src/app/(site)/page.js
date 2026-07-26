'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Search, SlidersHorizontal, X, User, Book, Languages, Building, Bookmark } from 'lucide-react';
import BookCover from '@/components/BookCover';
import FilterRail from '@/components/FilterRail';
import { useAuth } from '@/context/AuthContext';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { loadBookFields } from '@/lib/bookFields';
import { getLangPath } from '@/lib/langPath';
import styles from './page.module.css';

export default function Home() {
  const [queryText, setQueryText] = useState('');
  const [filters, setFilters] = useState({});
  const [books, setBooks] = useState([]);
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [railOpen, setRailOpen] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { approved, isAdmin } = useAuth();

  useEffect(() => {
    const load = async () => {
      try {
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

  const visibleBooks = useMemo(() => {
    return books.filter((book) => !book.restricted || approved);
  }, [books, approved]);

  const results = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return visibleBooks.filter((book) => {
      for (const [key, value] of Object.entries(filters)) {
        if (!value) continue;
        if (String(book[key] ?? '').trim() !== value) return false;
      }
      if (!q) return true;
      return `${book.title ?? ''} ${book.author ?? ''} ${book.translator ?? ''} ${book.publisher ?? ''}`
        .toLowerCase()
        .includes(q);
    });
  }, [visibleBooks, filters, queryText]);
  
  // --- Autocomplete Suggestions ---
  const suggestions = useMemo(() => {
    if (!queryText.trim()) return { author: [], translator: [], publisher: [], type: [], title: [] };
    const q = queryText.toLowerCase();
    
    const authors = new Set();
    const translators = new Set();
    const publishers = new Set();
    const types = new Set();
    const titles = new Set();
    
    // We search through the entire visibleBooks, not just the filtered results, 
    // so users can find facets outside current filters (selecting them will just add the filter)
    visibleBooks.forEach(b => {
      if (b.author && b.author.toLowerCase().includes(q)) authors.add(b.author);
      if (b.translator && b.translator.toLowerCase().includes(q)) translators.add(b.translator);
      if (b.publisher && b.publisher.toLowerCase().includes(q)) publishers.add(b.publisher);
      if (b.type && b.type.toLowerCase().includes(q)) types.add(b.type);
      if (b.title && b.title.toLowerCase().includes(q)) titles.add(b.title);
    });
    
    return {
      author: Array.from(authors).slice(0, 3),
      translator: Array.from(translators).slice(0, 3),
      publisher: Array.from(publishers).slice(0, 2),
      type: Array.from(types).slice(0, 2),
      title: Array.from(titles).slice(0, 3)
    };
  }, [queryText, visibleBooks]);

  const hasSuggestions = Object.values(suggestions).some(arr => arr.length > 0);

  const activeCount = Object.values(filters).filter(Boolean).length;
  const narrowed = activeCount > 0 || queryText.trim() !== '';

  const uniqueCategories = useMemo(() => {
    const cats = new Set();
    visibleBooks.forEach(b => {
      if (b.category) cats.add(b.category);
    });
    return Array.from(cats).sort();
  }, [visibleBooks]);

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const resetAll = () => { setFilters({}); setQueryText(''); };
  
  const handleSuggestionClick = (key, value) => {
    if (key === 'title') {
      // For titles, just set the query text
      setQueryText(value);
    } else {
      // For facets, apply the filter and clear query
      setFilter(key, value);
      setQueryText('');
    }
    setShowSuggestions(false);
  };

  return (
    <div className="container">
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <h1 className={styles.heroTitle}>คลังหนังสืออิสลาม</h1>
          <p className={styles.heroSub}>รวบรวมตำราคลาสสิกไว้ในที่เดียว ค้นหาง่าย ดาวน์โหลดได้ทันที</p>
        </div>
        <div className={styles.heroGlow} aria-hidden />
      </section>

      <header className={styles.bar}>
        <div className={styles.barText}>
          <h1 className={styles.title}>คลังหนังสือ</h1>
          <p className={styles.count}>
            {loading
              ? 'กำลังโหลด…'
              : narrowed
                ? `พบ ${results.length} จาก ${visibleBooks.length} เล่ม`
                : `${visibleBooks.length} เล่ม`}
          </p>
        </div>

        <div className={styles.barTools}>
          <div className={styles.searchWrap} style={{ position: 'relative' }}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.search}
              type="text"
              placeholder="ค้นหาชื่อเรื่อง ผู้แต่ง สำนักพิมพ์…"
              value={queryText}
              onChange={(e) => {
                setQueryText(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 250)}
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
            
            {showSuggestions && queryText.trim() && hasSuggestions && (
              <div className={styles.suggestions}>
                {suggestions.title.length > 0 && (
                  <div className={styles.suggestionGroup}>
                    <div className={styles.suggestionLabel}>ชื่อเรื่อง</div>
                    {suggestions.title.map(t => (
                      <button key={t} className={styles.suggestionItem} onClick={() => handleSuggestionClick('title', t)}>
                        <Book size={14} className={styles.suggestionIcon} />
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {suggestions.author.length > 0 && (
                  <div className={styles.suggestionGroup}>
                    <div className={styles.suggestionLabel}>ผู้แต่ง</div>
                    {suggestions.author.map(a => (
                      <button key={a} className={styles.suggestionItem} onClick={() => handleSuggestionClick('author', a)}>
                        <User size={14} className={styles.suggestionIcon} />
                        {a}
                      </button>
                    ))}
                  </div>
                )}
                {suggestions.translator.length > 0 && (
                  <div className={styles.suggestionGroup}>
                    <div className={styles.suggestionLabel}>ผู้แปล</div>
                    {suggestions.translator.map(t => (
                      <button key={t} className={styles.suggestionItem} onClick={() => handleSuggestionClick('translator', t)}>
                        <Languages size={14} className={styles.suggestionIcon} />
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {suggestions.publisher.length > 0 && (
                  <div className={styles.suggestionGroup}>
                    <div className={styles.suggestionLabel}>สำนักพิมพ์</div>
                    {suggestions.publisher.map(p => (
                      <button key={p} className={styles.suggestionItem} onClick={() => handleSuggestionClick('publisher', p)}>
                        <Building size={14} className={styles.suggestionIcon} />
                        {p}
                      </button>
                    ))}
                  </div>
                )}
                {suggestions.type.length > 0 && (
                  <div className={styles.suggestionGroup}>
                    <div className={styles.suggestionLabel}>ประเภท</div>
                    {suggestions.type.map(t => (
                      <button key={t} className={styles.suggestionItem} onClick={() => handleSuggestionClick('type', t)}>
                        <Bookmark size={14} className={styles.suggestionIcon} />
                        {t}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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

      {/* ---------------- Quick Category Chips ---------------- */}
      <div className={styles.chips}>
        <button className={`chip ${!filters.category ? 'chip-on' : ''}`} onClick={() => setFilter('category', '')}>ทั้งหมด</button>
        {uniqueCategories.map(cat => (
          <button key={cat} className={`chip ${filters.category === cat ? 'chip-on' : ''}`} onClick={() => setFilter('category', cat)}>{cat}</button>
        ))}
      </div>

      <div className={styles.layout}>
        {/* ---------------- Filters ---------------- */}
        <div className={`${styles.railWrap} ${railOpen ? styles.railOpen : ''}`}>
          <FilterRail
            fields={fields}
            books={visibleBooks}
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
                <div key={i} className={`${styles.skeleton} shimmer`}>
                  <div className={styles.skeletonCover} />
                  <div className={styles.skeletonLine} />
                  <div className={`${styles.skeletonLine} ${styles.skeletonShort}`} />
                </div>
              ))}
            </section>
          ) : results.length === 0 ? (
            <div className={styles.emptyBlock}>
              <p className={styles.emptyLead}>
                {visibleBooks.length === 0 ? 'ยังไม่มีหนังสือในคลัง' : 'ไม่พบหนังสือที่ตรงกับเงื่อนไข'}
              </p>
              <p className={styles.emptyBody}>
                {visibleBooks.length === 0
                  ? (isAdmin ? 'เริ่มต้นด้วยการเพิ่มเล่มแรก หรือนำเข้าทั้งหมดจาก Telegram ในครั้งเดียว' : 'โปรดติดตามหนังสือเล่มใหม่เร็วๆ นี้')
                  : 'ลองเปลี่ยนคำค้นหา หรือล้างตัวกรองบางตัวออก'}
              </p>
              {visibleBooks.length === 0 ? (
                isAdmin ? <Link href="/admin/new" className="btn btn-solid">เพิ่มหนังสือ</Link> : null
              ) : (
                <button className="btn" onClick={resetAll}>ล้างทั้งหมด</button>
              )}
            </div>
          ) : (
            <section className={`${styles.grid} stagger`}>
              {results.map((book) => {
                return (
                  <Link
                    key={book.id}
                    href={`/book/${getLangPath(book.language)}/${book.id}`}
                    className={`${styles.item} hover-card`}
                  >
                    <div className={styles.coverWrap}>
                      <BookCover
                        src={book.coverUrl}
                        title={book.title}
                        author={book.author}
                      />
                    </div>

                    <div className={styles.meta}>
                      <h3 className={styles.bookTitle}>{book.title}</h3>
                      <p className={styles.author}>
                        <User size={12} className={styles.authorIcon} />
                        {book.author}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
