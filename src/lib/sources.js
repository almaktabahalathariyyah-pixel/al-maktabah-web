import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * External places to find books, curated by the owner.
 *
 * Kept in a SINGLE document (config/sources) for the same reason the field
 * schema is: the whole list costs one read, and `config/*` is already public
 * to read and owner-only to write under firestore.rules. There is no per-item
 * query, so a collection would buy nothing.
 */

export const SOURCE_KINDS = [
  { key: 'website',   label: 'เว็บไซต์',        icon: 'Globe',       hint: 'https://example.com' },
  { key: 'youtube',   label: 'ยูทูป',           icon: 'MonitorPlay', hint: 'https://youtube.com/@channel' },
  { key: 'telegram',  label: 'เทเลแกรม',        icon: 'Send',        hint: 'https://t.me/channel' },
  { key: 'facebook',  label: 'เฟซบุ๊ก',         icon: 'Users',       hint: 'https://facebook.com/page' },
  { key: 'instagram', label: 'อินสตาแกรม',      icon: 'Camera',      hint: 'https://instagram.com/account' },
  { key: 'drive',     label: 'ไดรฟ์',           icon: 'HardDrive',   hint: 'https://drive.google.com/drive/folders/…' },
  { key: 'library',   label: 'ห้องสมุดออนไลน์', icon: 'Library',     hint: 'https://example.org/library' },
  { key: 'other',     label: 'อื่นๆ',           icon: 'Link2',       hint: 'https://…' },
];

export const OTHER_KIND = SOURCE_KINDS[SOURCE_KINDS.length - 1];

export function kindOf(key) {
  return SOURCE_KINDS.find((k) => k.key === key) || OTHER_KIND;
}

const CURATED_VERSION = 12;

const MUNADIYA_DESC =
  'ห้องเรียนและแพลตฟอร์มการเรียนรู้อิสลามออนไลน์ตามแนวทางสะละฟุศศอลิห์ รวบรวมสื่อการสอน บทความ เอกสารวิชาการ และ E-Book แปลจากตำราปราชญ์สายสะละฟี ครอบคลุมอะกีดะฮ์ มันฮัจญ์ ฟิกฮ์ ตัฟซีร และตัรบียะฮ์';

/**
 * Verified Thai Salafi / Ahlus-Sunnah Islamic book repositories, encyclopedias,
 * publishers, and da'wah knowledge portals. Merged automatically on first load
 * without duplicating existing URLs; once the admin saves in /admin/sources,
 * their customized Firestore list takes full precedence.
 */
