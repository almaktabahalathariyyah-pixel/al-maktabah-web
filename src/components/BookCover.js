'use client';

import { useState } from 'react';
import styles from './BookCover.module.css';

/**
 * Renders a book's cover image when `src` is present.
 *
 * When a cover is missing (most records will start out that way) we set the
 * title in type instead of showing a broken frame — the way a publisher
 * prints a plain cloth binding. It is a real state, not a placeholder blob.
 *
 * A cover that fails to LOAD falls back to the same treatment. Covers point at
 * proxied third-party storage, so a dead id, a revoked share or an unset
 * server token all end as a 404 — and a torn-image icon in a grid of 362 is
 * worse than a plain binding.
 *
 * Plain <img> rather than next/image: covers come from arbitrary hosts stored
 * in Firestore, so there is no fixed domain to whitelist in remotePatterns yet.
 */
const VARIANTS = ['emerald', 'indigo', 'amber', 'rose', 'sky', 'violet', 'teal', 'slate'];
function getVariant(title) {
  if (!title) return VARIANTS[0];
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = ((hash << 5) - hash + title.charCodeAt(i)) | 0;
  return VARIANTS[Math.abs(hash) % VARIANTS.length];
}

export default function BookCover({ src, title, author, className = '' }) {
  // Which src failed, rather than a bare boolean: this instance is reused as a
  // list re-sorts or the admin form swaps books, and a flag would carry one
  // cover's failure onto the next. Deriving it needs no reset effect.
  const [failedSrc, setFailedSrc] = useState(null);
  const failed = Boolean(src) && failedSrc === src;

  return (
    <div className={`${styles.cover} ${className}`}>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          className={styles.img}
          loading="lazy"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <div className={`${styles.fallback} ${styles[getVariant(title)]}`}>
          <span className={styles.fallbackTitle}>{title}</span>
          <span className={styles.fallbackRule} />
          <span className={styles.fallbackAuthor}>{author}</span>
        </div>
      )}
    </div>
  );
}
