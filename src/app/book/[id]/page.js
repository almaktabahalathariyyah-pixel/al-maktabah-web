'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Bookmark, Check } from 'lucide-react';
import BookCover from '../../../components/BookCover';
import styles from './page.module.css';

export default function BookDetailPage({ params }) {
  // Next.js 16: params is a Promise — unwrap it with React's use() hook.
  const { id } = use(params);
  const [saved, setSaved] = useState(false);

  // Mock — a single Firestore doc read (books/{id}) will replace this.
  const book = {
    id,
    title: 'Al-Aqeedah Al-Wasitiyyah',
    author: 'Ibn Taymiyyah',
    category: 'Aqeedah',
    publisher: 'Dar Al-Minhaj',
    year: '2015',
    translator: '—',
    pages: 342,
    size: '15 MB',
    format: 'PDF',
    cover: null,
    description:
      'A classic statement of creed, written in reply to a question put to the author in Wasit. This edition carries extensive footnotes and a commentary prepared for advanced students, with the chains of transmission set out in full.',
    restricted: true,
  };

  return (
    <div className="container">
      <Link href="/" className={styles.back}>
        <ArrowLeft size={15} /> <span className="tlink">The Collection</span>
      </Link>

      <article className={`${styles.layout} rise`}>
        {/* ---------- Left rail: cover + actions ---------- */}
        <aside className={styles.rail}>
          <BookCover src={book.cover} title={book.title} author={book.author} />

          <div className={styles.actions}>
            <button className="btn btn-solid btn-block">
              <Download size={15} /> Download {book.format}
            </button>
            <button
              className={`btn btn-block ${saved ? styles.savedOn : ''}`}
              onClick={() => setSaved((v) => !v)}
            >
              {saved ? <Check size={15} /> : <Bookmark size={15} />}
              {saved ? 'Saved' : 'Save for later'}
            </button>
          </div>

          <p className={styles.delivery}>
            Delivered from a private Telegram channel. The download opens the
            exact file message — nothing is re-hosted publicly.
          </p>
        </aside>

        {/* ---------- Main text ---------- */}
        <div className={styles.main}>
          <header className={styles.header}>
            <p className="eyebrow">
              {book.category}
              {book.restricted && <span className={styles.sep}>— Members only</span>}
            </p>
            <h1 className={styles.title}>{book.title}</h1>
            <p className={styles.author}>{book.author}</p>
          </header>

          <p className={styles.description}>{book.description}</p>

          <dl className={styles.specs}>
            {[
              ['Publisher', book.publisher],
              ['Year', book.year],
              ['Translator', book.translator],
              ['Extent', `${book.pages} pages`],
              ['File', `${book.format} · ${book.size}`],
            ].map(([label, value]) => (
              <div key={label} className={styles.spec}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </article>
    </div>
  );
}
