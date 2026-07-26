'use client';

import { useRouter } from 'next/navigation';
import SettingsPanel from '@/components/SettingsPanel';

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div style={{ padding: '2rem' }}>
      <SettingsPanel 
        isOpen={true} 
        onClose={() => router.push('/admin')} 
      />
    </div>
  );
}
