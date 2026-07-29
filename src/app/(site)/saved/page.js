'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, documentId } from 'firebase/firestore';
import { Bookmark } from 'lucide-react';
import BookCover from '@/components/BookCover';
import { getLangPath } from '@/lib/langPath';
import { joinPeople } from '@/lib/people';
import styles from './page.module.css';

export default function SavedPage() {
  const { user, approved, loading: authLoading } = useAuth();
  const [savedBooks, setSavedBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSavedBooks = async () => {
      if (!user) {
        setSavedBooks([]);
        setLoading(false);
        return;
      }

      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data();
          const savedIds = userData.savedBooks || [];
          
          if (savedIds.length === 0) {
            setSavedBooks([]);
            setLoading(false);
            return;
          }

          // One query per 10 ids instead of one read per book — a shelf of
          // forty titles used to cost forty round trips.
          const chunks = [];
          for (let i = 0; i < savedIds.length; i += 10) {
            chunks.push(savedIds.slice(i, i + 10));
          }

          const snaps = await Promise.all(
            chunks.map((chunk) =>
              getDocs(query(collection(db, 'books'), where(documentId(), 'in', chunk)))
            )
          );

          const byId = new Map();
          snaps.forEach((snap) =>
            snap.forEach((d) => byId.set(d.id, { id: d.id, ...d.data() }))
          );

          // Keep the reader's own ordering; drop titles that no longer exist
          // or that they are not cleared for.
          setSavedBooks(
            savedIds
              .map((id) => byId.get(id))
              .filter((b) => b && (!b.restricted || approved))
          );
        }
      } catch (error) {
        console.error("Error fetching saved books:", error);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      fetchSavedBooks();
    }
  }, [user, approved, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="container">
        <header className={`${styles.header} rise`}>
          <p className="eyebrow">ชั้นหนังสือของคุณ</p>
          <h1 className={styles.title}>บันทึกไว้</h1>
        </header>
        <div className={styles.grid}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`${styles.skeleton} shimmer`}>
              <div className={styles.skeletonCover} />
              <div className={styles.skeletonLine} />
              <div className={`${styles.skeletonLine} ${styles.skeletonShort}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="container">
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><Bookmark size={24} /></div>
          <p className={styles.emptyLead}>กรุณาเข้าสู่ระบบ</p>
          <p className={styles.emptyBody}>
            คุณต้องเข้าสู่ระบบก่อนเพื่อดูหนังสือที่บันทึกไว้
          </p>
          <Link href="/login" className="btn btn-solid">
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <header className={`${styles.header} rise`}>
        <p className="eyebrow">ชั้นหนังสือของคุณ</p>
        <h1 className={styles.title}>บันทึกไว้</h1>
      </header>

      {savedBooks.length === 0 ? (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}><Bookmark size={24} /></div>
          <p className={styles.emptyLead}>ยังไม่มีหนังสือที่บันทึกไว้</p>
          <p className={styles.emptyBody}>
            คุณสามารถกดบันทึกหนังสือได้ที่หน้ารายละเอียดหนังสือ เพื่อเก็บไว้อ่านภายหลัง
          </p>
          <Link href="/" className="btn">
            ไปที่คลังหนังสือ
          </Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {savedBooks.map((book) => (
            <Link key={book.id} href={`/book/${getLangPath(book.language)}/${book.id}`} className={`${styles.item} hover-card`}>
              <div className={styles.coverWrap}>
                <BookCover src={book.coverUrl} title={book.title} author={book.author} />
              </div>
              <div className={styles.meta}>
                <h3 className={styles.bookTitle}>{book.title}</h3>
                <p className={styles.bookAuthor}>{joinPeople(book.author)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
