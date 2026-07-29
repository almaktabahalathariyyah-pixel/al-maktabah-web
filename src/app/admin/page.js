'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, query, orderBy, writeBatch } from 'firebase/firestore';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import Link from 'next/link';
import { Search, Plus, Download, Edit2, Trash2, LayoutGrid, List, UploadCloud, Filter, Mail } from 'lucide-react';
import { getLangPath } from '@/lib/langPath';
import { getDropdownSettings } from '@/lib/settings';
import Select from 'react-select';
import { selectStyles } from '@/lib/selectStyles';
import {
  loadGoogleScript,
  readSavedToken,
  connectDrive,
  deleteFromDrive,
  DELETE_REASONS,
} from '@/lib/googleDrive';
import { canMirror, bookSizeBytes } from '@/lib/mirror';
import BookFormPanel from '@/components/BookFormPanel';
import BulkUploadPanel from '@/components/BulkUploadPanel';
import styles from './page.module.css';
import { useAdmin } from '@/context/AdminContext';

const GOOGLE_PROMPT = `เธขเธฑเธเนเธกเนเนเธ”เนเน€เธเธทเนเธญเธกเธ•เนเธญ Google Drive (เธซเธฃเธทเธญเธชเธดเธ—เธเธดเนเธซเธกเธ”เธญเธฒเธขเธธเนเธฅเนเธง)
เธ–เนเธฒเธฅเธเน€เธเธเธฒเธฐเนเธเน€เธงเนเธ เนเธเธฅเนเนเธเนเธ”เธฃเธเนเธเธฐเธขเธฑเธเธญเธขเธนเนเนเธฅเธฐเธขเธฑเธเธเธดเธเธเธทเนเธเธ—เธตเนเธญเธขเธนเน`;

