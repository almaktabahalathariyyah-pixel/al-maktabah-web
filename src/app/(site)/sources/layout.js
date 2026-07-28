/**
 * The page itself is a client component (it reads the list from Firestore in
 * the browser), and a client component cannot export `metadata`. This layout
 * carries it so the tab title and link previews are not the site-wide default.
 */
export const metadata = {
  title: 'แหล่งหนังสืออื่นๆ · Al-Maktabah Al-Athariyyah',
  description:
    'รวมเว็บไซต์ ช่องยูทูป ช่องเทเลแกรม เพจเฟซบุ๊ก และโฟลเดอร์ไดรฟ์ ที่เผยแพร่ตำราและบทเรียนอิสลาม',
};

export default function SourcesLayout({ children }) {
  return children;
}
