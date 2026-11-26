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
  { key: 'website',  label: 'เว็บไซต์',        icon: 'Globe',       hint: 'https://example.com' },
  { key: 'youtube',  label: 'ยูทูป',           icon: 'MonitorPlay', hint: 'https://youtube.com/@channel' },
  { key: 'telegram', label: 'เทเลแกรม',        icon: 'Send',        hint: 'https://t.me/channel' },
  { key: 'facebook', label: 'เฟซบุ๊ก',         icon: 'Users',       hint: 'https://facebook.com/page' },
  { key: 'drive',    label: 'ไดรฟ์',           icon: 'HardDrive',   hint: 'https://drive.google.com/drive/folders/…' },
  { key: 'library',  label: 'ห้องสมุดออนไลน์', icon: 'Library',     hint: 'https://example.org/library' },
  { key: 'other',    label: 'อื่นๆ',           icon: 'Link2',       hint: 'https://…' },
];

export const OTHER_KIND = SOURCE_KINDS[SOURCE_KINDS.length - 1];

export function kindOf(key) {
  return SOURCE_KINDS.find((k) => k.key === key) || OTHER_KIND;
}

const CURATED_VERSION = 1;

/**
 * Verified Thai Salafi / Ahlus-Sunnah Islamic book repositories, encyclopedias,
 * publishers, and da'wah knowledge portals. Merged automatically on first load
 * without duplicating existing URLs; once the admin saves in /admin/sources,
 * their customized Firestore list takes full precedence.
 */
export const RECOMMENDED_THAI_SALAFI_SOURCES = [
  // ===== ห้องสมุดออนไลน์และคลังไฟล์ PDF ภาษาไทย =====
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
    description: 'แหล่งแปลคำถาม-คำตอบปัญหาศาสนาจาก IslamQA เป็นภาษาไทย อ้างอิงหลักฐานจากอัลกุรอานและซุนนะฮ์อย่างละเอียด',
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
    id: 'curated-muslimthai',
    kind: 'website',
    title: 'MuslimThai (หมวด E-Book และคลังความรู้)',
    description: 'พอร์ทัลความรู้อิสลามในไทยที่มีหมวดรวบรวม E-Book ตำราวิชาการอิสลาม และอัลกุรอานแปลไทย',
    url: 'https://www.muslimthai.com',
  },
  {
    id: 'curated-ftu',
    kind: 'website',
    title: 'มหาวิทยาลัยฟาฏอนี (Fatoni University)',
    description: 'สถาบันอุดมศึกษาอิสลามชั้นนำในภาคใต้ แหล่งผลิตงานวิชาการ หนังสือ และวารสารอัล-นูรด้านอิสลามศึกษา',
    url: 'https://www.ftu.ac.th',
  },

  // ===== สื่อวิดีโอ บรรยาย และแหล่งต้นฉบับสะละฟีสากลสำหรับงานแปล =====
  {
    id: 'curated-whiteflix',
    kind: 'youtube',
    title: 'White Channel / WhiteFlix',
    description: 'สถานีโทรทัศน์และแพลตฟอร์มสื่ออิสลามออนไลน์ นำเสนอรายการวิชาการ บรรยายธรรม และสาระความรู้ตามแนวทางอัลกุรอานและซุนนะฮ์',
    url: 'https://whiteflix.tv',
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

/** Merges curated sources that are not already present in `existing` by normalized URL. */
export function mergeRecommendedSources(existing = []) {
  const base = normalise(existing);
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
    const stored = normalise(data?.items);
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
