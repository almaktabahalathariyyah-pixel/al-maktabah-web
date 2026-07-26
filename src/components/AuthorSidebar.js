import { useState, useMemo } from 'react';
import { Search, User } from 'lucide-react';
import styles from './AuthorSidebar.module.css';

export default function AuthorSidebar({ authors, translators, selectedPerson, onSelect }) {
  const [search, setSearch] = useState('');

  // Combine and sort alphabetically
  const allPeople = useMemo(() => {
    const combined = new Set([...authors, ...translators]);
    return Array.from(combined).sort();
  }, [authors, translators]);

  const filteredPeople = useMemo(() => {
    if (!search) return allPeople;
    const lowerSearch = search.toLowerCase();
    return allPeople.filter(name => name.toLowerCase().includes(lowerSearch));
  }, [allPeople, search]);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <h2 className={styles.title}>รายชื่อบุคคล</h2>
      </div>
      
      <div className={styles.searchWrap}>
        <Search size={14} className={styles.searchIcon} />
        <input 
          className={styles.searchInput}
          type="text"
          placeholder="ค้นหาชื่อ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className={styles.scrollArea}>
        {selectedPerson && (
          <button 
            className={styles.clearBtn} 
            onClick={() => onSelect('')}
          >
            ล้างการเลือก: <span className={styles.selectedName}>{selectedPerson}</span>
          </button>
        )}

        <div className={styles.section}>
          <ul className={styles.list}>
            {filteredPeople.length === 0 ? (
              <li className={styles.empty}>ไม่พบรายชื่อ</li>
            ) : (
              filteredPeople.map(name => (
                <li key={`person-${name}`}>
                  <button 
                    className={`${styles.nameBtn} ${selectedPerson === name ? styles.active : ''}`}
                    onClick={() => onSelect(name === selectedPerson ? '' : name)}
                  >
                    <User size={12} style={{ marginRight: '0.4rem', opacity: 0.6 }} />
                    {name}
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
