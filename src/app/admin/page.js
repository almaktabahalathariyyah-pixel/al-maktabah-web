'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { Trash2 } from 'lucide-react';
import styles from './page.module.css';

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('catalogue');
  const [books, setBooks] = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  
  // Form State
  const [showForm, setShowForm] = useState(false);
  const [newBook, setNewBook] = useState({
    title: '',
    author: '',
    category: 'อะกีดะฮฺ',
    publisher: '',
    year: '',
    pages: '',
    format: 'PDF',
    size: '',
    coverUrl: '',
    telegramUrl: '',
    description: '',
    restricted: false
  });

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
      } finally {
        setLoadingBooks(false);
      }
    };
    
    if (isAdmin) {
      fetchBooks();
    }
  }, [isAdmin]);

  const handleAddBook = async (e) => {
    e.preventDefault();
    try {
      const docRef = await addDoc(collection(db, 'books'), {
        ...newBook,
        pages: Number(newBook.pages) || 0,
        createdAt: new Date()
      });
      setBooks([{ id: docRef.id, ...newBook }, ...books]);
      setShowForm(false);
      // Reset form
      setNewBook({
        title: '', author: '', category: 'อะกีดะฮฺ', publisher: '', year: '', pages: '', 
        format: 'PDF', size: '', coverUrl: '', telegramUrl: '', description: '', restricted: false
      });
      alert('เพิ่มหนังสือสำเร็จ');
    } catch (error) {
      console.error("Error adding book:", error);
      alert('เกิดข้อผิดพลาดในการเพิ่มหนังสือ');
    }
  };

  const handleDeleteBook = async (id) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบหนังสือเล่มนี้?')) return;
    try {
      await deleteDoc(doc(db, 'books', id));
      setBooks(books.filter(b => b.id !== id));
    } catch (error) {
      console.error("Error deleting book:", error);
      alert('เกิดข้อผิดพลาดในการลบหนังสือ');
    }
  };

  const handleBulkImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const baseLink = prompt("Please enter the base Telegram link for this group (e.g., https://t.me/c/123456789/):");
    if (!baseLink) {
      e.target.value = null;
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (!data.messages) throw new Error("Invalid Telegram JSON export");

        const pdfMessages = data.messages.filter(m => m.mime_type === "application/pdf" || m.file?.endsWith('.pdf') || (m.media_type === "document" && m.file_name));
        if (!confirm(`Found ${pdfMessages.length} files. Import them?`)) {
          e.target.value = null;
          return;
        }

        alert("Importing... Please wait and do not close this window.");
        let imported = 0;
        for (const msg of pdfMessages) {
          const title = msg.file_name ? msg.file_name.replace('.pdf', '') : 'Unknown Book';
          const tUrl = baseLink.endsWith('/') ? `${baseLink}${msg.id}` : `${baseLink}/${msg.id}`;
          
          await addDoc(collection(db, 'books'), {
            title: title,
            author: 'Unknown',
            category: 'Other',
            publisher: '',
            year: '',
            pages: 0,
            format: 'PDF',
            size: '',
            coverUrl: '',
            telegramUrl: tUrl,
            description: typeof msg.text === 'string' ? msg.text : '',
            restricted: false,
            createdAt: new Date(msg.date || Date.now())
          });
          imported++;
        }
        alert(`Successfully imported ${imported} books!`);
        window.location.reload();
      } catch (err) {
        console.error(err);
        alert("Failed to parse JSON file.");
      }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  if (authLoading || loadingBooks) {
    return <div className="container" style={{paddingTop: '4rem'}}>กำลังตรวจสอบสิทธิ์...</div>;
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="container">
      <header className={`${styles.header} rise`}>
        <p className="eyebrow">ผู้ดูแลระบบ</p>
        <h1 className={styles.title}>จัดการระบบ</h1>
        <p className="lede">
          จัดการหนังสือในคลัง และอนุมัติสิทธิ์การเข้าถึงให้สมาชิก
        </p>
      </header>

      <nav className={styles.tabs}>
        <button
          onClick={() => setTab('catalogue')}
          className={`${styles.tab} ${tab === 'catalogue' ? styles.tabOn : ''}`}
        >
          คลังหนังสือ <sup className={styles.sup}>{books.length}</sup>
        </button>
      </nav>

      {tab === 'catalogue' && (
        <>
          <div className={styles.catBar} style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
            <button className="btn btn-solid" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'ยกเลิก' : 'เพิ่มหนังสือใหม่'}
            </button>
            <div style={{position: 'relative'}}>
              <input 
                type="file" 
                accept=".json" 
                onChange={handleBulkImport} 
                style={{position: 'absolute', opacity: 0, top: 0, left: 0, right: 0, bottom: 0, cursor: 'pointer'}}
              />
              <button className="btn" style={{pointerEvents: 'none'}}>
                นำเข้าข้อมูลจาก Telegram (JSON)
              </button>
            </div>
          </div>

          {showForm && (
            <form onSubmit={handleAddBook} style={{marginBottom: '3rem', padding: '1.5rem', border: '1px solid var(--rule)', background: 'var(--paper-2)'}}>
              <h2 style={{fontFamily: 'var(--serif)', fontSize: '1.2rem', margin: '0 0 1.5rem 0'}}>เพิ่มหนังสือใหม่</h2>
              
              <div style={{display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'}}>
                <div><label style={{display: 'block', fontSize: 'var(--t-small)', marginBottom: '0.3rem', color: 'var(--ink-2)'}}>ชื่อหนังสือ</label><input type="text" required value={newBook.title} onChange={e => setNewBook({...newBook, title: e.target.value})} style={{width: '100%', padding: '0.4rem', border: '1px solid var(--rule)', background: 'var(--paper)', outline: 'none'}}/></div>
                <div><label style={{display: 'block', fontSize: 'var(--t-small)', marginBottom: '0.3rem', color: 'var(--ink-2)'}}>ผู้แต่ง</label><input type="text" required value={newBook.author} onChange={e => setNewBook({...newBook, author: e.target.value})} style={{width: '100%', padding: '0.4rem', border: '1px solid var(--rule)', background: 'var(--paper)', outline: 'none'}}/></div>
                <div><label style={{display: 'block', fontSize: 'var(--t-small)', marginBottom: '0.3rem', color: 'var(--ink-2)'}}>หมวดหมู่</label>
                  <select value={newBook.category} onChange={e => setNewBook({...newBook, category: e.target.value})} style={{width: '100%', padding: '0.4rem', border: '1px solid var(--rule)', background: 'var(--paper)', outline: 'none'}}>
                    <option>อะกีดะฮฺ</option><option>หะดีษ</option><option>ตัฟซีร</option><option>ฟิกฮฺ</option><option>ซีเราะฮฺ</option><option>ประวัติศาสตร์</option><option>อื่นๆ</option>
                  </select>
                </div>
                <div><label style={{display: 'block', fontSize: 'var(--t-small)', marginBottom: '0.3rem', color: 'var(--ink-2)'}}>สำนักพิมพ์</label><input type="text" value={newBook.publisher} onChange={e => setNewBook({...newBook, publisher: e.target.value})} style={{width: '100%', padding: '0.4rem', border: '1px solid var(--rule)', background: 'var(--paper)', outline: 'none'}}/></div>
                <div><label style={{display: 'block', fontSize: 'var(--t-small)', marginBottom: '0.3rem', color: 'var(--ink-2)'}}>ปีที่พิมพ์</label><input type="text" value={newBook.year} onChange={e => setNewBook({...newBook, year: e.target.value})} style={{width: '100%', padding: '0.4rem', border: '1px solid var(--rule)', background: 'var(--paper)', outline: 'none'}}/></div>
                <div><label style={{display: 'block', fontSize: 'var(--t-small)', marginBottom: '0.3rem', color: 'var(--ink-2)'}}>จำนวนหน้า</label><input type="number" value={newBook.pages} onChange={e => setNewBook({...newBook, pages: e.target.value})} style={{width: '100%', padding: '0.4rem', border: '1px solid var(--rule)', background: 'var(--paper)', outline: 'none'}}/></div>
                <div><label style={{display: 'block', fontSize: 'var(--t-small)', marginBottom: '0.3rem', color: 'var(--ink-2)'}}>ลิงก์รูปปก</label><input type="url" value={newBook.coverUrl} onChange={e => setNewBook({...newBook, coverUrl: e.target.value})} style={{width: '100%', padding: '0.4rem', border: '1px solid var(--rule)', background: 'var(--paper)', outline: 'none'}}/></div>
                <div><label style={{display: 'block', fontSize: 'var(--t-small)', marginBottom: '0.3rem', color: 'var(--ink-2)'}}>ลิงก์ไฟล์ Telegram</label><input type="url" value={newBook.telegramUrl} onChange={e => setNewBook({...newBook, telegramUrl: e.target.value})} style={{width: '100%', padding: '0.4rem', border: '1px solid var(--rule)', background: 'var(--paper)', outline: 'none'}}/></div>
              </div>
              
              <div style={{marginTop: '1.25rem'}}>
                <label style={{display: 'block', fontSize: 'var(--t-small)', marginBottom: '0.3rem', color: 'var(--ink-2)'}}>รายละเอียด (Description)</label>
                <textarea rows="3" value={newBook.description} onChange={e => setNewBook({...newBook, description: e.target.value})} style={{width: '100%', padding: '0.4rem', border: '1px solid var(--rule)', resize: 'vertical', background: 'var(--paper)', outline: 'none'}}></textarea>
              </div>

              <div style={{marginTop: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem'}}>
                <input type="checkbox" id="restricted" checked={newBook.restricted} onChange={e => setNewBook({...newBook, restricted: e.target.checked})} />
                <label htmlFor="restricted" style={{color: 'var(--accent-2)', fontSize: 'var(--t-small)', letterSpacing: '0.04em', textTransform: 'uppercase'}}>จำกัดสิทธิ์การเข้าถึง (เฉพาะสมาชิกที่ได้รับอนุมัติ)</label>
              </div>

              <div style={{marginTop: '2rem'}}>
                <button type="submit" className="btn btn-solid">บันทึกข้อมูล</button>
              </div>
            </form>
          )}

          <ul className={`${styles.rows} stagger`}>
            {books.length === 0 && <li style={{color: 'var(--ink-3)', padding: '1rem 0'}}>ยังไม่มีหนังสือในระบบ</li>}
            {books.map((book) => (
              <li key={book.id} className={styles.bookRow}>
                <div className={styles.who}>
                  <span className={styles.name}>{book.title}</span>
                  <span className={styles.smallMeta}>{book.author}</span>
                </div>
                <span className={styles.when}>{book.category}</span>
                <span className={book.restricted ? styles.flagOn : styles.flag}>
                  {book.restricted ? 'สงวนสิทธิ์' : 'สาธารณะ'}
                </span>
                <button className={styles.edit} onClick={() => handleDeleteBook(book.id)} title="Delete">
                  <span className="tlink" style={{color: 'var(--accent-2)'}}>ลบ</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
