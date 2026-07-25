import AdminShell from '@/components/AdminShell';

export const metadata = {
  title: 'แผงควบคุม · Al-Maktabah',
};

export default function AdminLayout({ children }) {
  return <AdminShell>{children}</AdminShell>;
}
