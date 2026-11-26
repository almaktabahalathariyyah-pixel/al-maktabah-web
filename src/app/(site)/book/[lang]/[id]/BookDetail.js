'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Bookmark, Check, User, BookOpen, Lock, LifeBuoy, Share2 } from 'lucide-react';
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
import { fetchBookOrNull } from '@/lib/fetchBook';
import { copyText } from '@/lib/copyText';
import { recordAccess } from '@/lib/stats';
import { asList, joinPeople } from '@/lib/people';
import { readBookCache } from '@/lib/bookCatalog';
import { findSeriesBooks, parseSeries } from '@/lib/series';
import { getReadingProgress } from '@/lib/readingProgress';
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
  const [seriesBooks, setSeriesBooks] = useState([]);
  const [savedPage, setSavedPage] = useState(0);
  // Shows for a moment after the link is copied. A share that gives no sign it
  // happened gets pressed three times.
  const [copied, setCopied] = useState(false);

  // The book itself never depends on who is reading, so it loads once.
  useEffect(() => {
    let alive = true;

    const fetchBook = async () => {
      // Missing and not-allowed arrive here as the same null, deliberately —
      // see lib/fetchBook. Both are the "ไม่พบหนังสือ" card.
      const data = await fetchBookOrNull(id, 'book');
      if (!alive) return;

      try {
        if (!data) {
          setNotFound(true);
          return;
        }

        const correctLang = getLangPath(data.language);
        if (lang !== correctLang) {
          router.replace(`/book/${correctLang}/${id}`);
          return;
        }

        setBook(data);
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

    // The restricted filter has to be IN THE QUERY, not applied to the
    // results. Rules are evaluated against every document a query could
    // return and the whole query fails if one of them is denied — so asking
    // for a category that contains a single restricted book was denied
    // outright for every signed-out reader, which is most of them. The
    // section simply never appeared, and the console filled with
    // permission-denied. Filtering afterwards, as this did, is too late.
    //
    // Same question the shelf asks, and the same caveat: a book with no
    // `restricted` field does not match `== false`, so it stays out until
    // the admin health page backfills it.
    const constraints = [where('category', '==', book.category)];
    if (!approved) constraints.push(where('restricted', '==', false));

    getDocs(query(collection(db, 'books'), ...constraints, limit(8)))
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

  // Series siblings (from client cache first; falls back to Firestore when opened
  // directly without visiting the shelf) + saved reading bookmark.
  useEffect(() => {
    if (!book || authLoading) return;
    let alive = true;
    const progress = getReadingProgress(id);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedPage(progress?.page || 0);

    const seriesInfo = parseSeries(book.title);
    if (!seriesInfo) {
      setSeriesBooks([]);
      return;
    }

    const cached = readBookCache(approved ? 'full' : 'public') || readBookCache('public');
    if (cached?.books?.length) {
      const visible = cached.books.filter((b) => !b.restricted || approved);
      const found = findSeriesBooks(book, visible);
      if (found.length > 1) {
        setSeriesBooks(found);
        return;
      }
    }

    // Fallback: query same category (or publisher) so direct links still show the full series album.
    const constraints = [];
    if (book.category) constraints.push(where('category', '==', book.category));
    else if (book.publisher) constraints.push(where('publisher', '==', book.publisher));
    if (!approved) constraints.push(where('restricted', '==', false));

    if (constraints.length === 0) {
      setSeriesBooks([]);
      return;
    }

    getDocs(query(collection(db, 'books'), ...constraints, limit(200)))
      .then((snap) => {
        if (!alive) return;
        const candidates = [];
        snap.forEach((d) => {
          const data = d.data();
          if (!data.restricted || approved) {
            candidates.push({ id: d.id, ...data });
          }
        });
        setSeriesBooks(findSeriesBooks(book, candidates));
      })
      .catch((error) => console.error('Error fetching series books:', error));

    return () => {
      alive = false;
    };
  }, [book, id, approved, authLoading]);

  // Nobody's shelf has been consulted for this reader-and-book pair yet, so
  // the bookmark starts unfilled. Cleared during render rather than in the
  // effect: signing out with a saved book open would otherwise leave the mark
  // filled until the effect ran.
  const [checkedFor, setCheckedFor] = useState(null);
  const savedKey = user ? `${user.uid}:${id}` : null;
  if (savedKey !== checkedFor) {
    setCheckedFor(savedKey);
    setSaved(false);
  }

  useEffect(() => {
    if (!user) return;
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

  /**
   * Passing a book on, which there was no way to do.
   *
   * A library is a thing people recommend to each other, and the only way to
   * send someone a title was to copy the address bar — which on a phone means
   * leaving the page. navigator.share opens the real system sheet where it
   * exists (every current mobile browser), and everywhere else this falls
   * back to the clipboard and says so. Both paths need a user gesture, which
   * a button press is.
   */
  const handleShare = async () => {
    const url = window.location.href;
    const title = book?.title || 'Al-Maktabah';

    // Read at click time, not render time. `navigator` does not exist during
    // the server pass, and a capability check in the JSX would either throw
    // there or disagree with the client and trip hydration. One icon for both
    // routes means render never needs to know.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: title, url });
        return;
      } catch (err) {
        // AbortError is the reader closing the sheet — not a failure, and it
        // must not fall through to copying something they declined to share.
        if (err?.name === 'AbortError') return;
      }
    }

    if (await copyText(url)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      // Never a dead end: if nothing can copy, the address is at least on
      // screen to be read or long-pressed.
      toast.info(`คัดลอกอัตโนมัติไม่ได้ — ลิงก์คือ ${url}`);
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
      <button
        type="button"
        onClick={() => {
          if (typeof window !== 'undefined' && window.history.length > 1 && document.referrer.startsWith(window.location.origin)) {
            router.back();
          } else {
            router.push('/');
          }
        }}
        className={styles.back}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <ArrowLeft size={15} /> <span className="tlink">คลังหนังสือ</span>
      </button>

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
                  <BookOpen size={15} />{' '}
                  {opening
                    ? 'กำลังเปิด…'
                    : savedPage > 1
                      ? `อ่านต่อจากหน้า ${savedPage}`
                      : 'เปิดอ่านหนังสือ'}
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

            <button className="btn btn-block" onClick={handleShare}>
              {copied ? <Check size={15} /> : <Share2 size={15} />}
              {copied ? 'คัดลอกลิงก์แล้ว' : 'แบ่งปันเล่มนี้'}
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

          {seriesBooks.length > 1 && (() => {
            const currentIdx = seriesBooks.findIndex(({ book: sb }) => String(sb.id) === String(id));
            const prevItem = currentIdx > 0 ? seriesBooks[currentIdx - 1] : null;
            const nextItem = currentIdx >= 0 && currentIdx < seriesBooks.length - 1 ? seriesBooks[currentIdx + 1] : null;
            const unit = seriesBooks[0]?.unit || 'เล่ม';
            const seriesBase = seriesBooks[0]?.base;
            return (
              <div
                style={{
                  marginTop: '1.75rem',
                  padding: '1.15rem 1.25rem',
                  borderRadius: 'var(--r-md)',
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                  <h2 style={{ fontSize: '0.98rem', fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
                    อัลบั้มชุดเดียวกัน{seriesBase ? `: ${seriesBase}` : ''} ({seriesBooks.length} {unit})
                  </h2>
                  {(prevItem || nextItem) && (
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {prevItem && (
                        <Link
                          href={`/book/${getLangPath(prevItem.book.language)}/${prevItem.book.id}`}
                          className="btn"
                          style={{ padding: '0.28rem 0.7rem', fontSize: '0.8rem' }}
                        >
                          ← {prevItem.label}
                        </Link>
                      )}
                      {nextItem && (
                        <Link
                          href={`/book/${getLangPath(nextItem.book.language)}/${nextItem.book.id}`}
                          className="btn btn-solid"
                          style={{ padding: '0.28rem 0.7rem', fontSize: '0.8rem' }}
                        >
                          {nextItem.label} →
                        </Link>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                  {seriesBooks.map(({ book: sb, label }) => {
                    const isCurrent = String(sb.id) === String(id);
                    return isCurrent ? (
                      <span
                        key={sb.id}
                        style={{
                          padding: '0.4rem 0.85rem',
                          borderRadius: 'var(--r-sm)',
                          background: 'var(--accent)',
                          color: 'var(--accent-ink)',
                          fontSize: '0.86rem',
                          fontWeight: 600,
                        }}
                      >
                        {label} (กำลังเปิดอยู่)
                      </span>
                    ) : (
                      <Link
                        key={sb.id}
                        href={`/book/${getLangPath(sb.language)}/${sb.id}`}
                        className="btn"
                        style={{ padding: '0.4rem 0.85rem', fontSize: '0.86rem' }}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })()}
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
