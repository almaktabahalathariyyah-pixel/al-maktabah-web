import AdminShell from '@/components/AdminShell';
import { AdminProvider } from '@/context/AdminContext';

export const metadata = {
  title: 'แผงควบคุม · Al-Maktabah',
};

export default function AdminLayout({ children }) {
  return (
    <AdminProvider>
      <AdminShell>{children}</AdminShell>
    </AdminProvider>
  );
}
