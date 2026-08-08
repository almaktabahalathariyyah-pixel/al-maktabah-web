'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X, Check, Pencil, Eye, Lock } from 'lucide-react';
import BookCover from './BookCover';
import { getLangPath } from '@/lib/langPath';
import { joinPeople } from '@/lib/people';
import styles from './BookPeek.module.css';

/**
 * What a row cannot say: which book this actually is.
 *
 * On a phone the admin list is forced to its card layout, and that card is
 * text — a title and an author. Titles in this library run long, share their
 * first several words with each other, and arrive in three scripts, so
 * picking the right one out of four hundred by reading is slow and picking
 * the wrong one is easy. Holding a row puts its cover on screen, which is how
 * the owner recognises a book in the first place.
 *
 * Deliberately not a link. It opens from a gesture, so every way out of it is
 * an explicit press — including ticking the box, which is the job it exists
 * to make possible.
 */
export default function BookPeek({ book, selected, onToggleSelect, onEdit, onClose }) {
  // How far the sheet has been dragged down, in pixels. Null when nothing is
  // being dragged, so the sheet keeps its own transform on a laptop.
  const [drag, setDrag] = useState(null);
  const start = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  if (!book) return null;

  /**
   * Flick it down to dismiss. The sheet opened from a gesture at the bottom
   * of the screen, and reaching the close button in its top corner means
   * crossing the whole phone with a thumb that is already at the bottom.
   * Dragging up does nothing — `Math.max(0, …)` — so the sheet cannot be
   * pulled off the top of its own container.
   */
  const onPointerDown = (e) => {
    // Touch and pen only. A mouse has the close button and Escape, and above
    // 620px this is a centred card rather than a sheet to pull.
    if (e.pointerType === 'mouse') return;
    if (e.target.closest?.('button, a')) return;
    start.current = e.clientY;
    setDrag(0);
  };
  const onPointerMove = (e) => {
    if (start.current == null) return;
    setDrag(Math.max(0, e.clientY - start.current));
  };
  const onPointerUp = () => {
    if (start.current == null) return;
    const travelled = drag || 0;
    start.current = null;
    setDrag(null);
    // 90px is far enough that it cannot be a mis-tap and near enough that it
    // is one flick.
    if (travelled > 90) onClose();
  };

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label={book.title}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // A custom property, not `transform` — the desktop rule composes its
        // own centring translate, and an inline transform would wipe it out.
        style={drag ? { '--drag': `${drag}px`, transition: 'none', opacity: 1 - drag / 420 } : undefined}
      >
        {/* The bar that says this can be pulled. Phone layout only. */}
        <div className={styles.grabber} aria-hidden="true" />
        <button className={`icon-btn icon-btn-quiet ${styles.close}`} onClick={onClose} aria-label="ปิด">
          <X size={20} />
        </button>

        <div className={styles.body}>
          <div className={styles.cover}>
            <BookCover src={book.coverUrl} title={book.title} author={book.author} />
          </div>

          <div className={styles.meta}>
            <h3 className={styles.title} dir="auto">{book.title}</h3>
            <p className={styles.author} dir="auto">
              {joinPeople(book.author) || 'ไม่ระบุผู้แต่ง'}
            </p>
            <div className={styles.tags}>
              {book.category && <span className={styles.tag}>{book.category}</span>}
              {book.language && <span className={styles.tag}>{book.language}</span>}
              {book.restricted && (
                <span className={`${styles.tag} ${styles.tagHot}`}>
                  <Lock size={11} /> สงวนสิทธิ์
                </span>
              )}
            </div>
          </div>
        </div>

        <div className={styles.acts}>
          {/* The reason this sheet exists: decide about this book without
              having to find its row again afterwards. */}
          <button
            className={`btn ${selected ? 'btn-solid' : ''}`}
            onClick={() => { onToggleSelect(book.id); onClose(); }}
          >
            <Check size={16} /> {selected ? 'เอาออกจากที่เลือก' : 'เลือกเล่มนี้'}
          </button>
          <button className="btn" onClick={() => { onClose(); onEdit(book.id); }}>
            <Pencil size={16} /> แก้ไข
          </button>
          <Link
            className="btn"
            href={`/book/${getLangPath(book.language)}/${book.id}`}
            onClick={onClose}
          >
            <Eye size={16} /> ดูหน้าเว็บ
          </Link>
        </div>
      </div>
    </>
  );
}
