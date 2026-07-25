'use client';

import Link from 'next/link';
import { ArrowLeft, BookOpen, Download, Bookmark, FileText, Info } from 'lucide-react';
import styles from './page.module.css';

export default function BookDetailPage({ params }) {
  // In a real app, you would fetch the book data based on params.id
  const book = {
    id: params.id,
    title: 'Al-Aqeedah Al-Wasitiyyah',
    author: 'Ibn Taymiyyah',
    category: 'Aqeedah',
    publisher: 'Dar Al-Minhaj',
    year: '2015',
    translator: 'N/A',
    pages: 342,
    size: '15 MB',
    format: 'PDF',
    description: 'A classic text on Islamic theology and creed. This edition includes extensive footnotes and commentary for advanced students.',
    isRestricted: true
  };

  return (
    <div className={styles.pageContainer}>
      <Link href="/" className={styles.backBtn}>
        <ArrowLeft size={20} /> Back to Library
      </Link>

      <div className={styles.bookLayout}>
        <aside className={styles.coverSection}>
          <div className={styles.coverIcon}>
            <BookOpen size={64} strokeWidth={1.5} />
          </div>
          
          <div className={styles.actionButtons}>
            <button className={styles.downloadBtn}>
              <Download size={20} /> Download PDF
            </button>
            <button className={styles.saveBtn}>
              <Bookmark size={20} /> Save for Later
            </button>
          </div>
        </aside>

        <main className={styles.infoSection}>
          <header className={styles.header}>
            <div className={styles.categoryBadge}>{book.category}</div>
            <h1 className={styles.title}>{book.title}</h1>
            <div className={styles.author}>by {book.author}</div>
          </header>

          <div className={styles.telegramNotice}>
            <Info size={24} color="var(--accent-success)" />
            <p>
              <strong>Secure Download:</strong> This file is hosted on our private Telegram channel. 
              Clicking download will redirect you to the exact file message in Telegram.
            </p>
          </div>

          <div className={styles.description}>
            <h3>About this Book</h3>
            <p>{book.description}</p>
          </div>

          <div className={styles.metadataGrid}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Publisher</span>
              <span className={styles.metaValue}>{book.publisher}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Year</span>
              <span className={styles.metaValue}>{book.year}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Translator</span>
              <span className={styles.metaValue}>{book.translator}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Pages</span>
              <span className={styles.metaValue}>{book.pages}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>File Size</span>
              <span className={styles.metaValue}>{book.size}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Format</span>
              <span className={styles.metaValue}>{book.format}</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
