import { Kanit, Sarabun } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';

const kanit = Kanit({
  weight: ['300', '400', '500', '600'],
  subsets: ['latin', 'thai'],
  variable: '--font-kanit',
  display: 'swap',
});

const sarabun = Sarabun({
  weight: ['300', '400', '500', '600'],
  subsets: ['latin', 'thai'],
  variable: '--font-sarabun',
  display: 'swap',
});

export const metadata = {
  title: 'Al-Maktabah Al-Athariyyah',
  description: 'ห้องสมุดหนังสืออิสลาม คลังความรู้เพื่อชนรุ่นหลัง',
};

// Runs before first paint so a chosen theme applies without a flash.
// Dark is the default shell; light is opt-in only.
const themeScript = `(function(){try{if(localStorage.getItem('theme')==='light'){document.documentElement.setAttribute('data-theme','light');}}catch(e){}})();`;

/**
 * Root layout holds only the document shell and providers.
 * Chrome lives in the route-group layouts: (site) for readers,
 * admin for the owner.
 *
 * The font variables go on <html> so they land on :root, where
 * globals.css composes --display and --text from them. A custom
 * property is substituted where it is declared, not where it is
 * used, so declaring them on <body> would leave those empty.
 */
export default function RootLayout({ children }) {
  return (
    <html
      lang="th"
      className={`${kanit.variable} ${sarabun.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
