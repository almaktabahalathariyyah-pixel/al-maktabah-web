'use client';

import { useRouter } from 'next/navigation';
import FieldsPanel from '@/components/FieldsPanel';

export default function FieldsPage() {
  const router = useRouter();

  return (
    <div style={{ padding: '2rem' }}>
      <FieldsPanel 
        isOpen={true} 
        onClose={() => router.push('/admin')} 
      />
    </div>
  );
}
