'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, query, orderBy, writeBatch } from 'firebase/firestore';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';
import { Search, Plus, Download, Edit2, Trash2, Settings, LayoutGrid, List, UploadCloud, Filter } from 'lucide-react';
import { getLangPath } from '@/lib/langPath';
import { getDropdownSettings } from '@/lib/settings';
import BookFormPanel from '@/components/BookFormPanel';
import BulkUploadPanel from '@/components/BulkUploadPanel';
import styles from './page.module.css';
import { useAdmin } from '@/context/AdminContext';

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
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
  const [showFilters, setShowFilters] = useState(false);


  // Selection & Bulk Edit
  const [selectedBooks, setSelectedBooks] = useState(new Set());
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false);
  const [bulkValues, setBulkValues] = useState({ category: '', author: '', language: '', restricted: '' });
  const [submittingBulk, setSubmittingBulk] = useState(false);

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
        toast.error('โหลดข้อมูลหนังสือไม่สำเร็จ');
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

  const handleSelectAll = (e, currentList) => {
    if (e.target.checked) {
      setSelectedBooks(new Set(currentList.map(b => b.id)));
    } else {
      setSelectedBooks(new Set());
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`คุณแน่ใจหรือไม่ที่จะลบหนังสือ ${selectedBooks.size} เล่มนี้?`)) return;
    try {
      const batch = writeBatch(db);
      selectedBooks.forEach(id => {
        batch.delete(doc(db, 'books', id));
      });
      await batch.commit();
      setBooks(books.filter(b => !selectedBooks.has(b.id)));
      setSelectedBooks(new Set());
      toast.success('ลบหนังสือสำเร็จ');
    } catch (err) {
      console.error(err);
      toast.error('ลบไม่สำเร็จ');
    }
  };

  const handleSingleDelete = async (id) => {
    if (!confirm('คุณแน่ใจหรือไม่ที่จะลบหนังสือเล่มนี้?')) return;
    try {
      await deleteDoc(doc(db, 'books', id));
      setBooks(books.filter(b => b.id !== id));
      
      // If it was selected, remove it from selection
      const newSelected = new Set(selectedBooks);
      if (newSelected.has(id)) {
        newSelected.delete(id);
        setSelectedBooks(newSelected);
      }
      
      toast.success('ลบหนังสือสำเร็จ');
    } catch (err) {
      console.error(err);
      toast.error('ลบไม่สำเร็จ');
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
      toast.success('แก้ไขข้อมูลสำเร็จ');
    } catch (err) {
      console.error(err);
      toast.error('แก้ไขไม่สำเร็จ');
    } finally {
      setSubmittingBulk(false);
    }
  };

  if (authLoading || loadingBooks) {
    return <div className="container" style={{paddingTop: '4rem'}}>กำลังตรวจสอบสิทธิ์...</div>;
  }

  if (!isAdmin) {
    return null;
  }

  const categories = predefinedCategories.length > 0 ? predefinedCategories : Array.from(new Set(books.map(b => b.category).filter(Boolean))).sort();
  const authors = predefinedAuthors.length > 0 ? predefinedAuthors : Array.from(new Set(books.map(b => b.author).filter(Boolean))).sort();
  const translators = predefinedTranslators.length > 0 ? predefinedTranslators : Array.from(new Set(books.map(b => b.translator).filter(Boolean))).sort();
  const publishers = predefinedPublishers.length > 0 ? predefinedPublishers : Array.from(new Set(books.map(b => b.publisher).filter(Boolean))).sort();
  const languages = predefinedLanguages.length > 0 ? predefinedLanguages : Array.from(new Set(books.map(b => b.language).filter(Boolean))).sort();
  const types = predefinedTypes.length > 0 ? predefinedTypes : Array.from(new Set(books.map(b => b.type).filter(Boolean))).sort();
  const years = Array.from(new Set(books.map(b => b.year).filter(Boolean))).sort((a, b) => b - a);

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
    return matchesSearch && matchesCat && matchesAuthor && matchesTranslator && matchesPublisher && matchesLanguage && matchesType && matchesYear && matchesStatus;
  });

  const totalBooks = books.length;
  const restrictedCount = books.filter(b => b.restricted).length;
  const publicCount = totalBooks - restrictedCount;
  
  const allSelected = filteredBooks.length > 0 && selectedBooks.size === filteredBooks.length;

  return (
    <div className="container">
      <header className={`${styles.header} rise`}>
        <p className="eyebrow">ผู้ดูแลระบบ</p>
        <h1 className={styles.title}>จัดการระบบ</h1>
        <p className="lede">
          จัดการหนังสือในคลัง และตรวจสอบสิทธิ์
        </p>
      </header>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{totalBooks}</div>
          <div className={styles.statLabel}>หนังสือทั้งหมด</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{publicCount}</div>
          <div className={styles.statLabel}>สาธารณะ</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--hot)' }}>{restrictedCount}</div>
          <div className={styles.statLabel}>สงวนสิทธิ์</div>
        </div>
      </div>

      <div className={styles.filterBar}>
        <div className={styles.filterTopRow}>
          <div className={styles.searchWrap}>
            <Search className={styles.searchIcon} size={18} />
            <input 
              type="text" 
              placeholder="ค้นหาชื่อ หรือผู้แต่ง..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          
          <button 
            className={`btn ${showFilters ? 'btn-solid' : ''}`} 
            onClick={() => setShowFilters(!showFilters)}
            title="ตัวกรอง"
          >
            <Filter size={18} /> <span className={styles.hideMobile}>ตัวกรอง {(categoryFilter || statusFilter) && '•'}</span>
          </button>

          <div className={styles.actionButtons}>
          <div className={styles.viewToggle}>
            <button 
              className={`${styles.viewBtn} ${viewMode === 'table' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('table')}
              title="มุมมองตาราง"
            >
              <List size={18} />
            </button>
            <button 
              className={`${styles.viewBtn} ${viewMode === 'card' ? styles.viewBtnActive : ''}`}
              onClick={() => setViewMode('card')}
              title="มุมมองการ์ด"
            >
              <LayoutGrid size={18} />
            </button>
          </div>
          <button onClick={() => setIsBulkUploadOpen(true)} className="btn btn-solid" style={{ background: 'var(--hot)', borderColor: 'var(--hot)' }}>
            <UploadCloud size={18} /> <span>อัปโหลดหลายเล่ม</span>
          </button>
          <button onClick={handleOpenNewBook} className="btn btn-solid">
            <Plus size={18} /> <span>เพิ่มหนังสือ</span>
          </button>
        </div>
        </div>

        {showFilters && (
          <div className={styles.filterBottomRow}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>หมวดหมู่</label>
              <select className={styles.filterSelect} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>ประเภท</label>
              <select className={styles.filterSelect} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {types.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>สถานะ</label>
              <select className={styles.filterSelect} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">ทั้งหมด</option>
                <option value="public">สาธารณะ</option>
                <option value="restricted">สงวนสิทธิ์</option>
              </select>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>ภาษา</label>
              <select className={styles.filterSelect} value={languageFilter} onChange={(e) => setLanguageFilter(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {languages.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>ปีพิมพ์</label>
              <select className={styles.filterSelect} value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {years.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>ผู้แต่ง</label>
              <select className={styles.filterSelect} value={authorFilter} onChange={(e) => setAuthorFilter(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {authors.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>ผู้แปล</label>
              <select className={styles.filterSelect} value={translatorFilter} onChange={(e) => setTranslatorFilter(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {translators.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>สำนักพิมพ์</label>
              <select className={styles.filterSelect} value={publisherFilter} onChange={(e) => setPublisherFilter(e.target.value)}>
                <option value="">ทั้งหมด</option>
                {publishers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            
            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button className="btn" onClick={() => {
                setCategoryFilter(''); setAuthorFilter(''); setTranslatorFilter(''); 
                setPublisherFilter(''); setTypeFilter(''); setLanguageFilter(''); 
                setYearFilter(''); setStatusFilter(''); setSearchQuery('');
              }}>ล้างตัวกรองทั้งหมด</button>
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
            onChange={(e) => handleSelectAll(e, filteredBooks)} 
          />
        </div>
        <div style={{ paddingLeft: '1rem', color: 'var(--fg-3)', fontSize: '0.85rem' }}>
          {selectedBooks.size > 0 ? `เลือกแล้ว ${selectedBooks.size} เล่ม` : `${filteredBooks.length} เล่ม`}
        </div>
      </div>

      {viewMode === 'card' && (
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input 
            type="checkbox" 
            className={styles.checkbox} 
            checked={allSelected} 
            onChange={(e) => handleSelectAll(e, filteredBooks)} 
          />
          <span style={{ color: 'var(--fg-3)', fontSize: '0.85rem' }}>เลือกทั้งหมด</span>
        </div>
      )}

      <ul className={`${viewMode === 'card' ? styles.rowsCard : styles.rows} stagger`}>
        {filteredBooks.length === 0 && (
          <li style={{color: 'var(--fg-3)', padding: '2rem', textAlign: 'center', background: 'var(--surface)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)'}}>
            {searchQuery || categoryFilter || statusFilter ? 'ไม่พบหนังสือที่ค้นหา' : 'ยังไม่มีหนังสือในระบบ'}
          </li>
        )}
        {filteredBooks.map((book) => (
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
              <span className={styles.smallMeta}>{book.author || 'ไม่ระบุผู้แต่ง'}</span>
            </div>
            <span className={styles.when}>{book.category}</span>
            <span className={book.restricted ? styles.flagOn : styles.flag}>
              {book.restricted ? 'สงวนสิทธิ์' : 'สาธารณะ'}
            </span>
            <span style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Download size={14} /> {book.downloadCount || 0}
            </span>
            <div className={styles.rowActions}>
              <Link href={`/book/${getLangPath(book.language)}/${book.id}`} className={styles.view}>
                <span className="tlink">ดู</span>
              </Link>
              <button onClick={() => handleOpenEditBook(book.id)} className={styles.edit} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem' }}>
                <span className="tlink">แก้ไข</span>
              </button>
              <button 
                onClick={() => handleSingleDelete(book.id)} 
                className={styles.delete} 
                style={{ background: 'none', border: 'none', color: 'var(--hot)', cursor: 'pointer', padding: '0.4rem', borderRadius: 'var(--r-sm)' }}
                title="ลบหนังสือ"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </li>
        ))}
      </ul>

      {selectedBooks.size > 0 && (
        <div className={styles.bulkActionBar}>
          <div style={{ fontSize: 'var(--t-small)' }}>เลือกแล้ว <strong>{selectedBooks.size}</strong> รายการ</div>
          <div style={{ display: 'flex', gap: '0.8rem' }}>
            <button className="btn" onClick={() => setBulkEditModalOpen(true)}>
              <Edit2 size={16} /> แก้ไขพร้อมกัน
            </button>
            <button className="btn" style={{ color: 'var(--hot)', borderColor: 'var(--hot)' }} onClick={handleBulkDelete}>
              <Trash2 size={16} /> ลบที่เลือก
            </button>
          </div>
        </div>
      )}

      {bulkEditModalOpen && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <h2 style={{ marginBottom: '1rem', fontSize: 'var(--t-h2)' }}>แก้ไข {selectedBooks.size} เล่มพร้อมกัน</h2>
            <p style={{ color: 'var(--fg-2)', fontSize: 'var(--t-small)', marginBottom: '1.5rem' }}>
              เว้นว่างไว้หากไม่ต้องการเปลี่ยนแปลงค่าเดิม
            </p>
            <form onSubmit={handleBulkUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label>
                <div style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', marginBottom: '0.3rem' }}>ผู้แต่งใหม่ (เปลี่ยนทั้งหมด)</div>
                <input 
                  type="text" 
                  value={bulkValues.author} 
                  onChange={e => setBulkValues({...bulkValues, author: e.target.value})}
                  placeholder="ปล่อยว่างเพื่อคงเดิม"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                />
              </label>
              
              <label>
                <div style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', marginBottom: '0.3rem' }}>หมวดหมู่ใหม่</div>
                <select 
                  value={bulkValues.category} 
                  onChange={e => setBulkValues({...bulkValues, category: e.target.value})}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                >
                  <option value="">ปล่อยว่างเพื่อคงเดิม</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>

              <label>
                <div style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', marginBottom: '0.3rem' }}>ภาษาใหม่</div>
                <select 
                  value={bulkValues.language} 
                  onChange={e => setBulkValues({...bulkValues, language: e.target.value})}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                >
                  <option value="">ปล่อยว่างเพื่อคงเดิม</option>
                  {predefinedLanguages.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </label>

              <label>
                <div style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', marginBottom: '0.3rem' }}>สถานะการเข้าถึง</div>
                <select 
                  value={bulkValues.restricted} 
                  onChange={e => setBulkValues({...bulkValues, restricted: e.target.value})}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                >
                  <option value="">ปล่อยว่างเพื่อคงเดิม</option>
                  <option value="false">สาธารณะ</option>
                  <option value="true">สงวนสิทธิ์</option>
                </select>
              </label>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-block" onClick={() => setBulkEditModalOpen(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-solid btn-block" disabled={submittingBulk}>
                  {submittingBulk ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
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
