'use client';

import { use, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Bookmark, Check, User } from 'lucide-react';
import BookCover from '@/components/BookCover';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, collection, query, where, limit, getDocs, addDoc, increment } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { getLangPath } from '@/lib/langPath';
import styles from './page.module.css';

export default function BookDetailPage({ params }) {
  const router = useRouter();
  const { lang, id } = use(params);
  const { user, approved } = useAuth();
  const { toast } = useToast();
  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [relatedBooks, setRelatedBooks] = useState([]);

  useEffect(() => {
    const fetchBookAndUser = async () => {
      try {
        // Fetch Book
        const docRef = doc(db, 'books', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const correctLang = getLangPath(data.language);
          
          if (lang !== correctLang) {
            router.replace(`/book/${correctLang}/${id}`);
            return;
          }
          
          setBook({ id: docSnap.id, ...data });

          // Fetch related
          if (data.category) {
            const q = query(collection(db, 'books'), where('category', '==', data.category), limit(6));
            const relSnap = await getDocs(q);
            const related = [];
            relSnap.forEach(d => {
              if (d.id !== id && (!d.data().restricted || approved)) related.push({ id: d.id, ...d.data() });
            });
            setRelatedBooks(related.slice(0, 4));
          }
        }

        // Fetch User Saved State
        if (user) {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const userData = userSnap.data();
            if (userData.savedBooks && userData.savedBooks.includes(id)) {
              setSaved(true);
            }
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchBookAndUser();
  }, [id, user]);

  const toggleSave = async () => {
    if (!user) {
      toast.info("กรุณาเข้าสู่ระบบก่อนบันทึกหนังสือ");
      return;
    }
    setSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      if (saved) {
        await updateDoc(userRef, { savedBooks: arrayRemove(id) });
        setSaved(false);
      } else {
        await updateDoc(userRef, { savedBooks: arrayUnion(id) });
        setSaved(true);
      }
    } catch (error) {
      console.error("Error updating saved books:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!user) {
      toast.info("กรุณาเข้าสู่ระบบก่อนดาวน์โหลด");
      return;
    }
    
    // เปิดหน้าต่างใหม่ไปที่ไฟล์ (ถ้าเป็นลิงก์ภายนอก) หรือพาไปหน้าอ่าน PDF (ถ้ามีไฟล์ในระบบ)
    if (book.telegramFileId) {
      router.push(`/book/${lang}/${id}/read`);
    } else {
      window.open(book.telegramUrl || '#', '_blank');
    }

    try {
      // 1. บันทึกสถิติลง Collection downloads
      const downloadRef = collection(db, 'downloads');
      await addDoc(downloadRef, {
        bookId: id,
        userId: user.uid,
        timestamp: new Date()
      });

      // 2. เพิ่มยอดดาวน์โหลดใน Document หนังสือ
      const bookRef = doc(db, 'books', id);
      await updateDoc(bookRef, {
        downloadCount: increment(1)
      });
    } catch (err) {
      console.error("Error logging download:", err);
    }
  };

  if (loading) {
    return (
      <div className="container">
        <div className={styles.layout} style={{ marginTop: '4rem' }}>
          <div className={`${styles.skeletonCover} shimmer`} />
          <div className={styles.main}>
            <div className={`${styles.skeletonTitle} shimmer`} />
            <div className={`${styles.skeletonText} shimmer`} />
            <div className={`${styles.skeletonText} shimmer`} style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    );
  }

  if (!book || (book.restricted && !approved)) {
    return <div className="container" style={{paddingTop: '4rem'}}>ไม่พบข้อมูลหนังสือ</div>;
  }

  return (
    <div className="container">
      <Link href="/" className={styles.back}>
        <ArrowLeft size={15} /> <span className="tlink">คลังหนังสือ</span>
      </Link>

      <article className={`${styles.layout} rise`}>
        {/* ---------- Left rail: cover + actions ---------- */}
        <aside className={styles.rail}>
          <BookCover src={book.coverUrl} title={book.title} author={book.author} />

          <div className={styles.actions}>
            <button 
              onClick={handleDownload} 
              className="btn btn-solid btn-block" 
              style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'}}
            >
              <Download size={15} /> เปิดอ่านหนังสือ
            </button>
            
            <button
              className={`btn btn-block ${saved ? styles.savedOn : ''}`}
              onClick={toggleSave}
              disabled={saving}
            >
              {saved ? <Check size={15} /> : <Bookmark size={15} />}
              {saved ? 'บันทึกแล้ว' : 'บันทึกไว้อ่าน'}
            </button>
          </div>

          <p className={styles.delivery}>
            เปิดอ่านไฟล์ PDF จากระบบได้โดยตรง
          </p>
        </aside>

        {/* ---------- Main text ---------- */}
        <div className={styles.main}>
          <header className={styles.header}>
            <p className="eyebrow">
              {book.category}
            </p>
            <h1 className={styles.title}>{book.title}</h1>
            <p className={styles.author}>
              <User size={14} className={styles.authorIcon} />
              {book.author}
            </p>
          </header>

          <p className={styles.description}>{book.description || '-'}</p>

          <dl className={styles.specs}>
            {[
              ['สำนักพิมพ์', book.publisher || '-'],
              ['ปีที่พิมพ์', book.year || '-'],
              ['ผู้แปล', book.translator || '-'],
              ['จำนวนหน้า', `${book.pages || '-'} หน้า`],
              ['ภาษา', book.language || 'ไทย'],
              ['ขนาดไฟล์', `${book.size || '-'} (PDF)`],
            ].map(([label, value]) => (
              <div key={label} className={styles.spec}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </article>

      {/* ---------- Related Books ---------- */}
      {relatedBooks.length > 0 && (
        <section className={styles.related}>
          <h2 className={styles.relatedTitle}>หนังสือที่เกี่ยวข้อง</h2>
          <div className={styles.relatedGrid}>
            {relatedBooks.map(b => (
              <Link key={b.id} href={`/book/${getLangPath(b.language)}/${b.id}`} className={styles.relatedItem}>
                <BookCover src={b.coverUrl} title={b.title} author={b.author} />
                <div className={styles.relatedMeta}>
                  <div className={styles.relatedBookTitle}>{b.title}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
