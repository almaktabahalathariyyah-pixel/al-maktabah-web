'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Bookmark, Check, User, BookOpen, Lock, LifeBuoy } from 'lucide-react';
import BookCover from '@/components/BookCover';
import { db } from '@/lib/firebase';
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  collection,
  query,
  where,
  limit,
  getDocs,
} from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { getLangPath } from '@/lib/langPath';
import { recordAccess } from '@/lib/stats';
import { asList, joinPeople } from '@/lib/people';
import styles from './page.module.css';

export default function BookDetail({ lang, id }) {
  const router = useRouter();
  const { user, approved, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [book, setBook] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [relatedBooks, setRelatedBooks] = useState([]);

  // The book itself never depends on who is reading, so it loads once.
  useEffect(() => {
    let alive = true;

    const fetchBook = async () => {
      try {
        const snap = await getDoc(doc(db, 'books', id));
        if (!alive) return;

        if (!snap.exists()) {
          setNotFound(true);
          return;
        }

        const data = snap.data();
        const correctLang = getLangPath(data.language);
        if (lang !== correctLang) {
          router.replace(`/book/${correctLang}/${id}`);
          return;
        }

        setBook({ id: snap.id, ...data });
      } catch (error) {
        console.error('Error fetching book:', error);
        if (alive) setNotFound(true);
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchBook();
    return () => {
      alive = false;
    };
  }, [id, lang, router]);

  // Related titles depend on `approved`, so they are refreshed separately
  // once the session settles — otherwise the shelf keeps a stale snapshot.
  useEffect(() => {
    if (!book?.category || authLoading) return;
    let alive = true;

    getDocs(query(collection(db, 'books'), where('category', '==', book.category), limit(8)))
      .then((snap) => {
        if (!alive) return;
        const related = [];
        snap.forEach((d) => {
          const data = d.data();
          if (d.id !== id && (!data.restricted || approved)) {
            related.push({ id: d.id, ...data });
          }
        });
        setRelatedBooks(related.slice(0, 4));
      })
      .catch((error) => console.error('Error fetching related books:', error));

    return () => {
      alive = false;
    };
  }, [book?.category, id, approved, authLoading]);

  useEffect(() => {
    if (!user) {
      setSaved(false);
      return;
    }
    let alive = true;

    getDoc(doc(db, 'users', user.uid))
      .then((snap) => {
        if (!alive || !snap.exists()) return;
        setSaved((snap.data().savedBooks || []).includes(id));
      })
      .catch((error) => console.error('Error reading saved books:', error));

    return () => {
      alive = false;
    };
  }, [user, id]);

  const toggleSave = async () => {
    if (!user) {
      toast.info('เข้าสู่ระบบก่อน แล้วเล่มนี้จะอยู่ในชั้นหนังสือของคุณ');
      return;
    }

    // Flip first, roll back if the write fails — a bookmark should feel instant.
    const next = !saved;
    setSaved(next);
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        savedBooks: next ? arrayUnion(id) : arrayRemove(id),
      });
    } catch (error) {
      console.error('Error updating saved books:', error);
      setSaved(!next);
      toast.error('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  };

  /** One place to record a read/download so the two buttons cannot drift. */
  const logAccess = useCallback(
    (type) => recordAccess({ bookId: id, userId: user.uid, type }),
    [id, user]
  );

  const requireAccess = () => {
    if (!user) {
      toast.info('เข้าสู่ระบบก่อนเปิดอ่านหนังสือ');
      router.push('/login');
      return false;
    }
    if (book.restricted && !approved) {
      toast.error('เล่มนี้เปิดให้เฉพาะสมาชิกที่ได้รับอนุมัติ');
      return false;
    }
    return true;
  };

  const handleRead = async () => {
    if (!requireAccess()) return;

    if (!book.driveUrl && !book.telegramFileId && !book.telegramUrl) {
      toast.error('เล่มนี้ยังไม่มีไฟล์ให้เปิดอ่าน');
      return;
    }

    setOpening(true);
    router.push(`/book/${lang}/${id}/read`);
    logAccess('read');
  };

  /** Opens the Telegram backup copy instead of the Drive original. */
  const openMirror = async () => {
    if (!requireAccess()) return;
    try {
      const token = await user.getIdToken();
      window.open(`/api/pdf/${id}?token=${token}&source=telegram`, '_blank', 'noopener');
      logAccess('read');
    } catch (err) {
      console.error(err);
      toast.error('เปิดสำเนาสำรองไม่สำเร็จ');
    }
  };

  const handleDirectDownload = async () => {
    if (!requireAccess()) return;

    if (!book.driveUrl && !book.telegramFileId && !book.telegramUrl) {
      toast.error('เล่มนี้ยังไม่มีไฟล์ให้ดาวน์โหลด');
      return;
    }

    try {
      const token = await user.getIdToken();
      window.open(`/api/pdf/${id}?token=${token}&action=download`, '_blank', 'noopener');
      logAccess('download');
    } catch (err) {
      console.error(err);
      toast.error('เปิดไฟล์ไม่สำเร็จ กรุณาลองใหม่');
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

  if (notFound || !book) {
    return (
      <div className="container">
        <div className={styles.gate}>
          <h1 className={styles.gateTitle}>ไม่พบหนังสือเล่มนี้</h1>
          <p className={styles.gateBody}>
            เล่มนี้อาจถูกนำออกจากคลังแล้ว หรือลิงก์ที่ใช้ไม่ถูกต้อง
          </p>
          <Link href="/" className="btn btn-solid">กลับไปคลังหนังสือ</Link>
        </div>
      </div>
    );
  }

  // A locked title still shows its cover and description — readers deserve to
  // know what they are asking for before they ask.
  const locked = book.restricted && !approved && !authLoading;

  const specs = [
    ['สำนักพิมพ์', book.publisher],
    ['ปีที่พิมพ์', book.year],
    ['ผู้แปล', joinPeople(book.translator)],
    ['จำนวนหน้า', book.pages ? `${book.pages} หน้า` : ''],
    ['ภาษา', book.language],
    ['ประเภท', book.type],
    ['ขนาดไฟล์', book.size],
  ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim() !== '-');

  return (
    <div className="container">
      <Link href="/" className={styles.back}>
        <ArrowLeft size={15} /> <span className="tlink">คลังหนังสือ</span>
      </Link>

      <article className={`${styles.layout} rise`}>
        {/* ---------- Left rail: cover + actions ---------- */}
        <aside className={styles.rail}>
          <div className={styles.coverArrive}>
            <BookCover src={book.coverUrl} title={book.title} author={book.author} />
          </div>

          <div className={styles.actions}>
            {locked ? (
              <>
                <div className={styles.lockNote}>
                  <Lock size={15} />
                  <span>เล่มนี้เปิดให้เฉพาะสมาชิกที่ได้รับอนุมัติ</span>
                </div>
                <Link href="/account" className="btn btn-solid btn-block">
                  ขอสิทธิ์เข้าถึง
                </Link>
              </>
            ) : (
              <>
                <button
                  onClick={handleRead}
                  className="btn btn-solid btn-block"
                  disabled={opening}
                >
                  <BookOpen size={15} /> {opening ? 'กำลังเปิด…' : 'เปิดอ่านหนังสือ'}
                </button>

                <button onClick={handleDirectDownload} className="btn btn-block">
                  <Download size={15} /> ดาวน์โหลด PDF
                </button>
              </>
            )}

            <button
              className={`btn btn-block ${saved ? styles.savedOn : ''}`}
              onClick={toggleSave}
              disabled={saving}
              aria-pressed={saved}
            >
              {saved ? <Check size={15} /> : <Bookmark size={15} />}
              {saved ? 'บันทึกแล้ว' : 'บันทึกไว้อ่าน'}
            </button>
          </div>

          {!locked && (
            <>
              <p className={styles.delivery}>
                เปิดอ่านได้ทันทีในเบราว์เซอร์ หรือดาวน์โหลดเก็บไว้อ่านออฟไลน์
              </p>

              {/* Drive can rate-limit a popular file for a day at a time.
                  When a backup copy exists, offer it rather than leaving the
                  reader staring at Google's error page. */}
              {book.driveUrl && book.telegramFileId && (
                <button className={styles.mirrorLink} onClick={openMirror}>
                  <LifeBuoy size={13} />
                  เปิดไม่ได้? ลองสำเนาสำรอง
                </button>
              )}
            </>
          )}
        </aside>

        {/* ---------- Main text ---------- */}
        <div className={styles.main}>
          <header className={styles.header}>
            {book.category && <p className="eyebrow">{book.category}</p>}
            <h1 className={styles.title} dir="auto">{book.title}</h1>
            {asList(book.author).length > 0 && (
              /* Each author is its own link into the shelf's person filter —
                 with two names on a book, one combined link would be a lie
                 about which shelf it opens. */
              <p className={styles.author}>
                <User size={14} className={styles.authorIcon} />
                {asList(book.author).map((name, index) => (
                  <span key={name}>
                    {index > 0 && <span className={styles.authorSep}> · </span>}
                    <Link href={`/?person=${encodeURIComponent(name)}`} className="tlink">
                      {name}
                    </Link>
                  </span>
                ))}
              </p>
            )}
          </header>

          {book.description && <p className={styles.description} dir="auto">{book.description}</p>}

          {specs.length > 0 && (
            <dl className={styles.specs}>
              {specs.map(([label, value]) => (
                <div key={label} className={styles.spec}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </article>

      {/* ---------- Related Books ---------- */}
      {relatedBooks.length > 0 && (
        <section className={styles.related}>
          <h2 className={styles.relatedTitle}>หนังสือในหมวดเดียวกัน</h2>
          <div className={styles.relatedGrid}>
            {relatedBooks.map((b) => (
              <Link
                key={b.id}
                href={`/book/${getLangPath(b.language)}/${b.id}`}
                className={styles.relatedItem}
              >
                <BookCover src={b.coverUrl} title={b.title} author={b.author} />
                <div className={styles.relatedMeta}>
                  <div className={styles.relatedBookTitle} dir="auto">{b.title}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
