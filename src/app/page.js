'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import BookCover from '../components/BookCover';
import styles from './page.module.css';

// Mock records. `cover` will hold a real cover URL from Firestore;
// records without one fall back to a typographic binding.
// `restricted: true` = copyright-sensitive, released only to approved members.
const BOOKS = [
  { id: 1, title: 'Al-Aqeedah Al-Wasitiyyah', author: 'Ibn Taymiyyah', category: 'Aqeedah', year: 1998, pages: 210, cover: null, restricted: false },
  { id: 2, title: 'Fath al-Bari Sharh Sahih al-Bukhari', author: 'Ibn Hajar al-Asqalani', category: 'Hadith', year: 2001, pages: 1204, cover: null, restricted: true },
  { id: 3, title: 'Tafsir al-Sa‘di', author: 'Abd al-Rahman al-Sa‘di', category: 'Tafsir', year: 2010, pages: 960, cover: null, restricted: false },
  { id: 4, title: 'Zad al-Ma‘ad', author: 'Ibn al-Qayyim', category: 'Seerah', year: 1994, pages: 640, cover: null, restricted: false },
  { id: 5, title: 'Al-Umm', author: 'Imam al-Shafi‘i', category: 'Fiqh', year: 1990, pages: 880, cover: null, restricted: true },
  { id: 6, title: 'Riyad al-Salihin', author: 'Imam al-Nawawi', category: 'Hadith', year: 2005, pages: 432, cover: null, restricted: false },
  { id: 7, title: 'Al-Bidayah wa al-Nihayah', author: 'Ibn Kathir', category: 'History', year: 1997, pages: 1520, cover: null, restricted: true },
  { id: 8, title: 'Kitab al-Tawhid', author: 'Muhammad ibn Abd al-Wahhab', category: 'Aqeedah', year: 1988, pages: 186, cover: null, restricted: false },
];

const CATEGORIES = ['All', 'Aqeedah', 'Hadith', 'Tafsir', 'Fiqh', 'Seerah', 'History'];

export default function Home() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');

  // Mock membership — flip to preview the approved-member view.
  const [approved, setApproved] = useState(false);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BOOKS.filter((b) => {
      if (category !== 'All' && b.category !== category) return false;
      if (!q) return true;
      return `${b.title} ${b.author} ${b.category}`.toLowerCase().includes(q);
    });
  }, [query, category]);

  return (
    <div className="container">
      {/* ---------------- Opener ---------------- */}
      <section className={`${styles.opener} rise`}>
        <p className="eyebrow">The Collection</p>
        <h1 className={styles.headline}>
          Classical texts of the <em>athari</em> tradition, catalogued and kept.
        </h1>
        <p className="lede">
          Every volume is listed openly. Titles under copyright stay sealed until
          the owner grants you access.
        </p>
      </section>

      {/* ---------------- Toolbar ---------------- */}
      <section className={styles.toolbar}>
        <nav className={styles.cats}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`${styles.cat} ${category === cat ? styles.catOn : ''}`}
            >
              {cat}
            </button>
          ))}
        </nav>

        <div className={styles.searchWrap}>
          <Search size={15} className={styles.searchIcon} />
          <input
            className={styles.search}
            type="text"
            placeholder="Search the catalogue"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </section>

      <div className={styles.countRow}>
        <span className="eyebrow">
          {results.length} {results.length === 1 ? 'volume' : 'volumes'}
        </span>
        <button
          className={`${styles.access} ${approved ? styles.accessOn : ''}`}
          onClick={() => setApproved((v) => !v)}
          title="Preview member access (mock)"
        >
          {approved ? 'Approved member' : 'Viewing as guest'}
        </button>
      </div>

      {/* ---------------- Index ---------------- */}
      {results.length === 0 ? (
        <p className={styles.empty}>
          Nothing catalogued under “{query}”.
        </p>
      ) : (
        <section className={`${styles.grid} stagger`} key={category + query}>
          {results.map((book, i) => {
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
                    src={book.cover}
                    title={book.title}
                    author={book.author}
                  />
                  {sealed && <span className={styles.scrim} />}
                </div>

                <div className={styles.meta}>
                  <span className={styles.index}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className={styles.title}>{book.title}</h3>
                  <p className={styles.author}>{book.author}</p>
                  <p className={styles.detail}>
                    {book.category} · {book.year} · {book.pages} pp.
                  </p>
                  {book.restricted && (
                    <p className={styles.restricted}>
                      {sealed ? 'Access on request' : 'Released to you'}
                    </p>
                  )}
                </div>
              </Wrapper>
            );
          })}
        </section>
      )}
    </div>
  );
}
