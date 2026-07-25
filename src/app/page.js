import { Search, Library } from 'lucide-react';
import styles from './page.module.css';

const MOCK_BOOKS = [
  {
    id: 1,
    title: 'The Art of Computer Programming',
    author: 'Donald E. Knuth',
    category: 'Computer Science',
    year: '1968',
    isRestricted: false,
    coverColor: '#e3f2fd'
  },
  {
    id: 2,
    title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
    author: 'Robert C. Martin',
    category: 'Software Engineering',
    year: '2008',
    isRestricted: true,
    coverColor: '#f3e5f5'
  },
  {
    id: 3,
    title: 'Design Patterns',
    author: 'Erich Gamma, Richard Helm',
    category: 'Programming',
    year: '1994',
    isRestricted: false,
    coverColor: '#e8f5e9'
  },
  {
    id: 4,
    title: 'Introduction to Algorithms',
    author: 'Thomas H. Cormen',
    category: 'Computer Science',
    year: '1990',
    isRestricted: false,
    coverColor: '#fff8e1'
  }
];

export default function Home() {
  return (
    <div className={styles.page}>
      
      <header className={`glass ${styles.header}`}>
        <div className={styles.headerContent}>
          <div className={styles.searchBar}>
            <Search size={18} color="var(--text-tertiary)" />
            <input type="text" placeholder="Search books, authors, or categories..." />
          </div>
          <div className={styles.headerActions}>
            {/* Can add notifications or profile dropdown here later */}
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroText}>
            <h2>Discover, learn, and grow.</h2>
            <p>Your minimalist library for discovering and downloading books securely.</p>
          </div>
        </section>

        <section className={styles.libraryGrid}>
          <div className={styles.filters}>
            <h3>Categories</h3>
            <ul>
              <li className={styles.activeFilter}>All Books</li>
              <li>Computer Science</li>
              <li>Programming</li>
              <li>Software Engineering</li>
              <li>Database Systems</li>
            </ul>
          </div>
          
          <div className={styles.bookList}>
            {MOCK_BOOKS.map((book) => (
              <div key={book.id} className={styles.bookCard}>
                <div 
                  className={styles.bookCover} 
                  style={{ backgroundColor: book.coverColor }}
                >
                  <Library size={48} color="rgba(0,0,0,0.1)" />
                  {book.isRestricted && (
                    <span className={styles.restrictedBadge}>Members Only</span>
                  )}
                </div>
                <div className={styles.bookInfo}>
                  <span className={styles.category}>{book.category}</span>
                  <h4>{book.title}</h4>
                  <p className={styles.author}>{book.author}</p>
                  <p className={styles.year}>{book.year}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

    </div>
  );
}