export const RECOMMENDED_THAI_SALAFI_SOURCES = [
  // ===== ห้องสมุดออนไลน์และคลังไฟล์ PDF ภาษาไทย =====
  {
    id: 'curated-salafi-book-vercel',
    kind: 'library',
    title: 'คลังหนังสือสะลัฟประเทศไทย (خَزَانَةُ السَّلَفِ في تايلاند)',
    description: 'เว็บคลังหนังสือและงานเขียนของบรรดาปราชญ์สะลัฟฉบับภาษาไทย พร้อมไฟล์ PDF และลิงก์ดาวน์โหลดฟรีสำหรับผู้แสวงหาความรู้',
    url: 'https://salafi-book.vercel.app',
  },
  {
    id: 'curated-genfa',
    kind: 'library',
    title: 'GenFa (เก็นฟา — E-Book และสื่ออิสลามสายซุนนะฮ์)',
    description: 'เว็บไซต์และสำนักพิมพ์อิสลามสายซุนนะฮ์ รวบรวม E-Book แผนที่อัลกุรอาน อินโฟกราฟิก ดุอาอ์-อัซการ และประวัติศาสตร์อิสลาม',
    url: 'https://genfa.co',
  },
  {
    id: 'curated-pubhtml5-alislah',
    kind: 'library',
    title: 'หิ้งหนังสือ Al-Islah Bangkoknoi (PubHTML5)',
    description: 'ชั้นหนังสือฟลิปบุ๊กออนไลน์ของอัล-อิศลาหฺสมาคม (บางกอกน้อย) รวบรวมเอกสารวิชาการและหนังสือศาสนาตามแนวทางกิตาบุลลอฮ์และซุนนะฮ์กว่า 190 เล่ม',
    url: 'https://pubhtml5.com/bookcase/ysjh/',
  },
  {
    id: 'curated-anyflip-islam-th',
    kind: 'library',
    title: 'AnyFlip — คลัง E-Book หนังสืออิสลามภาษาไทย',
    description: 'แหล่งอ่านและดาวน์โหลด E-Book หนังสืออิสลามแปลไทย เช่น แนวทางสลัฟ อัลอะกีดะฮ์อัฏเฏาะฮาวียะฮ์ สอนอะกีดะฮ์หนูน้อย และฟิกฮุซซุนนะฮ์',
    url: 'https://anyflip.com/explore?q=%E0%B8%AD%E0%B8%B4%E0%B8%AA%E0%B8%A5%E0%B8%B2%E0%B8%A1',
  },
  {
    id: 'curated-islamicbooks19',
    kind: 'library',
    title: 'IslamicBooks19 (สำนักพิมพ์ดิจิทัลอิสลาม)',
    description: 'คลังบทความ ดุอาอ์ และหนังสือแนะนำอิสลามภาษาไทยที่ถ่ายทอดความรู้คลาสสิกให้อ่านเข้าใจง่ายและนำไปใช้ได้จริง',
    url: 'https://islamicbooks19.netlify.app',
  },
  {
    id: 'curated-salafyvanguard',
    kind: 'website',
    title: 'เพื่อนร่วมแนวทางสะลัฟ (Salafy Vanguard)',
    description: 'บล็อกรวบรวมบทความแปล เอกสารแจกฟรี และหลักการอะกีดะฮ์-มันฮัจญ์ตามแนวทางสะละฟุศศอลิห์',
    url: 'https://salafyvanguard.wordpress.com',
  },
  {
    id: 'curated-islamhouse-th',
    kind: 'library',
    title: 'IslamHouse ภาษาไทย (คลังหนังสืออิสลาม PDF)',
    description: 'คลังดาวน์โหลดหนังสืออิสลาม PDF, E-Book, บทความ และไฟล์เสียงแปลไทยที่ใหญ่ที่สุดแห่งหนึ่ง ครอบคลุมอะกีดะฮ์ เตาฮีด ฟิกฮ์ หะดีษ และตำราปราชญ์สะละฟี',
    url: 'https://islamhouse.com/th',
  },
  {
    id: 'curated-salafythai',
    kind: 'library',
    title: 'เพื่อนร่วมแนวทางสะลัฟ (SalafyThai)',
    description: 'คลังหนังสือ PDF แจกฟรี บทความ และตำราแปลไทยตามแนวทางสะละฟุศศอลิห์ เช่น กิตาบุตเตาฮีด อะกีดะฮ์ มันฮัจญ์ และการชี้แจงเรื่องบิดอะฮ์',
    url: 'https://salafythai.com',
  },
  {
    id: 'curated-sarhaan-th',
    kind: 'library',
    title: 'ห้องสมุด ดร.ฮัยษม ซัรฮาน (Sarhaan Library)',
    description: 'คลังดาวน์โหลดตำราและคู่มืออธิบายหลักศรัทธา อะกีดะฮ์ ฟิกฮ์ และตารางสรุปวิชาการอิสลาม มีฉบับแปลภาษาไทยให้ดาวน์โหลดฟรี',
    url: 'https://sarhaan.com',
  },
  {
    id: 'curated-muslim-library-th',
    kind: 'library',
    title: 'Muslim Library (หมวดภาษาไทย)',
    description: 'ห้องสมุดอิสลามออนไลน์นานาชาติ รวบรวมหนังสือแปลภาษาไทยรูปแบบ PDF ให้อ่านและดาวน์โหลดฟรีหลายหมวดหมู่',
    url: 'https://www.muslim-library.com/languages/thai/',
  },
  {
    id: 'curated-islamland-th',
    kind: 'library',
    title: 'IslamLand ภาษาไทย',
    description: 'คลังหนังสือ บทความ และสื่อดะอ์วะฮ์แปลไทย ครอบคลุมหลักศรัทธาอะกีดะตุสสะลัฟ ฟิกฮ์ และคู่มือมุสลิม',
    url: 'https://islamland.com/tha',
  },
  {
    id: 'curated-archive-th-islam',
    kind: 'library',
    title: 'Internet Archive — คลังหนังสืออิสลามภาษาไทย',
    description: 'แหล่งรวมไฟล์ PDF และ E-Book อิสลามภาษาไทย เช่น อัลกุรอานแปลไทยฉบับสมาคมนักเรียนเก่าอาหรับ หนังสือดุอาอ์ และตำราวิชาการเก่าหายาก',
    url: 'https://archive.org/search?query=%E0%B8%AB%E0%B8%99%E0%B8%B1%E0%B8%87%E0%B8%AA%E0%B8%B7%E0%B8%AD%E0%B8%AD%E0%B8%B4%E0%B8%AA%E0%B8%A5%E0%B8%B2%E0%B8%A1&and%5B%5D=mediatype%3A%22texts%22',
  },
  {
    id: 'curated-newmuslimguide-th',
    kind: 'library',
    title: 'New Muslim Guide ภาษาไทย (คู่มือมุสลิมใหม่)',
    description: 'คู่มือศึกษาอิสลามเบื้องต้นภาษาไทยฉบับสมบูรณ์ ทั้งแบบอ่านออนไลน์และ PDF ครอบคลุมหลักศรัทธา การละหมาด การถือศีลอด และจริยธรรม',
    url: 'https://www.newmuslimguide.com/th',
  },
  {
    id: 'curated-qurancomplex',
    kind: 'library',
    title: 'ศูนย์กษัตริย์ฟะฮัดเพื่อการพิมพ์อัลกุรอาน (มะดีนะฮ์)',
    description: 'แหล่งทางการของอัลกุรอานพร้อมความหมายภาษาไทย (แปลโดยสมาคมนักเรียนเก่าอาหรับ) และตำราอัลกุรอานระดับมาตรฐานสากล',
    url: 'https://qurancomplex.gov.sa',
  },
  {
    id: 'curated-shamela',
    kind: 'library',
    title: 'Al-Maktaba Al-Shamela (المكتبة الشاملة)',
    description: 'ห้องสมุดตำราอิสลามคลาสสิกภาษาอาหรับที่ใหญ่ที่สุด สำหรับค้นคว้าตรวจสอบต้นฉบับหะดีษ ตัฟซีร อะกีดะฮ์ และฟิกฮ์ประกอบงานแปลไทย',
    url: 'https://shamela.ws',
  },

  // ===== สารานุกรมอัลกุรอาน หะดีษ และฟัตวาภาษาไทย =====
  {
    id: 'curated-hadeethenc-th',
    kind: 'website',
    title: 'HadeethEnc ภาษาไทย (สารานุกรมหะดีษ)',
    description: 'สารานุกรมหะดีษนบีแปลไทยอย่างเป็นระบบ ระบุระดับความถูกต้องของหะดีษ คำอธิบายศัพท์ และบทเรียนที่ได้รับจากหะดีษแต่ละบท',
    url: 'https://hadeethenc.com/th/home',
  },
  {
    id: 'curated-quranenc-th',
    kind: 'website',
    title: 'QuranEnc ภาษาไทย (สารานุกรมแปลความหมายอัลกุรอาน)',
    description: 'แหล่งรวมคำแปลความหมายอัลกุรอานและอรรถาธิบายอัลกุรอานอย่างย่อ (อัลมุคตะศ็อร ฟี ตัฟซีร อัลกุรอาน) ฉบับภาษาไทยที่ตรวจสอบโดยคณะผู้รู้',
    url: 'https://quranenc.com/th/home',
  },
  {
    id: 'curated-quranth',
    kind: 'website',
    title: 'QuranTH (อัลกุรอานแปลไทยและตัฟซีร)',
    description: 'เว็บไซต์อ่านอัลกุรอานพร้อมความหมายภาษาไทยและตัฟซีร (คำอธิบายอัลกุรอาน) ค้นหาสูเราะฮ์และอายะฮ์ได้สะดวก',
    url: 'https://www.quranth.com',
  },
  {
    id: 'curated-sunnahthai',
    kind: 'website',
    title: 'SunnahThai (ซุนนะฮ์ไทย)',
    description: 'แหล่งรวมหะดีษแปลไทย (ศอฮีฮ์อัลบุคอรี ศอฮีฮ์มุสลิม ฯลฯ) พร้อมตัวบทภาษาอาหรับ อัลกุรอาน และบทความตามแนวทางซุนนะฮ์',
    url: 'https://www.sunnahthai.com',
  },
  {
    id: 'curated-fatwathai',
    kind: 'website',
    title: 'FatwaThai (ฟัตวาไทย)',
    description: 'เว็บไซต์รวบรวมและแปลคำวินิจฉัยปัญหาศาสนา (ฟัตวา) จากบรรดาปราชญ์อะฮ์ลุสซุนนะฮ์วัลญะมาอะฮ์เป็นภาษาไทย',
    url: 'https://fatwathai.com',
  },
  {
    id: 'curated-thaiislamqa',
    kind: 'website',
    title: 'ThaiIslamQA (แปลฟัตวา IslamQA ภาษาไทย)',
    description: 'แหล่งแปลคำถาม-คำตอบปัญหาศาสนาจาก IslamQA เป็นภาษาไทยกว่า 400 คำถาม อ้างอิงหลักฐานจากอัลกุรอานและซุนนะฮ์อย่างละเอียด',
    url: 'https://thaiislamqa.com',
  },

  // ===== เว็บไซต์ สำนักพิมพ์ และสถาบันดะอ์วะฮ์สายสะละฟีในไทย =====
  {
    id: 'curated-assabiqoon',
    kind: 'website',
    title: 'สำนักพิมพ์อัซซาบิกูน (Assabiqoon Publisher)',
    description: 'สำนักพิมพ์และศูนย์เผยแผ่ความรู้ศาสนาแนวทางสะละฟี รวบรวมซีรีส์หลักศรัทธา หนังสือเตาฮีด หนังสือแปลจากอุละมาอ์ และบทความวิชาการ',
    url: 'https://assabiqoon.com',
  },
  {
    id: 'curated-islaminthailand',
    kind: 'website',
    title: 'Islam in Thailand (อิสลามในประเทศไทย)',
    description: 'คลังบทความวิชาการ เอกสาร PDF บทเรียนตัฟซีร หะดีษ อะกีดะฮ์ และผลงานของชัยคฺริฎอ อะหมัด สมะดี และคณาจารย์สายซุนนะฮ์',
    url: 'https://www.islaminthailand.org',
  },
  {
    id: 'curated-islammore',
    kind: 'website',
    title: 'IslamMore (อิสลามมอร์)',
    description: 'เว็บไซต์เผยแผ่ความรู้อิสลามตามแนวทางอัลกุรอานและซุนนะฮ์ มีบทความ ฟัตวา หนังสือแนะนำ และประเด็นร่วมสมัย',
    url: 'https://www.islammore.com',
  },
  {
    id: 'curated-alislahsamakom',
    kind: 'website',
    title: 'อัล-อิศลาหฺสมาคม (บางกอกน้อย)',
    description: 'สมาคมเผยแผ่แนวทางกิตาบุลลอฮ์และซุนนะฮ์อันเก่าแก่ของไทย มีเอกสารวิชาการ บทความ และหนังสือความรู้ศาสนา',
    url: 'https://www.alislahsamakom.org',
  },
  {
    id: 'curated-sunnahstudents',
    kind: 'website',
    title: 'Sunnah Students (กระดานเสวนานักศึกษาอะฮ์ลุสซุนนะฮ์)',
    description: 'แหล่งรวมบทความวิชาการ ฟัตวา และคลังตำราศาสนาด้านอะกีดะฮ์ ฟิกฮ์ และหะดีษของเครือข่ายนักศึกษาอะฮ์ลุสซุนนะฮ์',
    url: 'https://www.sunnahstudents.com',
  },
  {
    id: 'curated-daasee',
    kind: 'website',
    title: 'Daasee (ศูนย์การเรียนรู้อิสลามและภาษาอาหรับ)',
    description: 'คลังสื่อการเรียนรู้อิสลาม อัลกุรอาน ตัจญ์วีด หะดีษ และหลักศรัทธาเบื้องต้น พร้อมระบบค้นหาอายะฮ์และบทบัญญัติ',
    url: 'https://www.daasee.com',
  },
  {
    id: 'curated-darisslamm',
    kind: 'website',
    title: 'ดารุสสลาม (Darisslamm)',
    description: 'แหล่งรวมบทความอิสลาม อุศูลุตตัฟซีร หลักศรัทธา และคู่มือปฏิบัติศาสนกิจตามแนวทางอัลกุรอานและซุนนะฮ์',
    url: 'https://darisslamm.com',
  },
  {
    id: 'curated-sufumothman',
    kind: 'website',
    title: 'ซุฟอัม อุษมาน (Sufum Othman)',
    description: 'แหล่งรวมผลงานแปลหนังสือ บทความวิชาการ และสื่อความรู้ศาสนาอิสลามตามแนวทางอะฮ์ลุสซุนนะฮ์วัลญะมาอะฮ์และสะละฟุศศอลิห์',
    url: 'https://sufumothman.com',
  },
  {
    id: 'curated-munadiya-linktree',
    kind: 'website',
    title: 'Munadiya (มุนาดิยา — ห้องเรียนศาสนาออนไลน์)',
    description: MUNADIYA_DESC,
    url: 'https://linktr.ee/munadiya',
  },
  {
    id: 'curated-ftu',
    kind: 'website',
    title: 'มหาวิทยาลัยฟาฏอนี (Fatoni University)',
    description: 'สถาบันอุดมศึกษาอิสลามชั้นนำในภาคใต้ แหล่งผลิตงานวิชาการ หนังสือ และวารสารอัล-นูรด้านอิสลามศึกษา',
    url: 'https://www.ftu.ac.th',
  },

  // ===== เพจเฟซบุ๊ก อินสตาแกรม ช่องยูทูป และต้นฉบับสะละฟีสากล =====
  {
    id: 'curated-assabiqoon-fb',
    kind: 'facebook',
    title: 'สำนักพิมพ์อัซซาบิกูน (Facebook)',
    description: 'เพจทางการของสำนักพิมพ์อัซซาบิกูน เผยแพร่บทความ หนังสือแปล ซีรีส์สอนตำราอะกีดะฮ์ และไลฟ์สดวิชาการตามแนวทางสะลัฟ',
    url: 'https://www.facebook.com/AssabiqoonPublisher',
  },
  {
    id: 'curated-munadiya-ig',
    kind: 'instagram',
    title: 'Munadiya Official (Instagram)',
    description: MUNADIYA_DESC,
    url: 'https://www.instagram.com/munadiya_official/',
  },
  {
    id: 'curated-talib-club-web',
    kind: 'website',
    title: 'Talib Club (เว็บไซต์)',
    description: 'แพลตฟอร์มและคลังความรู้การศึกษาอิสลามเชิงวิชาการ หนังสือ บทความ และสื่อดะอ์วะฮ์ตามแนวทางสะละฟี',
    url: 'https://talibclub.org',
  },
  {
    id: 'curated-talib-club',
    kind: 'youtube',
    title: 'Talib Club / Talib Publisher (YouTube)',
    description: 'ช่องนำเสนอการศึกษาอิสลามเชิงวิชาการ (Academic Islamic Studies) และรายการเสวนา Talib Talk ตามแนวทางที่ถูกต้อง',
    url: 'https://www.youtube.com/@talibpublisher',
  },
  {
    id: 'curated-assabiqoon-yt',
    kind: 'youtube',
    title: 'สำนักพิมพ์อัซซาบิกูน (YouTube)',
    description: 'ช่องบรรยายหลักศรัทธา ซีรีส์อะกีดะฮ์แนวทางสะลัฟ การตอบข้อสงสัยต่างศาสนิก และรายการ Assabiqoon Islamic Forum',
    url: 'https://www.youtube.com/@AssabiqoonPublisher',
  },
  {
    id: 'curated-alhamdtv-yt',
    kind: 'youtube',
    title: 'Alhamdulillah Group / AlhamdTV (YouTube)',
    description: 'สื่อกลางงานดะอ์วะฮ์ รวบรวมคลิปบรรยายศาสนธรรม หะดีษ เตาฮีด และข้อคิดอิสลามจากคณาจารย์สายซุนนะฮ์',
    url: 'https://www.youtube.com/@AlhamdTV',
  },
  {
    id: 'curated-alhamdtv-web',
    kind: 'website',
    title: 'AlhamdTV (อัลฮัมดุลิลลาฮฺ กรุ๊ป)',
    description: 'เว็บไซต์รวบรวมสื่อบรรยาย บทความ และกิจกรรมดะอ์วะฮ์เพื่อส่งเสริมความรู้ศาสนาตามแนวทางอัลกุรอานและซุนนะฮ์',
    url: 'https://alhamdtv.com',
  },
  {
    id: 'curated-whiteflix',
    kind: 'youtube',
    title: 'White Channel / WhiteFlix',
    description: 'สถานีโทรทัศน์และแพลตฟอร์มสื่ออิสลามออนไลน์ นำเสนอรายการวิชาการ บรรยายธรรม และสาระความรู้ตามแนวทางอัลกุรอานและซุนนะฮ์',
    url: 'https://whiteflix.tv',
  },
  {
    id: 'curated-thaisalafi-yt',
    kind: 'youtube',
    title: 'Salafiyoon — ชมรมอัซซะละฟิยูน (YouTube)',
    description: 'รวบรวมคลิปบรรยาย คุฏบะฮ์วันศุกร์ และการสอนตำรา (เช่น กิตาบุตเตาฮีด) โดย อ.อิสฮาก พงษ์มณี, อ.อาบีดีณ โยธาสมุทร และคณาจารย์สายสะลัฟ',
    url: 'https://www.youtube.com/@thaisalafi',
  },
  {
    id: 'curated-sufumothman-yt',
    kind: 'youtube',
    title: 'ซุฟอัม อุษมาน | Suf-um Othman (YouTube)',
    description: 'ช่องสอนศาสนา ตัฟซีรอัลกุรอานทีละสูเราะฮ์ อะกีดะฮ์ และคุฏบะฮ์ประจำสัปดาห์โดย อ.ซุฟอัม อุษมาน',
    url: 'https://www.youtube.com/@sufumothman',
  },
  {
    id: 'curated-alyaqeen-yt',
    kind: 'youtube',
    title: 'ALYAQEEN CHANNEL (YouTube)',
    description: 'รวมคลิปบรรยายธรรมและหลักสูตรการเรียนรู้ซุนนะฮ์ โดย อ.ยูซุฟ พงกาวี, อ.มุสตอฟา อยู่เป็นสุข และคณาจารย์สายซุนนะฮ์',
    url: 'https://www.youtube.com/@ALYAQEENCHANNEL',
  },
  {
    id: 'curated-manarah-yt',
    kind: 'youtube',
    title: 'Manarah Channel (YouTube)',
    description: 'ศูนย์รวมไลฟ์สดและคลิปสอนตำราอะกีดะฮ์และหะดีษ (เช่น อะกีดะฮ์อิบนุ ดะกีก, 40 หะดีษอันนะวะวีย์) โดย อ.ซอบรี นภากร และคณาจารย์สายซุนนะฮ์',
    url: 'https://www.youtube.com/@manarah',
  },
  {
    id: 'curated-arifsalafi-yt',
    kind: 'youtube',
    title: 'Arif Salafi (YouTube)',
    description: 'ช่องบรรยายหลักศรัทธา แนวทางสะลัฟ และการชี้แจงประเด็นศาสนาภาษาไทย',
    url: 'https://www.youtube.com/@ArifSalafi',
  },
  {
    id: 'curated-whitechannel-yt',
    kind: 'youtube',
    title: 'White Channel (YouTube)',
    description: 'ช่องยูทูปทางการของไวท์แชนแนล นำเสนอรายการตอบปัญหาศาสนาและการบรรยายตามแนวทางอัลกุรอานและซุนนะฮ์',
    url: 'https://www.youtube.com/@whitechannel24hr',
  },
  {
    id: 'curated-yateemtv-yt',
    kind: 'youtube',
    title: 'Yateem TV (YouTube)',
    description: 'ช่องยูทูปทางการของยาตีมทีวี รวมคลิปบรรยายศาสนา ตัฟซีร หะดีษ และตอบคำถามศาสนาจากคณาจารย์สายซุนนะฮ์ในไทย',
    url: 'https://www.youtube.com/@YateemTV1433',
  },
  {
    id: 'curated-yateemtv',
    kind: 'website',
    title: 'Yateem TV (เว็บไซต์)',
    description: 'สถานีโทรทัศน์และสื่อบรรยายศาสนาของคณาจารย์สายซุนนะฮ์ในไทย รวบรวมคลิปสอนศาสนา ตัฟซีร หะดีษ และตอบคำถามศาสนา',
    url: 'https://yateem.tv',
  },
  {
    id: 'curated-alhaneefeeyah-web',
    kind: 'library',
    title: 'ห้องสมุดอัลฮะนีฟียะฮ์ (الحنفية — Alhaneefeeyah)',
    description: 'ห้องสมุดอิสลามออนไลน์ภาษาไทย รวบรวมหนังสือ PDF บทความแปล ตำราสะลัฟ อะกีดะฮ์ หะดีษ และสื่อความรู้ศาสนาตามแนวทางสะละฟุศศอลิห์',
    url: 'https://www.alhaneefeeyah.net',
  },
  {
    id: 'curated-rasypubs',
    kind: 'library',
    title: 'สำนักพิมพ์รอซี่ย์ (RasyPubs)',
    description: 'คลังหนังสือและเอกสารวิชาการอิสลามภาษาไทยตามแนวทางสะละฟุศศอลิห์ ครอบคลุมหมวดอะกีดะฮ์ เตาฮีด ฟิกฮ์ และบทความแปลจากปราชญ์สะลัฟ',
    url: 'https://rasypubs.pages.dev',
  },
  {
    id: 'curated-muslimfriend-web',
    kind: 'website',
    title: 'มูลนิธิเพื่อนมุสลิม (Muslim\'s Friend Foundation)',
    description: 'องค์กรไม่แสวงหาผลกำไรด้านงานดะอ์วะฮ์และการศึกษาศาสนาตามแนวทางสะละฟี ("สู่สังคมที่ดี ด้วยหลักศรัทธา")',
    url: 'https://muslimfriend.org',
  },
  {
    id: 'curated-ibnbaz-th-fb',
    kind: 'facebook',
    title: 'สถาบันอิบนุบาซเพื่ออิสลามศึกษา — Ibn Baz Institute (Facebook)',
    description: 'โครงการแปลตำราปราชญ์อิสลามและหลักสูตรศึกษาอิสลามแบบเป็นขั้นเป็นตอน (Step by Step) ตามแนวทางสะลัฟ',
    url: 'https://www.facebook.com/IbnBazTh',
  },
  {
    id: 'curated-truthislam-fb',
    kind: 'facebook',
    title: 'สำนักพิมพ์ผู้สนใจในอิสลาม — Truth Islam Publisher (Facebook)',
    description: 'สำนักพิมพ์และสื่อวิชาการศาสนาอิสลามเชิงลึก ("ปฏิรูปสังคมมุสลิมผ่านความรู้วิชาการอิสลามที่ถูกต้อง")',
    url: 'https://www.facebook.com/profile.php?id=61565389662125',
  },
  {
    id: 'curated-humanwrite-fb',
    kind: 'facebook',
    title: 'สำนักพิมพ์ Human Write (Facebook)',
    description: 'สำนักพิมพ์หนังสืออิสลามวิชาการตามแนวทางซุนนะฮ์ ("ปกปักรักษาศาสนาผ่านงานเขียน — เปลี่ยนมนุษย์ทีละคน เปลี่ยนสังคมทีละบรรทัด")',
    url: 'https://www.facebook.com/profile.php?id=100063260017282',
  },
  {
    id: 'curated-attaymiyyah-fb',
    kind: 'facebook',
    title: 'อัต-ตัยมียะฮ์ — التيمية (Facebook)',
    description: 'เพจหนังสือ บทความวิชาการ และการชี้แจงตอบโต้ข้อคลุมเครือ (อัร-ร็อด วัดดะอ์วะฮ์) ตามแนวทางสะละฟุศศอลิห์',
    url: 'https://www.facebook.com/profile.php?id=61572292302402',
  },
  {
    id: 'curated-muslimsfriend-fb',
    kind: 'facebook',
    title: 'มูลนิธิเพื่อนมุสลิม (Facebook)',
    description: 'เพจทางการของมูลนิธิเพื่อนมุสลิม เผยแพร่กิจกรรมดะอ์วะฮ์ คลิปบรรยาย และสื่อการเรียนรู้อิสลามสายสะละฟี',
    url: 'https://www.facebook.com/muslimsfriendfoundation',
  },
  {
    id: 'curated-punkwamro-fb',
    kind: 'facebook',
    title: 'มูลนิธิ ปันความรู้ — Sharing Knowledge Foundation (Facebook)',
    description: 'สอนและเผยแพร่องค์ความรู้ที่เป็นประโยชน์ ให้ความกระจ่างแก่มุสลิมในเรื่องความเชื่อ การศรัทธา และการปฏิบัติ พร้อมรายการปันความรู้ทอล์ก',
    url: 'https://www.facebook.com/punkwame.ro',
  },
  {
    id: 'curated-abbas-salafi-fb',
    kind: 'facebook',
    title: 'Abbas Mtp (Facebook)',
    description: 'เพจแบ่งปันบทความ คำสอนของบรรดาอุละมาอ์ และข้อคิดตามแนวทางสะละฟุศศอลิห์',
    url: 'https://www.facebook.com/Abbas.M.salafi',
  },
  {
    id: 'curated-ruknulkitab-fb',
    kind: 'facebook',
    title: 'มุมหนังสือ ركن الكتاب (Facebook)',
    description: 'เผยแพร่ความรู้ บทความ และหนังสือตามแนวทางสะละฟีย์',
    url: 'https://www.facebook.com/furhan621411005',
  },
  {
    id: 'curated-madrasahalwabil-fb',
    kind: 'facebook',
    title: 'Madrasah Al-wabil — مدرسة الوابل (Facebook)',
    description: 'ช่องมัดเราะซะฮ์ อัลวาบิล เพื่อการศึกษาความรู้ศาสนาออนไลน์ บทความ ฟัตวาสำหรับสตรี หะดีษ คลิปสั้นอุละมาอ์ เรียนหนังสือออนไลน์ และ E-Book อัลวาบิล',
    url: 'https://www.facebook.com/madrasahalwabil',
  },
  {
    id: 'curated-ibnuyusuf-ig',
    kind: 'instagram',
    title: 'Ibnu Yusuf (Instagram)',
    description: 'ช่องทางเผยแพร่ E-Book แปลจากโครงการสืบสานงานอุละมาอ์และบทความความรู้ศาสนาภาษาไทย',
    url: 'https://www.instagram.com/_ibnuyusuf/',
  },
  {
    id: 'curated-rightpath-web',
    kind: 'website',
    title: 'Right Path (เว็บไซต์ — rightpath.info)',
    description: 'แหล่งรวมบทความวิชาการหักล้างการบิดเบือนอิสลาม ตอบโต้ข้อคลุมเครือ และงานดะอ์วะฮ์สายสะละฟีภาษาไทย',
    url: 'https://rightpath.info',
  },
  {
    id: 'curated-rightpath-fb',
    kind: 'facebook',
    title: 'Right Path Salafi (Facebook)',
    description: 'เพจหักล้างการบิดเบือนอิสลามอย่างเป็นวิชาการ และเผยแพร่บทความดะอ์วะฮ์สายสะละฟีเป็นประจำทุกวัน',
    url: 'https://www.facebook.com/RightPath.219',
  },
  {
    id: 'curated-rightpath-ig',
    kind: 'instagram',
    title: 'Right Path Salafi (Instagram)',
    description: 'อินสตาแกรมของ Right Path Salafi เผยแพร่บทความสั้น อินโฟกราฟิกหักล้างข้อคลุมเครือ และสาระดะอ์วะฮ์',
    url: 'https://www.instagram.com/right_path.219/',
  },
  {
    id: 'curated-pinionmoon-fb',
    kind: 'facebook',
    title: 'Pinion Moon (Facebook)',
    description: 'สำนักพิมพ์และผู้เผยแพร่สื่อหนังสืออิสลามร่วมสมัย ครอบคลุมศาสนา วิทยาศาสตร์ สังคมวิทยา ประวัติศาสตร์ ปรัชญา และการตอบโต้กระแสโลกวิสัย',
    url: 'https://www.facebook.com/profile.php?id=100075962754486',
  },
  {
    id: 'curated-alhaneefeeyah-yt',
    kind: 'youtube',
    title: 'ห้องสมุดอัลฮะนีฟียะฮ์ (YouTube)',
    description: 'ช่องยูทูปของห้องสมุดอัลฮะนีฟียะฮ์ รวบรวมคลิปบรรยาย คุฏบะฮ์ และซีรีส์สอนตำราสะลัฟภาษาไทย',
    url: 'https://www.youtube.com/@Alhaneefeeyah',
  },
  {
    id: 'curated-ilmulnafi-yt',
    kind: 'youtube',
    title: 'ศูนย์การเรียนรู้อิลมุนนาเฟียอ์ — مركز العلم النافع (YouTube)',
    description: 'เผยแพร่ความรู้ที่ยังประโยชน์จากตำราอุละมาอ์ที่เจริญรอยตามสะลัฟ ในรูปแบบบรรยายซีรีส์ระยะยาวและบทเรียนศาสนา',
    url: 'https://www.youtube.com/@ilmulnafi',
  },
  {
    id: 'curated-alflower-yt',
    kind: 'youtube',
    title: 'อัลฟะวาเอ็ด — alflower.1 (YouTube)',
    description: 'ช่องบทเรียนศาสนา อรรถาธิบายพระนามอันวิจิตรของอัลลอฮ์ กฎเหล็กการขัดเกลาจิตใจ และสื่อหนังสือแปลภาษาไทย',
    url: 'https://www.youtube.com/@alflower.1',
  },
  {
    id: 'curated-alflower-ig',
    kind: 'instagram',
    title: 'อัลฟะวาเอ็ด — alflower.1 (Instagram)',
    description: 'อินสตาแกรมของอัลฟะวาเอ็ด แนะนำหนังสือแปลอิสลามและข้อคิดศาสนาสายสะละฟี',
    url: 'https://www.instagram.com/alflower.1/',
  },
  {
    id: 'curated-evolution-about-yt',
    kind: 'youtube',
    title: 'Evolution-About : วิวัฒนาการตามจริง (YouTube)',
    description: 'ช่องวิชาการให้ความรู้และวิพากษ์ทฤษฎีวิวัฒนาการตามข้อเท็จจริงทางวิทยาศาสตร์ สารคดีพากย์ไทย และพอดแคสต์เชิงศรัทธา',
    url: 'https://www.youtube.com/@evolution-about7798',
  },
  {
    id: 'curated-troid',
    kind: 'website',
    title: 'TROID (The Reign of Islamic Daʿwah)',
    description: 'แหล่งต้นฉบับแผ่นพับดะอ์วะฮ์ บทความ และสื่อเสียงแนวทางสะละฟีภาษาอังกฤษคุณภาพสูง (ต้นฉบับของชุดแผ่นพับภาษาไทยในเว็บนี้)',
    url: 'https://www.troid.org',
  },
  {
    id: 'curated-abukhadeejah',
    kind: 'website',
    title: 'AbuKhadeejah.com (Salafi Publications)',
    description: 'คลังบทความ เอกสารแจกฟรี และหนังสือ PDF แนวทางสะละฟีภาษาอังกฤษ เหมาะสำหรับศึกษาค้นคว้าและนำมาแปลเผยแผ่เป็นภาษาไทย',
    url: 'https://abukhadeejah.com',
  },
];

