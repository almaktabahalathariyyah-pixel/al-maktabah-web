'use client';

import Link from 'next/link';
import styles from './page.module.css';

export default function SavedPage() {
  // Will read savedBooks/{uid} from Firestore. Empty for now.
  const saved = [];

  return (
    <div className="container">
      <header className={`${styles.header} rise`}>
        <p className="eyebrow">Your shelf</p>
        <h1 className={styles.title}>Saved</h1>
      </header>

      {saved.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyLead}>Nothing set aside yet.</p>
          <p className={styles.emptyBody}>
            Save a volume from its page and it will wait for you here.
          </p>
          <Link href="/" className="btn">
            Browse the collection
          </Link>
        </div>
      ) : (
        <ul className={styles.list}>
          {saved.map((book) => (
            <li key={book.id}>
              <Link href={`/book/${book.id}`}>{book.title}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
