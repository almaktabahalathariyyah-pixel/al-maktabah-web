'use client';

import Link from 'next/link';
import { Bookmark, BookmarkPlus } from 'lucide-react';
import styles from './page.module.css';
import homeStyles from '../page.module.css';

export default function SavedPage() {
  // In a real app, you would fetch the user's saved books from Firebase
  const savedBooks = []; 

  return (
    <div className={styles.savedPage}>
      <header className={styles.header}>
        <h1><Bookmark size={28} color="var(--accent-primary)" /> Saved Books</h1>
        <p>Books you have bookmarked for later reading.</p>
      </header>

      {savedBooks.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <BookmarkPlus size={40} />
          </div>
          <h2>Your library is empty</h2>
          <p>You haven't saved any books yet. Browse the library and click the bookmark icon to save books here.</p>
          <Link href="/" className={styles.browseBtn}>
            Browse Library
          </Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {savedBooks.map(book => (
            <Link href={`/book/${book.id}`} key={book.id} className={homeStyles.bookCard}>
              <div className={homeStyles.bookCover}>
                <span className={homeStyles.bookCategory}>{book.category}</span>
                {book.isRestricted && (
                  <span className={homeStyles.restrictedBadge}>Restricted</span>
                )}
              </div>
              <div className={homeStyles.bookInfo}>
                <h3 className={homeStyles.bookTitle}>{book.title}</h3>
                <p className={homeStyles.bookAuthor}>{book.author}</p>
                <div className={homeStyles.bookMeta}>
                  <span>{book.year}</span>
                  <span>•</span>
                  <span>{book.pages} pages</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