const CONFIG_REF = () => doc(db, 'config', 'sources');

/**
 * Only http(s) links are allowed through.
 *
 * These render as anchors on a public page, so `javascript:` and `data:` URLs
 * would be stored XSS with the owner's own admin form as the delivery route.
 * Rejecting at both the write and the read means an entry written before this
 * check existed still cannot fire.
 */
export function isSafeUrl(url) {
  try {
    const parsed = new URL(String(url).trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Drops anything malformed and normalises the rest into a stable shape. */
function normalise(items) {
  if (!Array.isArray(items)) return [];

  return items
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => ({
      id: String(item.id || `source-${index}`),
      kind: kindOf(item.kind).key,
      title: String(item.title || '').trim(),
      description: String(item.description || '').trim(),
      url: String(item.url || '').trim(),
    }))
    .filter((item) => item.title && isSafeUrl(item.url));
}

function normUrl(url) {
  return String(url || '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
}

/** Fills in missing descriptions for known sources (e.g. Munadiya) without overwriting custom text. */
function enrichMissingDescriptions(items) {
  return items.map((it) => {
    if (!it.description && /munadiya|มุนาดิยา/i.test(`${it.title} ${it.url}`)) {
      return { ...it, description: MUNADIYA_DESC };
    }
    return it;
  });
}

/** Merges curated sources that are not already present in `existing` by normalized URL. */
export function mergeRecommendedSources(existing = []) {
  const base = enrichMissingDescriptions(normalise(existing));
  const seen = new Set(base.map((it) => normUrl(it.url)));
  const additions = normalise(RECOMMENDED_THAI_SALAFI_SOURCES).filter(
    (it) => !seen.has(normUrl(it.url))
  );
  return [...base, ...additions];
}

/** One document read. Automatically includes curated Thai Salafi sources until admin saves a custom list. */
export async function loadSources() {
  try {
    const snap = await getDoc(CONFIG_REF());
    if (!snap.exists()) {
      return normalise(RECOMMENDED_THAI_SALAFI_SOURCES);
    }
    const data = snap.data();
    const stored = enrichMissingDescriptions(normalise(data?.items));
    if ((data?.curatedVersion || 0) >= CURATED_VERSION) {
      return stored;
    }
    return mergeRecommendedSources(stored);
  } catch (error) {
    console.error('Failed to load sources:', error);
    return normalise(RECOMMENDED_THAI_SALAFI_SOURCES);
  }
}

/** One document write for the whole list. */
export async function saveSources(items) {
  await setDoc(CONFIG_REF(), {
    items: normalise(items),
    curatedVersion: CURATED_VERSION,
    updatedAt: new Date(),
  });
}
