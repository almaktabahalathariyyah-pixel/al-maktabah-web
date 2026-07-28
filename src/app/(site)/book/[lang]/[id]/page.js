import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import BookDetail from './BookDetail';

/**
 * Server shell around the reader-facing book page.
 *
 * The page itself has to stay a client component — it reads the session to
 * decide what the reader may open. But metadata cannot come from a client
 * component, so every shared link used to unfurl as the bare site title with
 * no cover. Reading the book once here gives crawlers and chat previews a
 * real title, description and image.
 *
 * A restricted title deliberately gets a neutral card: its existence is not
 * something to advertise.
 */
async function fetchBook(id) {
  try {
    const snap = await getDoc(doc(db, 'books', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (error) {
    console.error('Error loading book for metadata:', error);
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { id } = await params;
  const book = await fetchBook(id);

  if (!book) {
    return { title: 'ไม่พบหนังสือ · Al-Maktabah Al-Athariyyah' };
  }

  if (book.restricted) {
    return {
      title: 'หนังสือสงวนสิทธิ์ · Al-Maktabah Al-Athariyyah',
      description: 'เล่มนี้เปิดให้เฉพาะสมาชิกที่ได้รับอนุมัติ',
      robots: { index: false, follow: false },
    };
  }

  const byline = book.author ? `โดย ${book.author}` : '';
  const description =
    (book.description || '').trim().slice(0, 180) ||
    [byline, book.publisher, book.year].filter(Boolean).join(' · ') ||
    'คลังหนังสืออิสลาม Al-Maktabah Al-Athariyyah';

  const cover = book.coverUrl && !book.coverUrl.startsWith('data:') ? book.coverUrl : null;

  return {
    title: `${book.title} · Al-Maktabah Al-Athariyyah`,
    description,
    openGraph: {
      type: 'book',
      title: book.title,
      description,
      images: cover ? [cover] : undefined,
    },
    twitter: {
      card: cover ? 'summary_large_image' : 'summary',
      title: book.title,
      description,
      images: cover ? [cover] : undefined,
    },
  };
}

export default async function BookDetailPage({ params }) {
  const { lang, id } = await params;
  const book = await fetchBook(id);

  // Structured data, so a search result can show the author and format
  // rather than just a URL. Restricted titles are left out entirely.
  const jsonLd =
    book && !book.restricted
      ? {
          '@context': 'https://schema.org',
          '@type': 'Book',
          name: book.title,
          ...(book.author ? { author: { '@type': 'Person', name: book.author } } : {}),
          ...(book.translator ? { translator: { '@type': 'Person', name: book.translator } } : {}),
          ...(book.publisher ? { publisher: { '@type': 'Organization', name: book.publisher } } : {}),
          ...(book.description ? { description: book.description } : {}),
          ...(book.language ? { inLanguage: book.language } : {}),
          ...(book.pages ? { numberOfPages: Number(book.pages) || undefined } : {}),
          ...(book.coverUrl && !book.coverUrl.startsWith('data:') ? { image: book.coverUrl } : {}),
          bookFormat: 'https://schema.org/EBook',
        }
      : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <BookDetail lang={lang} id={id} />
    </>
  );
}
