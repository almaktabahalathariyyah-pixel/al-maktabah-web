'use client';

import { useRouter, useParams } from 'next/navigation';
import BookFormPanel from '@/components/BookFormPanel';

export default function EditBookPage() {
  const router = useRouter();
  const params = useParams();

  return (
    <div style={{ padding: '2rem' }}>
      <BookFormPanel 
        isOpen={true} 
        onClose={() => router.push('/admin')} 
        bookId={params.id} 
        onSaved={() => router.push('/admin')}
      />
    </div>
  );
}
