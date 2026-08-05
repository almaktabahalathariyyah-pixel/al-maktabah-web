'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Search, Filter, X, User, Book, ArrowLeftRight, Building, Tag,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import BookCover from '@/components/BookCover';
import { useAuth } from '@/context/AuthContext';
import { collection, getDocs, query, orderBy, where, limit, startAfter } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { readCatalogRev } from '@/lib/catalogRev';
import { getLangPath } from '@/lib/langPath';
import AuthorSidebar from '@/components/AuthorSidebar';
import { asList, joinPeople, hasPerson } from '@/lib/people';
import styles from './page.module.css';

/** Filters that live in the URL, so a shelf can be linked to and bookmarked. */
const URL_FILTERS = ['category', 'type', 'language', 'year', 'publisher', 'person'];
/** Roughly three rows of covers on a laptop — enough to browse, not a wall. */
const PAGE_SIZE = 20;
/** Books fetched per Firestore round trip while the shelf fills in. */
const FETCH_CHUNK = 150;

/**
 * Search and filters run client-side over the whole shelf, so every visit
 * used to re-read every book from Firestore — on a Spark-tier daily quota,
 * a couple hundred ordinary page loads was enough to exhaust it with no bug
 * involved at all. The cache below keeps last visit's list in localStorage.
 *
 * Whether that copy is still good is settled by ONE document read: the
 * catalogue revision, bumped by every admin write. Same number, and the
 * shelf paints from the cache having read nothing else; different, and it
 * refetches. So a quiet day costs 1 read per visit instead of 432, and an
 * edit still reaches everyone on their next visit rather than a day later.
 *
 * The expiry below is now only a backstop for the case where a bump was
 * lost, or where the revision itself could not be read.
 */
const CACHE_VERSION = 2;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const cacheKey = (scope) => `al-maktabah:books:${scope}:v${CACHE_VERSION}`;

function readBookCache(scope) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey(scope));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.books) || typeof parsed.fetchedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeBookCache(scope, books, rev) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      cacheKey(scope),
      JSON.stringify({ books, rev, fetchedAt: Date.now() })
    );
  } catch {
    // Quota exceeded or storage disabled (private browsing) — caching is an
    // optimization, not a requirement, so just skip it.
  }
}

/** Normalizes the Timestamp to millis so cached books are plain JSON. */
function toBook(doc) {
  const data = doc.data();
  const createdAt =
    typeof data.createdAt?.toMillis === 'function' ? data.createdAt.toMillis() : Date.now();
  return { id: doc.id, ...data, createdAt };
}

const FILTER_LABELS = {
  category: 'หมวดหมู่',
  type: 'ประเภท',
  language: 'ภาษา',
  year: 'ปีพิมพ์',
  publisher: 'สำนักพิมพ์',
  person: 'บุคคล',
};

/**
 * Each group needs a mark that means only this.
 *
 * Translator was `Languages`, which is now the language filter's own glyph, and
 * type was `Bookmark`, which everywhere else means "saved to my shelf" — both
 * pointed the reader at the wrong idea.
 */
const SUGGESTION_GROUPS = [
  { key: 'title', label: 'ชื่อเรื่อง', icon: Book },
  { key: 'author', label: 'ผู้แต่ง', icon: User },
  { key: 'translator', label: 'ผู้แปล', icon: ArrowLeftRight },
  { key: 'publisher', label: 'สำนักพิมพ์', icon: Building },
  { key: 'type', label: 'ประเภท', icon: Tag },
];

/**
 * The page numbers to show, with gaps where numbers are skipped.
 *
 * 365 books at 20 a page is 19 pages, which fits; 10,000 would be 500 and would
 * not. So the list is always first, last, and a window around the current page,
 * with '…' standing in for the rest — the shape stays constant however far the
 * library grows.
 */
function pageWindow(current, total, span = 1) {
  const wanted = new Set([1, total]);
  for (let p = current - span; p <= current + span; p += 1) {
    if (p > 1 && p < total) wanted.add(p);
  }

  const sorted = [...wanted].sort((a, b) => a - b);
  const out = [];
  let previous = 0;

  for (const p of sorted) {
    // A single skipped number is not worth an ellipsis — show the number.
    if (p - previous === 2) out.push(previous + 1);
    else if (p - previous > 2) out.push(`gap-${p}`);
    out.push(p);
    previous = p;
  }
  return out;
}

