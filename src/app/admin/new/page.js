'use client';

import { useRouter } from 'next/navigation';
import BookFormPanel from '@/components/BookFormPanel';

export default function NewBookPage() {
  const router = useRouter();

  return (
    <div style={{ padding: '2rem' }}>
      <BookFormPanel 
        isOpen={true} 
        onClose={() => router.push('/admin')} 
        bookId={null} 
        onSaved={() => router.push('/admin')}
      />
    </div>
  );
}
