'use client';

import { useState } from 'react';
import { Check, X, ArrowUpRight } from 'lucide-react';
import styles from './page.module.css';

export default function AdminPage() {
  const [tab, setTab] = useState('approvals');

  const pending = [
    { id: 1, name: 'Ahmad Abdullah', email: 'ahmad@example.com', social: 'facebook.com/ahmad123', requested: '2 days ago' },
    { id: 2, name: 'Fatima Noor', email: 'fatima@example.com', social: 'instagram.com/fatima_n', requested: '5 days ago' },
  ];

  const books = [
    { id: 1, title: 'Fath al-Bari', author: 'Ibn Hajar', category: 'Hadith', restricted: true },
    { id: 2, title: 'Riyad al-Salihin', author: 'Imam al-Nawawi', category: 'Hadith', restricted: false },
  ];

  return (
    <div className="container">
      <header className={`${styles.header} rise`}>
        <p className="eyebrow">Owner</p>
        <h1 className={styles.title}>Desk</h1>
        <p className="lede">
          Approve readers and keep the catalogue in order.
        </p>
      </header>

      <nav className={styles.tabs}>
        <button
          onClick={() => setTab('approvals')}
          className={`${styles.tab} ${tab === 'approvals' ? styles.tabOn : ''}`}
        >
          Approvals <sup className={styles.sup}>{pending.length}</sup>
        </button>
        <button
          onClick={() => setTab('catalogue')}
          className={`${styles.tab} ${tab === 'catalogue' ? styles.tabOn : ''}`}
        >
          Catalogue <sup className={styles.sup}>{books.length}</sup>
        </button>
      </nav>

      {tab === 'approvals' && (
        <ul className={`${styles.rows} stagger`}>
          {pending.map((user) => (
            <li key={user.id} className={styles.row}>
              <div className={styles.who}>
                <span className={styles.name}>{user.name}</span>
                <span className={styles.smallMeta}>{user.email}</span>
              </div>

              <a
                className={styles.social}
                href={`https://${user.social}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="tlink">{user.social}</span>
                <ArrowUpRight size={13} />
              </a>

              <span className={styles.when}>{user.requested}</span>

              <div className={styles.acts}>
                <button className={`${styles.act} ${styles.approve}`} title="Approve">
                  <Check size={16} />
                </button>
                <button className={`${styles.act} ${styles.reject}`} title="Reject">
                  <X size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === 'catalogue' && (
        <>
          <div className={styles.catBar}>
            <button className="btn">Add a volume</button>
          </div>
          <ul className={`${styles.rows} stagger`}>
            {books.map((book) => (
              <li key={book.id} className={styles.bookRow}>
                <div className={styles.who}>
                  <span className={styles.name}>{book.title}</span>
                  <span className={styles.smallMeta}>{book.author}</span>
                </div>
                <span className={styles.when}>{book.category}</span>
                <span className={book.restricted ? styles.flagOn : styles.flag}>
                  {book.restricted ? 'Restricted' : 'Open'}
                </span>
                <button className={styles.edit}>
                  <span className="tlink">Edit</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