/** Reads the opening state out of the address bar (client-only). */
function readUrlState() {
  if (typeof window === 'undefined') return { q: '', filters: {} };
  const params = new URLSearchParams(window.location.search);
  const filters = {};
  for (const key of URL_FILTERS) {
    const value = params.get(key);
    if (value) filters[key] = value;
  }
  return { q: params.get('q') || '', filters };
}

function BookCard({ book }) {
  return (
    <Link
      href={`/book/${getLangPath(book.language)}/${book.id}`}
      className={`${styles.item} hover-card`}
    >
      <div className={styles.coverWrap}>
        <BookCover src={book.coverUrl} title={book.title} author={book.author} />
      </div>
      <div className={styles.meta}>
        <h3 className={styles.bookTitle}>{book.title}</h3>
        {joinPeople(book.author) && (
          <p className={styles.author}>
            <User size={12} className={styles.authorIcon} /> {joinPeople(book.author)}
          </p>
        )}
      </div>
    </Link>
  );
}

export default function Home() {
  // Starts empty so the server and the first client render agree; the address
  // bar is read once on mount, below.
  const [queryText, setQueryText] = useState('');
  const [filters, setFilters] = useState({});
  const [sortOrder, setSortOrder] = useState('desc');
  const [urlReady, setUrlReady] = useState(false);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [page, setPage] = useState(1);

  const [fullyLoaded, setFullyLoaded] = useState(false);
  const searchRef = useRef(null);
  const { approved, isAdmin, loading: authLoading } = useAuth();

  const canSeeAll = approved || isAdmin;

  /**
   * Fills the shelf in chunks, painting after each one — or, when the
   * catalogue has not changed since this browser last looked, straight from
   * the cache without reading a single book document.
   *
   * Two reasons the cold-start fetch is not a single getDocs. The first page
   * now appears without waiting for the whole collection, and — since the
   * security rules judge a query by every document it could return — a
   * reader who is not approved has to ASK only for public titles. Requesting
   * everything would be refused outright rather than quietly filtered.
   */
  const load = useCallback(async () => {
    setLoadError(false);
    setFullyLoaded(false);

    const scope = canSeeAll ? 'full' : 'public';
    const cached = readBookCache(scope);
    if (cached) {
      setBooks(cached.books);
      setLoading(false);
    } else {
      setLoading(true);
    }

    // One document. Everything below hangs on whether it still matches.
    const rev = await readCatalogRev();

    // Same revision means no book has been added, edited or removed since
    // this list was cached, so there is nothing to ask for.
    if (cached && rev !== null && cached.rev === rev) {
      setFullyLoaded(true);
      setLoading(false);
      return;
    }

    // The revision was unreadable, but the cache is recent — better to show
    // a slightly old shelf than to spend 400 reads proving it was fine.
    if (cached && rev === null && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      setFullyLoaded(true);
      setLoading(false);
      return;
    }

    const base = collection(db, 'books');

    const scoped = (filterRestricted, ...extra) =>
      filterRestricted
        ? query(base, where('restricted', '==', false), orderBy('createdAt', 'desc'), ...extra)
        : query(base, orderBy('createdAt', 'desc'), ...extra);

    const fetchAll = async (filterRestricted) => {
      const collected = [];
      let cursor = null;

      for (;;) {
        const snapshot = await getDocs(
          cursor
            ? scoped(filterRestricted, startAfter(cursor), limit(FETCH_CHUNK))
            : scoped(filterRestricted, limit(FETCH_CHUNK))
        );
        if (snapshot.empty) break;

        snapshot.forEach((d) => collected.push(toBook(d)));
        setBooks([...collected]);
        setLoading(false);

        if (snapshot.size < FETCH_CHUNK) break;
        cursor = snapshot.docs[snapshot.docs.length - 1];
      }
      return collected;
    };

    try {
      const fetched = await fetchAll(!canSeeAll);
      writeBookCache(scope, fetched, rev);
      setFullyLoaded(true);
    } catch (error) {
      // The narrowed query needs a composite index and the new rules. Until
      // both are deployed it throws, so fall back to the plain query rather
      // than showing an empty library. Once the rules ARE live this fallback
      // is refused for a guest, and the error path below takes over.
      console.warn('Filtered query failed, retrying unfiltered:', error);
      try {
        const fetched = await fetchAll(false);
        writeBookCache(scope, fetched, rev);
        setFullyLoaded(true);
      } catch (retryError) {
        console.error('Error loading library:', retryError);
        if (!cached) setLoadError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [canSeeAll]);

  // Re-runs once the session settles, because what a reader may ask for
  // depends on whether they have been approved.
  useEffect(() => {
    if (authLoading) return;
    load();
  }, [load, authLoading]);

  // Adopt whatever the shared link asked for. This runs once, after mount,
  // so hydration never compares a server-rendered empty box against a
  // pre-filled one.
  useEffect(() => {
    const { q, filters: fromUrl } = readUrlState();
    if (q) setQueryText(q);
    if (Object.keys(fromUrl).length) setFilters(fromUrl);
    setUrlReady(true);
  }, []);

  // Mirror the current view back into the address bar. replaceState rather
  // than push: the back button should leave the library, not step through
  // every keystroke of a search.
  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams();
    if (queryText.trim()) params.set('q', queryText.trim());
    for (const key of URL_FILTERS) {
      if (filters[key]) params.set(key, filters[key]);
    }
    const search = params.toString();
    const next = `${window.location.pathname}${search ? `?${search}` : ''}`;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', next);
    }
  }, [queryText, filters, urlReady]);

  // "/" jumps to the search box the way it does in every library catalogue.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || document.activeElement?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const visibleBooks = useMemo(
    () => books.filter((book) => !book.restricted || approved),
    [books, approved]
  );

  const results = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    const filtered = visibleBooks.filter((book) => {
      for (const [key, value] of Object.entries(filters)) {
        if (!value) continue;
        if (key === 'person') {
          // Credited anywhere on the book, not only as the first name.
          if (!hasPerson(book.author, value) && !hasPerson(book.translator, value)) return false;
          continue;
        }
        // String conversion matters for year, which may be stored as a number.
        if (String(book[key] ?? '').trim() !== value) return false;
      }
      if (!q) return true;
      return `${book.title ?? ''} ${joinPeople(book.author, ' ')} ${joinPeople(book.translator, ' ')} ${book.publisher ?? ''}`
        .toLowerCase()
        .includes(q);
    });

    if (sortOrder === 'asc') {
      return filtered.reverse();
    }
    return filtered;
  }, [visibleBooks, filters, queryText, sortOrder]);

  // A fresh query or sort means a fresh first page.
  useEffect(() => {
    setPage(1);
  }, [queryText, filters, sortOrder]);

  // --- Autocomplete ---
  const suggestions = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return [];

    const buckets = { author: [], translator: [], publisher: [], type: [], title: [] };
    const seen = { author: new Set(), translator: new Set(), publisher: new Set(), type: new Set(), title: new Set() };
    const caps = { title: 3, author: 3, translator: 3, publisher: 2, type: 2 };

    for (const book of visibleBooks) {
      for (const key of Object.keys(buckets)) {
        // Each credited person is its own suggestion — searching for the
        // second author of a book has to offer that author, not "A,B".
        for (const value of asList(book[key])) {
          if (seen[key].has(value)) continue;
          if (buckets[key].length >= caps[key]) break;
          if (String(value).toLowerCase().includes(q)) {
            seen[key].add(value);
            buckets[key].push(value);
          }
        }
      }
    }

    // Flatten so arrow keys can walk the list as one sequence.
    return SUGGESTION_GROUPS.flatMap((group) =>
      buckets[group.key].map((value) => ({ ...group, value }))
    );
  }, [queryText, visibleBooks]);

  const suggestionsOpen = showSuggestions && queryText.trim() !== '' && suggestions.length > 0;

  useEffect(() => {
    setHighlight(-1);
  }, [queryText]);

  const activeFilters = Object.entries(filters).filter(([, v]) => Boolean(v));
  const activeCount = activeFilters.length;
  const narrowed = activeCount > 0 || queryText.trim() !== '';

  const uniqueSorted = useCallback(
    (key, sorter) =>
      // flatMap through asList: a two-author book puts both names in the rail,
      // and a single-string field still yields exactly one.
      Array.from(new Set(visibleBooks.flatMap((b) => asList(b[key])))).sort(sorter),
    [visibleBooks]
  );

  const thai = (a, b) => String(a).localeCompare(String(b), 'th');

  /**
   * The chip row runs on language, not category.
   *
   * Categories are a long tail — dozens of them, most holding one or two books,
   * so the row wrapped into a wall of pills nobody read. Language is the first
   * question a reader actually has, and there are only ever a handful. Counts
   * come along because "is there anything in Thai?" deserves an answer before
   * the click, and they double as a hint that the shelf is still filling in.
   */
  const languageChips = useMemo(() => {
    const counts = new Map();
    for (const book of visibleBooks) {
      const value = String(book.language ?? '').trim();
      if (!value) continue;
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    return Array.from(counts, ([value, count]) => ({ value, count }))
      // Biggest shelf first; ties fall back to Thai collation so the order is
      // stable rather than dependent on which book loaded first.
      .sort((a, b) => b.count - a.count || thai(a.value, b.value));
  }, [visibleBooks]);

  const categories = useMemo(() => uniqueSorted('category', thai), [uniqueSorted]);
  const authors = useMemo(() => uniqueSorted('author', thai), [uniqueSorted]);
  const translators = useMemo(() => uniqueSorted('translator', thai), [uniqueSorted]);
  const publishers = useMemo(() => uniqueSorted('publisher', thai), [uniqueSorted]);
  const types = useMemo(() => uniqueSorted('type', thai), [uniqueSorted]);
  const languages = useMemo(() => uniqueSorted('language', thai), [uniqueSorted]);
  const years = useMemo(
    () => uniqueSorted('year', (a, b) => Number(b) - Number(a)).map(String),
    [uniqueSorted]
  );

  const setFilter = (key, value) =>
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });

  const resetAll = () => {
    setFilters({});
    setQueryText('');
  };

  const applySuggestion = (item) => {
    if (item.key === 'title') setQueryText(item.value);
    else {
      setFilter(item.key, item.value);
      setQueryText('');
    }
    setShowSuggestions(false);
    setHighlight(-1);
  };

  const onSearchKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (suggestionsOpen) setShowSuggestions(false);
      else setQueryText('');
      return;
    }
    if (!suggestionsOpen) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault();
      applySuggestion(suggestions[highlight]);
    }
  };

  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  // The shelf can shrink under a new filter while sitting on a high page.
  const current = Math.min(page, pageCount);
  const shown = results.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  // A person can be one of two authors here and the sole translator there, so
  // a book can legitimately appear in both sections.
  const authored = filters.person ? results.filter((b) => hasPerson(b.author, filters.person)) : [];
  const translated = filters.person ? results.filter((b) => hasPerson(b.translator, filters.person)) : [];

  const goToPage = (next) => {
    setPage(next);
    // Otherwise page 5 opens halfway down page 4's covers.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const filterSelects = [
    ['category', categories],
    ['type', types],
    ['language', languages],
    ['year', years],
    ['publisher', publishers],
  ];

  return (
    <div className="container">
      <section className={styles.hero}>
        <p className="eyebrow">Al-Maktabah Al-Athariyyah</p>
        <h1 className={styles.heroTitle}>คลังหนังสืออิสลาม</h1>
        <p className={styles.heroSub}>
          รวบรวมตำราคลาสสิกไว้ในที่เดียว ค้นหาง่าย เปิดอ่านได้ทันที
        </p>
      </section>

      <header className={styles.bar}>
        <p className={styles.count} aria-live="polite">
          {loading
            ? 'กำลังโหลดรายการ…'
            : narrowed
              ? `พบ ${results.length.toLocaleString('th-TH')} จาก ${visibleBooks.length.toLocaleString('th-TH')} เล่ม`
              : `${visibleBooks.length.toLocaleString('th-TH')} เล่มในคลัง`}
          {!loading && !fullyLoaded && !loadError && (
            <span className={styles.stillLoading}> · กำลังโหลดเพิ่ม…</span>
          )}
        </p>

        <div className={styles.barTools}>
          <div className={styles.searchWrap}>
            <input
              ref={searchRef}
              className={styles.search}
              type="search"
              role="combobox"
              aria-expanded={suggestionsOpen}
              aria-controls="search-suggestions"
              aria-label="ค้นหาหนังสือ"
              autoComplete="off"
              placeholder="ค้นหาชื่อเรื่อง ผู้แต่ง สำนักพิมพ์…"
              value={queryText}
              onChange={(e) => {
                setQueryText(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onKeyDown={onSearchKeyDown}
              // A click on a suggestion fires after blur; give it room to land.
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            />
            {queryText && (
              <button
                className={styles.searchClear}
                onClick={() => {
                  setQueryText('');
                  searchRef.current?.focus();
                }}
                aria-label="ล้างคำค้นหา"
              >
                <X size={14} />
              </button>
            )}
            <Search size={15} className={styles.searchIcon} />
            {!queryText && (
              <kbd className={styles.kbd} aria-hidden>/</kbd>
            )}

            {suggestionsOpen && (
              <div className={styles.suggestions} id="search-suggestions" role="listbox">
                {SUGGESTION_GROUPS.map((group) => {
                  const items = suggestions.filter((s) => s.key === group.key);
                  if (items.length === 0) return null;
                  return (
                    <div key={group.key} className={styles.suggestionGroup}>
                      <div className={styles.suggestionTitle}>{group.label}</div>
                      {items.map((item) => {
                        const index = suggestions.indexOf(item);
                        const Icon = item.icon;
                        return (
                          <button
                            key={`${group.key}-${item.value}`}
                            role="option"
                            aria-selected={index === highlight}
                            className={`${styles.suggestionItem} ${index === highlight ? styles.suggestionOn : ''}`}
                            onMouseEnter={() => setHighlight(index)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applySuggestion(item)}
                          >
                            <Icon size={14} className={styles.suggestionIcon} />
                            <span className={styles.suggestionText}>{item.value}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            className={`btn ${showFilters ? 'btn-solid' : ''}`}
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-label="ตัวกรอง"
            title="ตัวกรอง"
          >
            <Filter size={15} />
            <span className={styles.hideMobile}>ตัวกรอง</span>
            {activeCount > 0 && <span className={styles.pip}>{activeCount}</span>}
          </button>
        </div>
      </header>

      {/* Whatever is narrowing the shelf stays visible and removable. */}
      {activeCount > 0 && (
        <div className={styles.activeRow}>
          {activeFilters.map(([key, value]) => (
            <button
              key={key}
              className={styles.activePill}
              onClick={() => setFilter(key, '')}
              title={`เอา${FILTER_LABELS[key] || key}ออก`}
            >
              <span className={styles.activeKey}>{FILTER_LABELS[key] || key}</span>
              {value}
              <X size={13} />
            </button>
          ))}
          <button className={styles.activeClear} onClick={resetAll}>
            ล้างทั้งหมด
          </button>
        </div>
      )}

      {showFilters && (
        <div className={styles.filterBottomRow}>
          {filterSelects.map(([key, options]) => (
            <div key={key} className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor={`filter-${key}`}>
                {FILTER_LABELS[key]}
              </label>
              <select
                id={`filter-${key}`}
                className={styles.filterSelect}
                value={filters[key] || ''}
                onChange={(e) => setFilter(key, e.target.value)}
              >
                <option value="">ทั้งหมด</option>
                {options.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          ))}
          <div className={`${styles.filterField} ${styles.sortFilterMobile}`}>
            <label className={styles.filterLabel} htmlFor="filter-sort">
              เรียงลำดับ
            </label>
            <select
              id="filter-sort"
              className={styles.filterSelect}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <option value="desc">ใหม่ไปเก่า</option>
              <option value="asc">เก่าไปใหม่</option>
            </select>
          </div>
        </div>
      )}

      <div className={styles.chipsRow}>
        {languageChips.length > 0 ? (
          <div className={styles.chips} role="group" aria-label="กรองตามภาษา">
            <button
              className={`chip ${!filters.language ? 'chip-on' : ''}`}
              onClick={() => setFilter('language', '')}
            >
              ทุกภาษา
              <span className={styles.chipCount}>
                {visibleBooks.length.toLocaleString('th-TH')}
              </span>
            </button>
            {languageChips.map(({ value, count }) => (
              <button
                key={value}
                className={`chip ${filters.language === value ? 'chip-on' : ''}`}
                onClick={() => setFilter('language', filters.language === value ? '' : value)}
              >
                {value}
                <span className={styles.chipCount}>{count.toLocaleString('th-TH')}</span>
              </button>
            ))}
          </div>
        ) : (
          <div />
        )}
        
        <div className={styles.sortFilter}>
          <select 
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className={styles.sortSelect}
          >
            <option value="desc">ใหม่ไปเก่า</option>
            <option value="asc">เก่าไปใหม่</option>
          </select>
        </div>
      </div>

      <div className={styles.layout}>
        <AuthorSidebar
          authors={authors}
          translators={translators}
          selectedPerson={filters.person || ''}
          onSelect={(name) => setFilter('person', name)}
        />

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
          ) : loadError ? (
            <div className={styles.emptyBlock}>
              <p className={styles.emptyLead}>โหลดคลังหนังสือไม่สำเร็จ</p>
              <p className={styles.emptyBody}>
                การเชื่อมต่ออาจขัดข้องชั่วคราว ลองโหลดใหม่อีกครั้ง
              </p>
              <button className="btn btn-solid" onClick={load}>ลองใหม่</button>
            </div>
          ) : results.length === 0 ? (
            <div className={styles.emptyBlock}>
              <p className={styles.emptyLead}>
                {visibleBooks.length === 0 ? 'ยังไม่มีหนังสือในคลัง' : 'ไม่พบหนังสือที่ตรงกับเงื่อนไข'}
              </p>
              <p className={styles.emptyBody}>
                {visibleBooks.length === 0
                  ? isAdmin
                    ? 'เริ่มต้นด้วยการเพิ่มเล่มแรก หรืออัปโหลดทีละหลายเล่มจากแผงควบคุม'
                    : 'โปรดติดตามหนังสือเล่มใหม่เร็วๆ นี้'
                  : 'ลองเปลี่ยนคำค้นหา หรือเอาตัวกรองบางตัวออก'}
              </p>
              {visibleBooks.length === 0 ? (
                isAdmin ? <Link href="/admin" className="btn btn-solid">ไปที่แผงควบคุม</Link> : null
              ) : (
                <button className="btn" onClick={resetAll}>ล้างทั้งหมด</button>
              )}
            </div>
          ) : filters.person ? (
            <div className={styles.personSections}>
              {authored.length > 0 && (
                <div>
                  <h2 className={styles.sectionHead}>ผลงานเขียน</h2>
                  <section className={`${styles.grid} stagger`}>
                    {authored.map((book) => <BookCard key={book.id} book={book} />)}
                  </section>
                </div>
              )}
              {translated.length > 0 && (
                <div>
                  <h2 className={styles.sectionHead}>ผลงานแปล</h2>
                  <section className={`${styles.grid} stagger`}>
                    {translated.map((book) => <BookCard key={book.id} book={book} />)}
                  </section>
                </div>
              )}
            </div>
          ) : (
            <>
              <section className={`${styles.grid} stagger`}>
                {shown.map((book) => <BookCard key={book.id} book={book} />)}
              </section>

              {pageCount > 1 && (
                <nav className={styles.pager} aria-label="หน้าของรายการหนังสือ">
                  <button
                    className={styles.pageStep}
                    onClick={() => goToPage(current - 1)}
                    disabled={current === 1}
                    aria-label="หน้าก่อนหน้า"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <ol className={styles.pageList}>
                    {pageWindow(current, pageCount).map((item) =>
                      typeof item === 'string' ? (
                        <li key={item} className={styles.pageGap} aria-hidden>…</li>
                      ) : (
                        <li key={item}>
                          <button
                            className={`${styles.pageNum} ${item === current ? styles.pageOn : ''}`}
                            onClick={() => goToPage(item)}
                            aria-label={`หน้า ${item}`}
                            aria-current={item === current ? 'page' : undefined}
                          >
                            {item.toLocaleString('th-TH')}
                          </button>
                        </li>
                      )
                    )}
                  </ol>

                  <button
                    className={styles.pageStep}
                    onClick={() => goToPage(current + 1)}
                    disabled={current === pageCount}
                    aria-label="หน้าถัดไป"
                  >
                    <ChevronRight size={16} />
                  </button>

                  <span className={styles.pageCount} aria-live="polite">
                    หน้า {current.toLocaleString('th-TH')} จาก {pageCount.toLocaleString('th-TH')}
                  </span>
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