function pageWindow(current, total, span = 1) {
  const wanted = new Set([1, total]);
  for (let p = current - span; p <= current + span; p += 1) {
    if (p > 1 && p < total) wanted.add(p);
  }

  const sorted = [...wanted].sort((a, b) => a - b);
  const out = [];
  let previous = 0;

  for (const p of sorted) {
    if (p - previous === 2) out.push(previous + 1);
    else if (p - previous > 2) out.push(`gap-${p}`);
    out.push(p);
    previous = p;
  }
  return out;
}

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, ask } = useConfirm();

  const [books, setBooks] = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [predefinedCategories, setPredefinedCategories] = useState([]);
  const [predefinedAuthors, setPredefinedAuthors] = useState([]);
  const [predefinedTranslators, setPredefinedTranslators] = useState([]);
  const [predefinedPublishers, setPredefinedPublishers] = useState([]);
  const [predefinedLanguages, setPredefinedLanguages] = useState([]);
  const [predefinedTypes, setPredefinedTypes] = useState([]);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'card'

  // Form Panel State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [editingBookId, setEditingBookId] = useState(null);
  
  // Admin Context for Sidebar Auto-Collapse
  const { setIsSidebarOpen } = useAdmin();
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [translatorFilter, setTranslatorFilter] = useState('');
  const [publisherFilter, setPublisherFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // 'all', 'public', 'restricted'
  const [ownerFilter, setOwnerFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' = Newest first, 'asc' = Oldest first
  const [currentPage, setCurrentPage] = useState(1);
  // Set by the links on the stats page: 'nofile' | 'telegram' | ''
  const [healthFilter, setHealthFilter] = useState('');


  // Selection & Bulk Edit
  const [selectedBooks, setSelectedBooks] = useState(new Set());
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false);
  const [bulkValues, setBulkValues] = useState({ category: '', author: '', language: '', restricted: '' });
  const [submittingBulk, setSubmittingBulk] = useState(false);

  // The Google script is only needed when a delete touches Drive.
  useEffect(() => {
    loadGoogleScript();
  }, []);

  // Arriving from the stats page pre-narrows the table to the problem books.
  useEffect(() => {
    const health = new URLSearchParams(window.location.search).get('health');
    if (['nofile', 'telegram', 'unmirrored'].includes(health)) setHealthFilter(health);
  }, []);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/');
    }
  }, [isAdmin, authLoading, router]);

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const booksRef = collection(db, 'books');
        const q = query(booksRef, orderBy('createdAt', 'desc'));
        const [querySnapshot, settings] = await Promise.all([
          getDocs(q),
          getDropdownSettings()
        ]);
        
        const fetchedBooks = [];
        querySnapshot.forEach((doc) => {
          fetchedBooks.push({ id: doc.id, ...doc.data() });
        });
        setBooks(fetchedBooks);
        // Categories are saved as groups { label, options: [{value, label}] }
        const flatCategories = (settings.categories || []).reduce((acc, group) => {
          if (group.options) {
            acc.push(...group.options.map(o => o.value));
          }
          return acc;
        }, []);
        setPredefinedCategories(flatCategories);
        
        setPredefinedAuthors(settings.authors || []);
        setPredefinedTranslators(settings.translators || []);
        setPredefinedPublishers(settings.publishers || []);
        
        // Languages are saved as { value, label }
        const flatLanguages = (settings.languages || []).map(l => l.value || l);
        setPredefinedLanguages(flatLanguages);
        
        // Note: types might be in categories or hardcoded, fallback to dynamic if missing
        if (settings.types) setPredefinedTypes(settings.types);
      } catch (error) {
        console.error("Error fetching books:", error);
        toast.error('เนเธซเธฅเธ”เธเนเธญเธกเธนเธฅเธซเธเธฑเธเธชเธทเธญเนเธกเนเธชเธณเน€เธฃเนเธ');
      } finally {
        setLoadingBooks(false);
      }
    };
    
    if (isAdmin) {
      fetchBooks();
    }
  }, [isAdmin, toast]);

  const handleSelectBook = (id) => {
    const newSelected = new Set(selectedBooks);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedBooks(newSelected);
  };

  // Select-all applies to what is on screen, and only clears what is on
  // screen โ€” a selection made under a different filter is not thrown away.
  const handleSelectAll = (e, currentList) => {
    const ids = currentList.map((b) => b.id);
    setSelectedBooks((prev) => {
      const next = new Set(prev);
      if (e.target.checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  /**
   * Ensures we hold a Drive token before a delete, asking for one if needed.
   *
   * Returns { proceed, token }. The old yes/no prompt had no way to back out:
   * dismissing it fell through to "delete site-side only", so a mis-click
   * still orphaned the file in Drive. Backing out is now its own answer.
   */
  const ensureDriveToken = async () => {
    const saved = readSavedToken();
    if (saved) return { proceed: true, token: saved.token };

    const answer = await ask({
      title: 'เธขเธฑเธเนเธกเนเนเธ”เนเน€เธเธทเนเธญเธกเธ•เนเธญ Google Drive',
      message: GOOGLE_PROMPT,
      actions: [
        { key: 'connect', label: 'เน€เธเธทเนเธญเธกเธ•เนเธญเนเธ”เธฃเธเนเธเนเธญเธเธฅเธ' },
        { key: 'site-only', label: 'เธฅเธเน€เธเธเธฒเธฐเนเธเน€เธงเนเธ', tone: 'danger' },
      ],
    });

    if (answer === null) return { proceed: false, token: null };
    if (answer === 'site-only') return { proceed: true, token: null };

    try {
      const fresh = await connectDrive();
      return { proceed: true, token: fresh.token };
    } catch (err) {
      toast.error(err.message);
      return { proceed: false, token: null };
    }
  };

  /**
   * Removes the Drive copies for the given books and reports what happened.
   * Failures used to be swallowed entirely โ€” which matters most when a file
   * lives in a different Google account than the one currently connected.
   */
  const removeDriveCopies = async (targets, token) => {
    const withFiles = targets.filter((b) => b?.driveUrl);
    if (!token || withFiles.length === 0) return;

    const failures = new Map();
    for (const book of withFiles) {
      const result = await deleteFromDrive(book.driveUrl, token);
      if (!result.ok) failures.set(result.reason, (failures.get(result.reason) || 0) + 1);
    }

    if (failures.size > 0) {
      const worst = [...failures.entries()].sort((a, b) => b[1] - a[1])[0];
      const count = [...failures.values()].reduce((a, b) => a + b, 0);
      toast.error(
        `เธฅเธเธญเธญเธเธเธฒเธเน€เธงเนเธเนเธฅเนเธง เนเธ•เนเนเธเธฅเนเนเธ Drive ${count} เนเธเธฅเนเธฅเธเนเธกเนเธชเธณเน€เธฃเนเธ โ€” ${DELETE_REASONS[worst[0]] || worst[0]}`
      );
    }
  };

  const handleBulkDelete = async () => {
    if (selectedBooks.size === 0) return;

    const agreed = await confirm({
      title: `เธฅเธเธซเธเธฑเธเธชเธทเธญ ${selectedBooks.size} เน€เธฅเนเธก?`,
      message: 'เธเธฒเธฃเธฅเธเธเธตเนเธขเนเธญเธเธเธฅเธฑเธเนเธกเนเนเธ”เน',
      confirmLabel: 'เธฅเธเธ—เธฑเนเธเธซเธกเธ”',
      tone: 'danger',
    });
    if (!agreed) return;

    const { proceed, token } = await ensureDriveToken();
    if (!proceed) return;

    const targets = books.filter((b) => selectedBooks.has(b.id));

    try {
      await removeDriveCopies(targets, token);

      const batch = writeBatch(db);
      targets.forEach((b) => batch.delete(doc(db, 'books', b.id)));
      await batch.commit();

      setBooks((prev) => prev.filter((b) => !selectedBooks.has(b.id)));
      setSelectedBooks(new Set());
      toast.success(`เธฅเธเธซเธเธฑเธเธชเธทเธญ ${targets.length} เน€เธฅเนเธกเธชเธณเน€เธฃเนเธ`);
    } catch (err) {
      console.error(err);
      toast.error('เธฅเธเนเธกเนเธชเธณเน€เธฃเนเธ');
    }
  };

  const handleSingleDelete = async (id) => {
    const book = books.find((b) => b.id === id);

    const agreed = await confirm({
      title: 'เธฅเธเธซเธเธฑเธเธชเธทเธญเน€เธฅเนเธกเธเธตเน?',
      message: `โ€${book?.title || 'เน€เธฅเนเธกเธเธตเน'}โ€ โ€” เธเธฒเธฃเธฅเธเธเธตเนเธขเนเธญเธเธเธฅเธฑเธเนเธกเนเนเธ”เน`,
      confirmLabel: 'เธฅเธเน€เธฅเนเธกเธเธตเน',
      tone: 'danger',
    });
    if (!agreed) return;

    let token = null;
    if (book?.driveUrl) {
      const drive = await ensureDriveToken();
      if (!drive.proceed) return;
      token = drive.token;
    }

    try {
      await removeDriveCopies([book], token);
      await deleteDoc(doc(db, 'books', id));

      setBooks((prev) => prev.filter((b) => b.id !== id));
      setSelectedBooks((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success('เธฅเธเธซเธเธฑเธเธชเธทเธญเธชเธณเน€เธฃเนเธ');
    } catch (err) {
      console.error(err);
      toast.error('เธฅเธเนเธกเนเธชเธณเน€เธฃเนเธ');
    }
  };

  const handleOpenNewBook = () => {
    setEditingBookId(null);
    setIsFormOpen(true);
    // Auto-collapse sidebar to maximize workspace
    if (window.innerWidth > 900) {
      setIsSidebarOpen(false);
    }
  };

  const handleOpenEditBook = (id) => {
    setEditingBookId(id);
    setIsFormOpen(true);
  };

  const handleBookSaved = (savedBook) => {
    setBooks(prev => {
      const idx = prev.findIndex(b => b.id === savedBook.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...savedBook };
        return next;
      }
      return [savedBook, ...prev];
    });
  };

  const handleBulkUpdate = async (e) => {
    e.preventDefault();
    setSubmittingBulk(true);
    try {
      const batch = writeBatch(db);
      const updates = {};
      if (bulkValues.category) updates.category = bulkValues.category;
      if (bulkValues.author) updates.author = bulkValues.author;
      if (bulkValues.language) updates.language = bulkValues.language;
      if (bulkValues.restricted !== '') updates.restricted = bulkValues.restricted === 'true';
      
      if (Object.keys(updates).length === 0) {
        setBulkEditModalOpen(false);
        setSubmittingBulk(false);
        return;
      }

      selectedBooks.forEach(id => {
        batch.update(doc(db, 'books', id), updates);
      });
      await batch.commit();
      
      setBooks(books.map(b => selectedBooks.has(b.id) ? { ...b, ...updates } : b));
      setSelectedBooks(new Set());
      setBulkEditModalOpen(false);
      setBulkValues({ category: '', author: '', language: '', restricted: '' });
      toast.success('เนเธเนเนเธเธเนเธญเธกเธนเธฅเธชเธณเน€เธฃเนเธ');
    } catch (err) {
      console.error(err);
      toast.error('เนเธเนเนเธเนเธกเนเธชเธณเน€เธฃเนเธ');
    } finally {
      setSubmittingBulk(false);
    }
  };

  if (authLoading || loadingBooks) {
    return <div className="container" style={{paddingTop: '4rem'}}>เธเธณเธฅเธฑเธเธ•เธฃเธงเธเธชเธญเธเธชเธดเธ—เธเธดเน...</div>;
  }

  if (!isAdmin) {
    return null;
  }

  const categories = Array.from(new Set([...predefinedCategories, ...books.map(b => b.category).filter(Boolean)])).sort();
  const authors = Array.from(new Set([...predefinedAuthors, ...books.map(b => b.author).filter(Boolean)])).sort();
  const translators = Array.from(new Set([...predefinedTranslators, ...books.map(b => b.translator).filter(Boolean)])).sort();
  const publishers = Array.from(new Set([...predefinedPublishers, ...books.map(b => b.publisher).filter(Boolean)])).sort();
  const languages = Array.from(new Set([...predefinedLanguages, ...books.map(b => b.language).filter(Boolean)])).sort();
  const types = Array.from(new Set([...predefinedTypes, ...books.map(b => b.type).filter(Boolean)])).sort();
  const years = Array.from(new Set(books.map(b => b.year).filter(Boolean))).sort((a, b) => b - a);
  const owners = Array.from(new Set(books.map(b => b.driveOwner).filter(Boolean))).sort();

  const filteredBooks = books.filter(book => {
    const matchesSearch = book.title?.toLowerCase().includes(searchQuery.toLowerCase()) || book.author?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = categoryFilter ? book.category === categoryFilter : true;
    const matchesAuthor = authorFilter ? book.author === authorFilter : true;
    const matchesTranslator = translatorFilter ? book.translator === translatorFilter : true;
    const matchesPublisher = publisherFilter ? book.publisher === publisherFilter : true;
    const matchesLanguage = languageFilter ? book.language === languageFilter : true;
    const matchesType = typeFilter ? book.type === typeFilter : true;
    const matchesYear = yearFilter ? String(book.year) === yearFilter : true;
    const matchesStatus = statusFilter === 'restricted' ? book.restricted : statusFilter === 'public' ? !book.restricted : true;
    // '__none__' finds the books uploaded before the account was recorded.
    const matchesOwner = ownerFilter
      ? ownerFilter === '__none__' ? !book.driveOwner : book.driveOwner === ownerFilter
      : true;

    const hasAnyFile = book.driveUrl || book.telegramFileId || book.telegramUrl;
    const matchesHealth =
      healthFilter === 'nofile' ? !hasAnyFile
      : healthFilter === 'telegram' ? !book.driveUrl && (book.telegramFileId || book.telegramUrl)
      : healthFilter === 'unmirrored' ? book.driveUrl && !book.telegramFileId && canMirror(bookSizeBytes(book))
      : true;

    return matchesSearch && matchesCat && matchesAuthor && matchesTranslator && matchesPublisher && matchesLanguage && matchesType && matchesYear && matchesStatus && matchesOwner && matchesHealth;
  });

  // Sort the filtered books based on sortOrder (books array is already 'desc' by default)
  let sortedBooks = [...filteredBooks];
  if (sortOrder === 'asc') {
    sortedBooks.reverse();
  }

  // Pagination logic
  const PAGE_SIZE = 20;
  const pageCount = Math.max(1, Math.ceil(sortedBooks.length / PAGE_SIZE));
  const current = Math.min(currentPage, pageCount);
  const shownBooks = sortedBooks.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  // Reset page to 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, authorFilter, translatorFilter, publisherFilter, languageFilter, typeFilter, yearFilter, statusFilter, ownerFilter, healthFilter, sortOrder]);

  const totalBooks = books.length;
  const restrictedCount = books.filter(b => b.restricted).length;
  const publicCount = totalBooks - restrictedCount;
  
  const allSelected =
    shownBooks.length > 0 && shownBooks.every((b) => selectedBooks.has(b.id));

  return (
    <div className="container">
      <header className={`${styles.header} rise`}>
        <p className="eyebrow">เธเธนเนเธ”เธนเนเธฅเธฃเธฐเธเธ</p>
        <h1 className={styles.title}>เธเธฑเธ”เธเธฒเธฃเธฃเธฐเธเธ</h1>
        <p className="lede">
          เธเธฑเธ”เธเธฒเธฃเธซเธเธฑเธเธชเธทเธญเนเธเธเธฅเธฑเธ เนเธฅเธฐเธ•เธฃเธงเธเธชเธญเธเธชเธดเธ—เธเธดเน
        </p>
      </header>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{totalBooks}</div>
          <div className={styles.statLabel}>เธซเธเธฑเธเธชเธทเธญเธ—เธฑเนเธเธซเธกเธ”</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{publicCount}</div>
          <div className={styles.statLabel}>เธชเธฒเธเธฒเธฃเธ“เธฐ</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--hot)' }}>{restrictedCount}</div>
          <div className={styles.statLabel}>เธชเธเธงเธเธชเธดเธ—เธเธดเน</div>
        </div>
      </div>

      {healthFilter && (
        <div className={styles.healthBanner}>
          <span>
            {healthFilter === 'nofile'
              ? 'เธเธณเธฅเธฑเธเนเธชเธ”เธเน€เธเธเธฒเธฐเน€เธฅเนเธกเธ—เธตเนเธขเธฑเธเนเธกเนเธกเธตเนเธเธฅเนเนเธเธเน€เธฅเธข'
              : healthFilter === 'unmirrored'
                ? 'เธเธณเธฅเธฑเธเนเธชเธ”เธเน€เธเธเธฒเธฐเน€เธฅเนเธกเธ—เธตเนเธขเธฑเธเนเธกเนเธกเธตเธชเธณเน€เธเธฒเธชเธณเธฃเธญเธ โ€” เน€เธเธดเธ”เน€เธฅเนเธกเธเธฑเนเธเนเธฅเนเธงเธเธ” "เธชเธณเธฃเธญเธเธ•เธญเธเธเธตเน"'
                : 'เธเธณเธฅเธฑเธเนเธชเธ”เธเน€เธเธเธฒเธฐเน€เธฅเนเธกเธ—เธตเนเธกเธตเนเธ•เนเนเธเธฅเน Telegram (เน€เธฅเนเธกเนเธซเธเนเธเธงเนเธฒ 20MB เธเธฐเน€เธเธดเธ”เนเธกเนเนเธ”เน)'}
          </span>
          <button className="btn" onClick={() => setHealthFilter('')}>เนเธชเธ”เธเธ—เธฑเนเธเธซเธกเธ”</button>
        </div>
      )}

      <div className={styles.filterBar}>
        <div className={styles.filterTopRow}>
          <div className={styles.searchWrap}>
            <input 
              type="text" 
              placeholder="เธเนเธเธซเธฒเธเธทเนเธญ เธซเธฃเธทเธญเธเธนเนเนเธ•เนเธ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
            <Search className={styles.searchIcon} size={18} />
          </div>
          
          <button 
            className={`btn ${showFilters ? 'btn-solid' : ''}`} 
            onClick={() => setShowFilters(!showFilters)}
            title="เธ•เธฑเธงเธเธฃเธญเธ"
          >
            <Filter size={18} /> <span className={styles.hideMobile}>เธ•เธฑเธงเธเธฃเธญเธ {(categoryFilter || statusFilter || sortOrder !== 'desc') && 'โ€ข'}</span>
          </button>

          <div className={styles.actionButtons}>
          <div className={styles.viewToggle}>
            <button 
              className={`${styles.viewBtn} ${viewMode === 'table' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('table')}
              title="เธกเธธเธกเธกเธญเธเธ•เธฒเธฃเธฒเธ"
            >
              <List size={18} />
            </button>
            <button 
              className={`${styles.viewBtn} ${viewMode === 'card' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('card')}
              title="เธกเธธเธกเธกเธญเธเธเธฒเธฃเนเธ”"
            >
              <LayoutGrid size={18} />
            </button>
          </div>
          <button onClick={() => setIsBulkUploadOpen(true)} className="btn btn-solid" style={{ background: 'var(--hot)', borderColor: 'var(--hot)' }}>
            <UploadCloud size={18} /> <span>เธญเธฑเธเนเธซเธฅเธ”เธซเธฅเธฒเธขเน€เธฅเนเธก</span>
          </button>
          <button onClick={handleOpenNewBook} className="btn btn-solid">
            <Plus size={18} /> <span>เน€เธเธดเนเธกเธซเธเธฑเธเธชเธทเธญ</span>
          </button>
        </div>
        </div>

        {showFilters && (
          <div className={styles.filterBottomRow}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>เน€เธฃเธตเธขเธเธฅเธณเธ”เธฑเธ</label>
              <Select instanceId={"select-1"} styles={selectStyles}
                options={[
                  { value: 'desc', label: 'เนเธซเธกเนเนเธเน€เธเนเธฒ' },
                  { value: 'asc', label: 'เน€เธเนเธฒเนเธเนเธซเธกเน' }
                ]}
                value={{ value: sortOrder, label: sortOrder === 'asc' ? 'เน€เธเนเธฒเนเธเนเธซเธกเน' : 'เนเธซเธกเนเนเธเน€เธเนเธฒ' }}
                onChange={(selected) => setSortOrder(selected ? selected.value : 'desc')}
                isSearchable={false}
                classNamePrefix="react-select"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>เธซเธกเธงเธ”เธซเธกเธนเน</label>
              <Select instanceId={"select-2"} styles={selectStyles}
                options={[{ value: '', label: 'เธ—เธฑเนเธเธซเธกเธ”' }, ...categories.map(c => ({ value: c, label: c }))]}
                value={{ value: categoryFilter, label: categoryFilter || 'เธ—เธฑเนเธเธซเธกเธ”' }}
                onChange={(selected) => setCategoryFilter(selected ? selected.value : '')}
                placeholder="เธ—เธฑเนเธเธซเธกเธ”"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>เธเธฃเธฐเน€เธ เธ—</label>
              <Select instanceId={"select-3"} styles={selectStyles}
                options={[{ value: '', label: 'เธ—เธฑเนเธเธซเธกเธ”' }, ...types.map(c => ({ value: c, label: c }))]}
                value={{ value: typeFilter, label: typeFilter || 'เธ—เธฑเนเธเธซเธกเธ”' }}
                onChange={(selected) => setTypeFilter(selected ? selected.value : '')}
                placeholder="เธ—เธฑเนเธเธซเธกเธ”"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>เธชเธ–เธฒเธเธฐ</label>
              <Select instanceId={"select-4"} styles={selectStyles}
                options={[
                  { value: '', label: 'เธ—เธฑเนเธเธซเธกเธ”' },
                  { value: 'public', label: 'เธชเธฒเธเธฒเธฃเธ“เธฐ' },
                  { value: 'restricted', label: 'เธชเธเธงเธเธชเธดเธ—เธเธดเน' }
                ]}
                value={{ value: statusFilter, label: statusFilter === 'public' ? 'เธชเธฒเธเธฒเธฃเธ“เธฐ' : statusFilter === 'restricted' ? 'เธชเธเธงเธเธชเธดเธ—เธเธดเน' : 'เธ—เธฑเนเธเธซเธกเธ”' }}
                onChange={(selected) => setStatusFilter(selected ? selected.value : '')}
                placeholder="เธ—เธฑเนเธเธซเธกเธ”"
                isSearchable={false}
                classNamePrefix="react-select"
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>เธ เธฒเธฉเธฒ</label>
              <Select instanceId={"select-5"} styles={selectStyles}
                options={[{ value: '', label: 'เธ—เธฑเนเธเธซเธกเธ”' }, ...languages.map(c => ({ value: c, label: c }))]}
                value={{ value: languageFilter, label: languageFilter || 'เธ—เธฑเนเธเธซเธกเธ”' }}
                onChange={(selected) => setLanguageFilter(selected ? selected.value : '')}
                placeholder="เธ—เธฑเนเธเธซเธกเธ”"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>เธเธตเธเธดเธกเธเน</label>
              <Select instanceId={"select-6"} styles={selectStyles}
                options={[{ value: '', label: 'เธ—เธฑเนเธเธซเธกเธ”' }, ...years.map(c => ({ value: c, label: c }))]}
                value={{ value: yearFilter, label: yearFilter || 'เธ—เธฑเนเธเธซเธกเธ”' }}
                onChange={(selected) => setYearFilter(selected ? selected.value : '')}
                placeholder="เธ—เธฑเนเธเธซเธกเธ”"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>เธเธนเนเนเธ•เนเธ</label>
              <Select instanceId={"select-7"} styles={selectStyles}
                options={[{ value: '', label: 'เธ—เธฑเนเธเธซเธกเธ”' }, ...authors.map(c => ({ value: c, label: c }))]}
                value={{ value: authorFilter, label: authorFilter || 'เธ—เธฑเนเธเธซเธกเธ”' }}
                onChange={(selected) => setAuthorFilter(selected ? selected.value : '')}
                placeholder="เธ—เธฑเนเธเธซเธกเธ”"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>เธเธนเนเนเธเธฅ</label>
              <Select instanceId={"select-8"} styles={selectStyles}
                options={[{ value: '', label: 'เธ—เธฑเนเธเธซเธกเธ”' }, ...translators.map(c => ({ value: c, label: c }))]}
                value={{ value: translatorFilter, label: translatorFilter || 'เธ—เธฑเนเธเธซเธกเธ”' }}
                onChange={(selected) => setTranslatorFilter(selected ? selected.value : '')}
                placeholder="เธ—เธฑเนเธเธซเธกเธ”"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>เธชเธณเธเธฑเธเธเธดเธกเธเน</label>
              <Select instanceId={"select-9"} styles={selectStyles}
                options={[{ value: '', label: 'เธ—เธฑเนเธเธซเธกเธ”' }, ...publishers.map(c => ({ value: c, label: c }))]}
                value={{ value: publisherFilter, label: publisherFilter || 'เธ—เธฑเนเธเธซเธกเธ”' }}
                onChange={(selected) => setPublisherFilter(selected ? selected.value : '')}
                placeholder="เธ—เธฑเนเธเธซเธกเธ”"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>เธเธฑเธเธเธต Google เธ—เธตเนเน€เธเนเธเนเธเธฅเน</label>
              <Select instanceId={"select-10"} styles={selectStyles}
                options={[
                  { value: '', label: 'เธ—เธฑเนเธเธซเธกเธ”' },
                  ...owners.map(o => ({ value: o, label: o })),
                  { value: '__none__', label: 'เธขเธฑเธเนเธกเนเนเธ”เนเธเธฑเธเธ—เธถเธเธเธฑเธเธเธต' },
                ]}
                value={{
                  value: ownerFilter,
                  label: ownerFilter === '__none__' ? 'เธขเธฑเธเนเธกเนเนเธ”เนเธเธฑเธเธ—เธถเธเธเธฑเธเธเธต' : ownerFilter || 'เธ—เธฑเนเธเธซเธกเธ”',
                }}
                onChange={(selected) => setOwnerFilter(selected ? selected.value : '')}
                placeholder="เธ—เธฑเนเธเธซเธกเธ”"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button className="btn" onClick={() => {
                setCategoryFilter(''); setAuthorFilter(''); setTranslatorFilter('');
                setPublisherFilter(''); setTypeFilter(''); setLanguageFilter('');
                setYearFilter(''); setStatusFilter(''); setOwnerFilter(''); setSearchQuery('');
                setSortOrder('desc');
              }}>เธฅเนเธฒเธเธ•เธฑเธงเธเธฃเธญเธเธ—เธฑเนเธเธซเธกเธ”</button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.tableHeader} style={{ display: viewMode === 'card' ? 'none' : '' }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '1.1rem' }}>
          <input 
            type="checkbox" 
            className={styles.checkbox} 
            checked={allSelected} 
            onChange={(e) => handleSelectAll(e, shownBooks)} 
          />
        </div>
        <div style={{ paddingLeft: '1rem', color: 'var(--fg-3)', fontSize: '0.85rem' }}>
          {selectedBooks.size > 0 ? `เน€เธฅเธทเธญเธเนเธฅเนเธง ${selectedBooks.size} เน€เธฅเนเธก` : `${filteredBooks.length} เน€เธฅเนเธก`}
        </div>
      </div>

      {viewMode === 'card' && (
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input 
            type="checkbox" 
            className={styles.checkbox} 
            checked={allSelected} 
            onChange={(e) => handleSelectAll(e, shownBooks)} 
          />
          <span style={{ color: 'var(--fg-3)', fontSize: '0.85rem' }}>เน€เธฅเธทเธญเธเธ—เธฑเนเธเธซเธกเธ”เนเธเธซเธเนเธฒเธเธตเน</span>
        </div>
      )}

      <ul className={`${viewMode === 'card' ? styles.rowsCard : styles.rows} stagger`}>
        {shownBooks.length === 0 && (
          <li style={{color: 'var(--fg-3)', padding: '2rem', textAlign: 'center', background: 'var(--surface)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)'}}>
            {searchQuery || categoryFilter || statusFilter ? 'เนเธกเนเธเธเธซเธเธฑเธเธชเธทเธญเธ—เธตเนเธเนเธเธซเธฒ' : 'เธขเธฑเธเนเธกเนเธกเธตเธซเธเธฑเธเธชเธทเธญเนเธเธฃเธฐเธเธ'}
          </li>
        )}
        {shownBooks.map((book) => (
          <li key={book.id} className={`${styles.bookRow} ${selectedBooks.has(book.id) ? styles.rowSelected : ''}`}>
            <div className={styles.checkboxWrap}>
              <input 
                type="checkbox" 
                className={styles.checkbox}
                checked={selectedBooks.has(book.id)}
                onChange={() => handleSelectBook(book.id)}
              />
            </div>
            <div className={styles.who}>
              <span className={styles.name}>{book.title}</span>
              <span className={styles.smallMeta}>
                {book.author || 'เนเธกเนเธฃเธฐเธเธธเธเธนเนเนเธ•เนเธ'}
                {book.driveOwner && (
                  <>
                    {' ยท '}
                    <span className={styles.owner} title={`เนเธเธฅเนเธญเธขเธนเนเนเธเธเธฑเธเธเธต ${book.driveOwner}`}>
                      <Mail size={11} /> {book.driveOwner}
                    </span>
                  </>
                )}
              </span>
            </div>
            <span className={styles.when}>{book.category}</span>
            <span className={book.restricted ? styles.flagOn : styles.flag}>
              {book.restricted ? 'เธชเธเธงเธเธชเธดเธ—เธเธดเน' : 'เธชเธฒเธเธฒเธฃเธ“เธฐ'}
            </span>
            <span style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Download size={14} /> {book.downloadCount || 0}
            </span>
            <div className={styles.rowActions}>
              <Link href={`/book/${getLangPath(book.language)}/${book.id}`} className={styles.view}>
                <span className="tlink">เธ”เธน</span>
              </Link>
              <button onClick={() => handleOpenEditBook(book.id)} className={styles.edit} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem' }}>
                <span className="tlink">เนเธเนเนเธ</span>
              </button>
              <button 
                onClick={() => handleSingleDelete(book.id)} 
                className={styles.delete} 
                style={{ background: 'none', border: 'none', color: 'var(--hot)', cursor: 'pointer', padding: '0.4rem', borderRadius: 'var(--r-sm)' }}
                title="เธฅเธเธซเธเธฑเธเธชเธทเธญ"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {pageCount > 1 && (
        <div className={styles.pagination}>
          <button 
            className="btn" 
            disabled={current === 1}
            onClick={() => {
              setCurrentPage(current - 1);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            เธเนเธญเธเธซเธเนเธฒ
          </button>
          
          <div className={styles.pageNumbers}>
            {pageWindow(current, pageCount).map((item, index) => 
              typeof item === 'string' ? (
                <span key={`gap-${index}`} className={styles.pageGap}>...</span>
              ) : (
                <button
                  key={item}
                  className={`btn ${current === item ? 'btn-solid' : ''}`}
                  onClick={() => {
                    setCurrentPage(item);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  style={current === item ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : {}}
                >
                  {item}
                </button>
              )
            )}
          </div>

          <button 
            className="btn" 
            disabled={current === pageCount}
            onClick={() => {
              setCurrentPage(current + 1);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            เธ–เธฑเธ”เนเธ
          </button>
        </div>
      )}

      {selectedBooks.size > 0 && (
        <div className={styles.bulkActionBar}>
          <div style={{ fontSize: 'var(--t-small)' }}>เน€เธฅเธทเธญเธเนเธฅเนเธง <strong>{selectedBooks.size}</strong> เธฃเธฒเธขเธเธฒเธฃ</div>
          <div style={{ display: 'flex', gap: '0.8rem' }}>
            <button className="btn" onClick={() => setBulkEditModalOpen(true)}>
              <Edit2 size={16} /> เนเธเนเนเธเธเธฃเนเธญเธกเธเธฑเธ
            </button>
            <button className="btn" style={{ color: 'var(--hot)', borderColor: 'var(--hot)' }} onClick={handleBulkDelete}>
              <Trash2 size={16} /> เธฅเธเธ—เธตเนเน€เธฅเธทเธญเธ
            </button>
          </div>
        </div>
      )}

      {bulkEditModalOpen && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <h2 style={{ marginBottom: '1rem', fontSize: 'var(--t-h2)' }}>เนเธเนเนเธ {selectedBooks.size} เน€เธฅเนเธกเธเธฃเนเธญเธกเธเธฑเธ</h2>
            <p style={{ color: 'var(--fg-2)', fontSize: 'var(--t-small)', marginBottom: '1.5rem' }}>
              เน€เธงเนเธเธงเนเธฒเธเนเธงเนเธซเธฒเธเนเธกเนเธ•เนเธญเธเธเธฒเธฃเน€เธเธฅเธตเนเธขเธเนเธเธฅเธเธเนเธฒเน€เธ”เธดเธก
            </p>
            <form onSubmit={handleBulkUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label>
                <div style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', marginBottom: '0.3rem' }}>เธเธนเนเนเธ•เนเธเนเธซเธกเน (เน€เธเธฅเธตเนเธขเธเธ—เธฑเนเธเธซเธกเธ”)</div>
                <input 
                  type="text" 
                  value={bulkValues.author} 
                  onChange={e => setBulkValues({...bulkValues, author: e.target.value})}
                  placeholder="เธเธฅเนเธญเธขเธงเนเธฒเธเน€เธเธทเนเธญเธเธเน€เธ”เธดเธก"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                />
              </label>
              
              <label>
                <div style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', marginBottom: '0.3rem' }}>เธซเธกเธงเธ”เธซเธกเธนเนเนเธซเธกเน</div>
                <select 
                  value={bulkValues.category} 
                  onChange={e => setBulkValues({...bulkValues, category: e.target.value})}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                >
                  <option value="">เธเธฅเนเธญเธขเธงเนเธฒเธเน€เธเธทเนเธญเธเธเน€เธ”เธดเธก</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>

              <label>
                <div style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', marginBottom: '0.3rem' }}>เธ เธฒเธฉเธฒเนเธซเธกเน</div>
                <select 
                  value={bulkValues.language} 
                  onChange={e => setBulkValues({...bulkValues, language: e.target.value})}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                >
                  <option value="">เธเธฅเนเธญเธขเธงเนเธฒเธเน€เธเธทเนเธญเธเธเน€เธ”เธดเธก</option>
                  {/* `languages` is a flat list of strings โ€” reading .value/.label
                      off it produced a dropdown of blank options. */}
                  {languages.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>

              <label>
                <div style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', marginBottom: '0.3rem' }}>เธชเธ–เธฒเธเธฐเธเธฒเธฃเน€เธเนเธฒเธ–เธถเธ</div>
                <select 
                  value={bulkValues.restricted} 
                  onChange={e => setBulkValues({...bulkValues, restricted: e.target.value})}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                >
                  <option value="">เธเธฅเนเธญเธขเธงเนเธฒเธเน€เธเธทเนเธญเธเธเน€เธ”เธดเธก</option>
                  <option value="false">เธชเธฒเธเธฒเธฃเธ“เธฐ</option>
                  <option value="true">เธชเธเธงเธเธชเธดเธ—เธเธดเน</option>
                </select>
              </label>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-block" onClick={() => setBulkEditModalOpen(false)}>เธขเธเน€เธฅเธดเธ</button>
                <button type="submit" className="btn btn-solid btn-block" disabled={submittingBulk}>
                  {submittingBulk ? 'เธเธณเธฅเธฑเธเธเธฑเธเธ—เธถเธ...' : 'เธเธฑเธเธ—เธถเธเธเธฒเธฃเนเธเนเนเธ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slide-over Form Panel */}
      <BookFormPanel 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        bookId={editingBookId} 
        onSaved={handleBookSaved}
      />

      {/* Bulk Upload Panel */}
      <BulkUploadPanel
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        onSaved={handleBookSaved}
      />
    </div>
  );
}

