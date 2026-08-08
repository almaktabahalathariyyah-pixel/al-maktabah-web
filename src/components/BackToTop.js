'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import styles from './BackToTop.module.css';

/**
 * A way back up that does not involve twenty swipes.
 *
 * The shelf is twenty covers a page and the search box lives at the very top,
 * so on a phone every "let me try a different word" is a long scroll. Desktop
 * has Home and a scrollbar to drag; a phone has neither.
 *
 * Appears only once there is enough scrolled past to be worth it, and sits
 * clear of the language chips and the reader's thumb.
 */
export default function BackToTop({ showAfter = 900 }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Passive: this listener must never be able to delay a scroll.
    const onScroll = () => setShow(window.scrollY > showAfter);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [showAfter]);

  if (!show) return null;

  return (
    <button
      type="button"
      className={`icon-btn ${styles.btn}`}
      onClick={() =>
        window.scrollTo({
          top: 0,
          // The global reduced-motion rule forces `scroll-behavior: auto`, so
          // asking for smooth here is still honoured as an instant jump for
          // anyone who has asked for stillness.
          behavior: 'smooth',
        })
      }
      aria-label="กลับขึ้นบนสุด"
      title="กลับขึ้นบนสุด"
    >
      <ArrowUp size={19} />
    </button>
  );
}
