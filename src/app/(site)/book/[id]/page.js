import { redirect } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getLangPath } from '@/lib/langPath';

export default async function LegacyBookRedirect({ params }) {
  const { id } = await params;

  try {
    const docRef = doc(db, 'books', id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const book = docSnap.data();
      const langSegment = getLangPath(book.language);
      // Redirect to the new SEO-friendly URL
      redirect(`/book/${langSegment}/${id}`);
    } else {
      // If book not found, redirect to home or a 404
      redirect('/not-found');
    }
  } catch (error) {
    console.error('Error redirecting legacy book URL:', error);
    redirect('/');
  }
}
