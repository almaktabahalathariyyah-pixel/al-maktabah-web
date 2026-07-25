import './globals.css';
import SidebarLayout from '../components/SidebarLayout';

export const metadata = {
  title: 'Al-Maktabah Al-Athariyyah',
  description: 'A minimalist library for finding and downloading books.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SidebarLayout>
          {children}
        </SidebarLayout>
      </body>
    </html>
  );
}
