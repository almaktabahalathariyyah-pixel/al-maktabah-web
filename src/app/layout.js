import './globals.css';
import Masthead from '../components/Masthead';

export const metadata = {
  title: 'Al-Maktabah Al-Athariyyah',
  description: 'A library of classical texts, catalogued and delivered privately.',
};

// Runs before first paint so the saved theme is applied without a flash.
// With nothing stored, the CSS falls back to the OS preference.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Masthead>{children}</Masthead>
      </body>
    </html>
  );
}
