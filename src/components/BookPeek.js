'use client';

import { useEffect } from 'react';
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

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={book.title}>
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
