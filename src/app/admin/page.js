'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, query, orderBy, writeBatch } from 'firebase/firestore';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';
import { Search, Plus, Download, Edit2, Trash2, Settings, LayoutGrid, List, UploadCloud } from 'lucide-react';
import { getLangPath } from '@/lib/langPath';
import { getDropdownSettings } from '@/lib/settings';
import BookFormPanel from '@/components/BookFormPanel';
import BulkUploadPanel from '@/components/BulkUploadPanel';
import SettingsPanel from '@/components/SettingsPanel';
import FieldsPanel from '@/components/FieldsPanel';
import styles from './page.module.css';

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [books, setBooks] = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [predefinedLanguages, setPredefinedLanguages] = useState([]);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'card'

  // Form Panel State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [editingBookId, setEditingBookId] = useState(null);
  
  // Settings Panel State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFieldsOpen, setIsFieldsOpen] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // 'all', 'public', 'restricted'

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
        setPredefinedLanguages(settings.languages || []);
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

  const categories = Array.from(new Set(books.map(b => b.category).filter(Boolean))).sort();

  const filteredBooks = books.filter(book => {
    const matchesSearch = book.title?.toLowerCase().includes(searchQuery.toLowerCase()) || book.author?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = categoryFilter ? book.category === categoryFilter : true;
    const matchesStatus = statusFilter === 'restricted' ? book.restricted : statusFilter === 'public' ? !book.restricted : true;
    return matchesSearch && matchesCat && matchesStatus;
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
        
        <select 
          className={styles.filterSelect}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">ทุกหมวดหมู่</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select 
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">ทุกสถานะ</option>
          <option value="public">สาธารณะ</option>
          <option value="restricted">สงวนสิทธิ์</option>
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
          <button onClick={() => setIsFieldsOpen(true)} className="btn" title="ตั้งค่าฟิลด์แบบฟอร์ม">
            <Settings size={18} /> <span className="hide-mobile">ตั้งค่าฟิลด์</span>
          </button>
          <button onClick={() => setIsSettingsOpen(true)} className="btn" title="ตั้งค่าหมวดหมู่และภาษา">
            <Settings size={18} /> <span className="hide-mobile">ตั้งค่าหมวดหมู่</span>
          </button>
          <button onClick={() => setIsBulkUploadOpen(true)} className="btn btn-solid" style={{ background: 'var(--hot)' }}>
            <UploadCloud size={18} /> <span className="hide-mobile">อัปโหลดหลายเล่ม</span>
          </button>
          <button onClick={handleOpenNewBook} className="btn btn-solid">
            <Plus size={18} /> <span className="hide-mobile">เพิ่มหนังสือใหม่</span>
          </button>
        </div>
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

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      <FieldsPanel
        isOpen={isFieldsOpen}
        onClose={() => setIsFieldsOpen(false)}
      />
    </div>
  );
}
