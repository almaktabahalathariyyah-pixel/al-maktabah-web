'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';
import { Search, Plus, Download } from 'lucide-react';
import styles from './page.module.css';

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [books, setBooks] = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

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
        const querySnapshot = await getDocs(q);
        const fetchedBooks = [];
        querySnapshot.forEach((doc) => {
          fetchedBooks.push({ id: doc.id, ...doc.data() });
        });
        setBooks(fetchedBooks);
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

  const handleDeleteBook = async (id) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบหนังสือเล่มนี้?')) return;
    try {
      await deleteDoc(doc(db, 'books', id));
      setBooks(books.filter(b => b.id !== id));
      toast.success('ลบหนังสือสำเร็จ');
    } catch (error) {
      console.error("Error deleting book:", error);
      toast.error('เกิดข้อผิดพลาดในการลบหนังสือ');
    }
  };

  if (authLoading || loadingBooks) {
    return <div className="container" style={{paddingTop: '4rem'}}>กำลังตรวจสอบสิทธิ์...</div>;
  }

  if (!isAdmin) {
    return null;
  }

  const filteredBooks = books.filter(book => 
    book.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    book.author?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    book.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalBooks = books.length;
  const restrictedCount = books.filter(b => b.restricted).length;
  const publicCount = totalBooks - restrictedCount;

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

      <div className={styles.actions}>
        <div className={styles.searchWrap}>
          <Search className={styles.searchIcon} size={18} />
          <input 
            type="text" 
            placeholder="ค้นหาชื่อหนังสือ ผู้แต่ง หมวดหมู่..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <Link href="/admin/new" className="btn btn-solid">
          <Plus size={18} style={{ marginRight: '0.25rem' }} /> เพิ่มหนังสือใหม่
        </Link>
      </div>

      <ul className={`${styles.rows} stagger`}>
        {filteredBooks.length === 0 && (
          <li style={{color: 'var(--fg-3)', padding: '2rem', textAlign: 'center', background: 'var(--surface)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)'}}>
            {searchQuery ? 'ไม่พบหนังสือที่ค้นหา' : 'ยังไม่มีหนังสือในระบบ'}
          </li>
        )}
        {filteredBooks.map((book) => (
          <li key={book.id} className={styles.bookRow}>
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
              <Link href={`/admin/edit/${book.id}`} className={styles.edit}>
                <span className="tlink">แก้ไข</span>
              </Link>
              <button className={styles.edit} onClick={() => handleDeleteBook(book.id)} title="ลบ">
                <span className="tlink" style={{color: 'var(--hot)'}}>ลบ</span>
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
