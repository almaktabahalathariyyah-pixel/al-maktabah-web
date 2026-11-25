'use client';

import { useState, useMemo } from 'react';
import { Search, User, Building, ChevronDown } from 'lucide-react';
import styles from './AuthorSidebar.module.css';

/**
 * Authors, translators and publishers in one alphabetical list of names.
 *
 * On a phone the grid is the point, so the rail collapses to a single row and
 * the reader opens it deliberately. Which chrome shows is a CSS decision —
 * `open` only governs the mobile disclosure.
 */
export default function AuthorSidebar({ authors, translators, publishers, selectedPerson, onSelect }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const allPeople = useMemo(() => {
    const combined = new Set([...authors, ...translators, ...publishers]);
    return Array.from(combined).sort((a, b) => a.localeCompare(b, 'th'));
  }, [authors, translators, publishers]);

  const filteredPeople = useMemo(() => {
    if (!search.trim()) return allPeople;
    const needle = search.trim().toLowerCase();
    return allPeople.filter((name) => name.toLowerCase().includes(needle));
  }, [allPeople, search]);

  if (allPeople.length === 0) return null;

  return (
    <aside className={styles.sidebar}>
      <button
        className={styles.toggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>
          บุคคล / สำนักพิมพ์
          {selectedPerson && <span className={styles.togglePick}> · {selectedPerson}</span>}
        </span>
        <ChevronDown
          size={16}
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
        />
      </button>

      <div className={styles.header}>
        <h2 className={styles.title}>บุคคล / สำนักพิมพ์</h2>
        <span className={styles.count}>{allPeople.length}</span>
      </div>

      <div className={`${styles.body} ${open ? styles.bodyOpen : ''}`}>
        <div className={styles.searchWrap}>
          <Search size={14} className={styles.searchIcon} />
          <input
            className={styles.searchInput}
            type="search"
            placeholder="ค้นหาชื่อ…"
            aria-label="ค้นหาชื่อบุคคลหรือสำนักพิมพ์"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.scrollArea}>
          {selectedPerson && (
            <button className={styles.clearBtn} onClick={() => onSelect('')}>
              ล้างการเลือก: <span className={styles.selectedName}>{selectedPerson}</span>
            </button>
          )}

          <ul className={styles.list}>
            {filteredPeople.length === 0 ? (
              <li className={styles.empty}>ไม่พบรายชื่อที่ตรงกับคำค้น</li>
            ) : (
              filteredPeople.map((name) => (
                <li key={`person-${name}`}>
                  <button
                    className={`${styles.nameBtn} ${selectedPerson === name ? styles.active : ''}`}
                    aria-pressed={selectedPerson === name}
                    onClick={() => onSelect(name === selectedPerson ? '' : name)}
                  >
                    <span className={styles.nameText}>
                      {authors.includes(name) || translators.includes(name)
                        ? <User size={12} className={styles.nameIcon} />
                        : <Building size={12} className={styles.nameIcon} />}
                      {name}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </aside>
  );
}
