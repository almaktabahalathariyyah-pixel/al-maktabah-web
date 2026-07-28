/**
 * The controlled vocabulary configured on the site (แผงควบคุม → ตั้งค่าหมวดหมู่),
 * and the rules that map a book onto it.
 *
 * Every value written into the catalogue must come from these lists. A category
 * outside the site's dropdown imports as an orphan the owner then has to hunt
 * down by hand — the exact work this is meant to remove.
 */

export const CATEGORY_GROUPS = {
  'รากฐาน (Foundations)': ['เตาฮีด', 'อะกีดะฮฺ', 'ซะละฟียะฮฺ', 'มันฮัจญ์'],
  'ฐานความรู้ (Knowledge Base)': [
    'อัลกุรอานและตัฟซีร',
    'หะดีษและซุนนะฮฺ',
    'ฟิกฮฺและอิบาดะฮฺ',
    'ตัซกียะฮฺและตัรบียะฮฺ',
    'ชีวประวัติและประวัติศาสตร์',
    'ผู้แสวงหาความรู้ (ฏอลิบุลอิลม์)',
  ],
  'ลัทธินิกาย (Sectarianism)': ['นิกายและอุตริกรรม', 'กลุ่มและพรรคพวก', 'นักเผยแพร่และบุคคล'],
  'ชีวิตและสังคม (Life & Society)': [
    'การแต่งงานและครอบครัว',
    'สุขภาพและพลานามัย',
    'สตรีและอิสลาม',
    'การศึกษา',
    'ประเด็นร่วมสมัย',
  ],
  'หัวข้ออื่นๆ (Other Topics)': [
    'อเทวนิยมและลัทธิบูชาวิทยาศาสตร์',
    'ลัทธิสุดโต่งและการก่อการร้าย',
    'ความเข้าใจผิด',
    'ศาสนาต่างๆ',
    'อุดมการณ์และการเคลื่อนไหว',
    'เบ็ดเตล็ด',
    'ถาม-ตอบ',
  ],
};

export const CATEGORIES = Object.values(CATEGORY_GROUPS).flat();
export const TYPES = ['หนังสือ', 'บทความ', 'ไฟล์ออนไลน์', 'วารสาร', 'วิทยานิพนธ์', 'งานวิจัย'];
export const LANGUAGES = ['ไทย', 'อาหรับ', 'อังกฤษ', 'อูรดู', 'เปอร์เซีย'];

/**
 * Builds one matcher from Latin and non-Latin keyword lists.
 *
 * They cannot share a \b: a word boundary needs a \w on one side, and Thai and
 * Arabic letters are not \w. `\bตัฟซีร\b` therefore matches inside
 * "40_ตัฟซีร_x" (the underscore supplies the boundary) but NOT at the start of
 * "ตัฟซีร ญุซ 2" — which silently lost most of the Thai library.
 */
function rule(latin, other, category) {
  const parts = [];

  // Latin keywords are tested against normalised text, where - _ . have already
  // become spaces, so they have to be written that way too — otherwise
  // 'bidayatul-mujtahid' can never match "Bidayatul Mujtahid".
  const flat = latin.map((w) => w.replace(/[-_.]+/g, ' '));

  // A leading \bal lets the Arabic article ride along: "alkhawarij" is the same
  // word as "khawarij". Trailing \w* covers plurals and nisba endings, so
  // "supplication" catches "Supplications" and "muhaddith" catches
  // "Muhadditheen".
  if (flat.length) parts.push(`\\b(?:al)?(?:${flat.join('|')})\\w*`);
  if (other.length) parts.push(`(?:${other.join('|')})`);
  return [new RegExp(parts.join('|'), 'i'), category];
}

/**
 * Puts a title into a form the rules can actually match.
 *
 * Three things defeat plain matching in this library:
 *   Fatāwā / Ramaḍān   transliteration diacritics, stripped via NFD
 *   TheMuhadditheen    camel case with no separators, split apart
 *   a_b-c              underscores and dashes standing in for spaces
 *
 * Thai and Arabic are left intact — decomposing Thai would destroy it.
 */
export function normaliseForMatch(text) {
  return String(text || '')
    .normalize('NFD')
    // Strip Latin combining marks only; ั+ are Thai vowels and tone marks.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ʾʿ‘’`]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s{2,}/g, ' ');
}

/**
 * First match wins, so narrow subjects sit above broad ones — a book on the
 * fiqh of fasting belongs in ฟิกฮฺ, not under a loose "Ramadan" rule.
 * Well-known classical titles are listed by name: their subject is not
 * guessable from the words in the title.
 */
export const CATEGORY_RULES = [
  // ---------------- ลัทธินิกาย: named sects first, they are unambiguous ----
  rule(
    ['sufi', 'soofee', 'sufism', 'tasawwuf', 'ashari', "ash'ari", 'asyaeirah', 'ashaa?irah',
     'maturidi', 'matureediyah', 'shia', "shi'a", 'shiite', 'rafidah', 'raafidah',
     'khawarij', 'khawaarij', 'kharijite', 'jahmiyyah', 'murjiah', "mu'tazil",
     'qadyani', 'qadiani', 'ahmadiyya', 'babiyah', 'bahai', 'bahaieyah', 'zaydi',
     'deobandi', 'barelvi', 'takfir al', 'bidah', "bid'ah", 'innovation', 'innovator'],
    ['ซูฟี', 'ตะเซาวุฟ', 'อัชอะรี', 'อะชาอิเราะฮ', 'มาตุรีดี', 'ชีอะฮ', 'ชีอะห', 'ราฟิเฎาะฮ',
     'เคาะวาริจ', 'ญะฮมียะฮ', 'มุรญิอะฮ', 'มุอฺตะซิละฮ', 'กอดยานี', 'กอดิยานี', 'อะห์มะดียะฮ',
     'บาบียะฮ', 'บะฮาอี', 'ซัยดียะ', 'อุตริกรรม', 'บิดอะฮ', 'ลัทธินอกกรอบ', 'นิกาย',
     'الأشاعرة', 'الماتريدية', 'الشيعة', 'الخوارج', 'القاديانية', 'البهائية', 'البدع'],
    'นิกายและอุตริกรรม'
  ),
  rule(
    ['hizbiyyah', 'hizbiyyah', 'partisan', 'tablighi', 'jamaat tabligh', 'ikhwan', 'ikhwaan',
     'muslim brotherhood', 'groups and parties', 'numerous groups'],
    ['ฮิซบียะฮ', 'พรรคพวก', 'ตับลีฆ', 'อิควาน', 'ญะมาอะฮ์ตับลีฆ', 'กลุ่มญะมาอะฮ', 'กลุ่มต่างๆ',
     'กลุ่มและแนวทาง'],
    'กลุ่มและพรรคพวก'
  ),
  rule(
    ['biography', 'refutation', 'refuting', 'criticism', 'harshness'],
    ['ชีวประวัติของชัยค', 'คำชื่นชม', 'ตอบโต้'],
    'นักเผยแพร่และบุคคล'
  ),

  // ---------------- รากฐาน ----------------
  rule(
    ['tawhid', 'tawheed', 'shirk', 'nullifiers of islam', 'kitab at-tawhid', 'kitab al tawhid',
     'la ilaha illallah', 'two eyes for all', 'wasitah between allah'],
    ['เตาฮีด', 'ชิริก', 'สิ่งที่ทำให้เสียอิสลาม', 'นวากิฎ', 'กิตาบุตเตาฮีด', 'ลาอิลาฮะอิลลัลลอฮ',
     'คำเรียกร้องของพระเจ้า', 'التوحيد', 'الشرك', 'รู้จักพระผู้สร้าง'],
    'เตาฮีด'
  ),
  rule(
    ['aqidah', 'aqeedah', "'aqidah", 'aqaaeid', 'creed', 'iman', 'eemaan', 'al-imaan',
     'asma wa sifat', 'attributes of allah', 'kalam theory', 'usul al-sunnah',
     'ahl as-sunnah wal-jama', 'problem of evil'],
    ['อะกีดะฮ', 'หลักศรัทธา', 'นรก', 'สวรรค์', 'อุศูลุษษะลาษะฮ', 'อีหม่าน', 'อัสมาอ์', 'อะฮ์ลุสซุนนะฮ', 'اعتقاد', 'العقيدة', 'أهل السنة', 'الإيمان', 'สู่ความเข้าใจแก่น', 'วิญญาณหลังความตาย'],
    'อะกีดะฮฺ'
  ),
  rule(['salafi', 'salafiyyah', 'salaf', 'athari'], ['ซะละฟ', 'สะลัฟ', 'สลัฟ'], 'ซะละฟียะฮฺ'),
  rule(['manhaj', 'minhaj', 'methodology', 'usul', 'usool'], ['มันฮัจ', 'อูศูล', 'ทางออกประชาชาติ', 'แนวทางสะลัฟ'], 'มันฮัจญ์'),

  // ---------------- ฐานความรู้ ----------------
  rule(
    ['quran', "qur'an", 'quraan', 'tafsir', 'tafseer', 'tajweed', 'juz amma', 'surah',
     'thematic tafsir', 'ibn kathir'],
    ['กุรอาน', 'ตัฟซีร', 'ตัจวีด', 'ญุซอัมมะ', 'ซูเราะฮ', 'อิบนุกะซีร', 'القرآن', 'التفسير'],
    'อัลกุรอานและตัฟซีร'
  ),
  rule(
    ['hadith', 'hadeeth', 'ahadith', 'sunnah', 'bukhari', 'muslim', 'nawawi', 'nawawee',
     'arbaeen', "arba'een", 'forty hadith', 'jami', "jami'ul uloom", 'uloom wal-hikam',
     'compendium of knowledge', 'muhaddith', 'mustalah', 'sahih'],
    ['หะดีษ', 'หะดิษ', 'ซุนนะฮ', 'ริยาดุซศอลิฮีน', 'ริยาฎุซ', 'บุคอรี', 'ญามิอุลอุลูม', 'มุศเฏาะละฮ', 'เศาะฮีฮ', 'الحديث', 'الأثر', 'مصطلح', 'السنة المطهرة', 'المنتقى'],
    'หะดีษและซุนนะฮฺ'
  ),
  rule(
    ['fiqh', 'salah', 'salat', 'prayer', 'zakat', 'fasting', 'sawm', 'siyam', 'hajj', 'umrah',
     'purification', 'taharah', 'ablution', 'wudu', 'janazah', 'funeral', 'halal', 'haram',
     'riba', 'transaction', 'worship', 'ramadan', 'ramadhan', 'dhul-hijjah', 'eid',
     'menstruation', 'inheritance', 'bidayatul-mujtahid', 'bidayat al-mujtahid',
     'rulings related', 'music and singing', 'takaful'],
    ['ฟิกฮ', 'นมาซ', 'ละหมาด', 'ซะกาต', 'ศีลอด', 'ถือศีลอด', 'ฮัจญ', 'อุมเราะฮ', 'ญะนาซะฮ',
     'ทำศพ', 'คนตาย', 'ฮาลาล', 'หะรอม', 'ริบา', 'มุอามะลาต', 'อิบาดะฮ', 'ร่อมะฎอน',
     'เราะมะฎอน', 'ชะอฺบาน', 'อีดิ้ล', 'มรดกและพินัยกรรม', 'กฎหมายอิสลาม', 'ตะกาฟุล',
     'ดนตรีและการขับร้อง', 'การดูเดือน', 'ซื้อขาย', 'มัซฮับ', 'รอมฎอน', 'الصلاة', 'الصيام', 'الزكاة', 'الحج', 'الطهارة'],
    'ฟิกฮฺและอิบาดะฮฺ'
  ),
  rule(
    ['tazkiyah', 'tarbiyah', 'purification of the soul', 'akhlaq', 'akhlaaq', 'manners',
     'etiquette', 'adab', 'dua', "du'aa", 'supplication', 'dhikr', 'adhkar', 'azkar',
     'heart soften', 'raqaiq', 'zuhd', 'patience', 'tawbah', 'repentance', 'desires',
     'journey to allah', 'path to guidance', 'wealth and status', 'servitude',
     'garden of the wise', 'rawdat al-uqala', 'righteous and ranks', 'daily routine',
     'trials of life', 'sincerity', 'ikhlas'],
    ['ตัซกียะฮ', 'ตัรบียะฮ', 'มารยาท', 'จริยธรรม', 'อะดับ', 'ดุอา', 'ดุอาอ', 'ซิกิร', 'ซิกร',
     'อัซการ', 'อดทน', 'เตาบะฮ', 'คลายทุกข์', 'นะศีหะฮ', 'มะการิมุลอัคลาก', 'นุ่มนวล', 'พฤติกรรมเรื้อรัง', 'ขัดเกลา', 'อิคลาศ', 'أذكار', 'الأذكار', 'الدعاء', 'الذكر', 'คำสั่งเสีย', 'คัดมาให้คิด', 'ความฝัน', 'أذكار', 'الدعاء', 'الذكر', 'คำสั่งเสีย', 'คัดมาให้คิด', 'ความฝัน'],
    'ตัซกียะฮฺและตัรบียะฮฺ'
  ),
  rule(
    ['seerah', 'sirah', 'history', 'historical', 'companions', 'sahabah', 'caliph', 'khulafa',
     'ibn taymiyyah biography', 'imaam ahmed', 'ibn hanbal'],
    ['ชีวประวัติ', 'ประวัติศาสตร์', 'ประวัติซ่อฮาบะฮ', 'ประวัติชัยค', 'ประวัติศอฮาบะฮ', 'มหาบุรุษ', 'เศาะฮาบะฮ', 'เศาะหาบะฮ', 'ค่อลีฟะฮ', 'วรรณคดีไทย', 'السيرة', 'จุดกำเนิดอิสลาม', 'เกียรติของเศาะฮาบะฮ'],
    'ชีวประวัติและประวัติศาสตร์'
  ),
  rule(
    ['student of knowledge', 'seeker of knowledge', 'seeking knowledge', 'talib al',
     'book of knowledge', 'characteristics of the scholars', 'arabic vocabulary',
     'arabic grammar', 'nahw', 'sarf', 'study', 'stressors'],
    ['ผู้แสวงหาความรู้', 'ฏอลิบุลอิลม', 'ฎอลิบุลอิลม', 'ตอลิบุลอิลม', 'วิชาความรู้', 'ไวยากรณ',
     'นักศึกษา', 'คุณค่าของความรู้'],
    'ผู้แสวงหาความรู้ (ฏอลิบุลอิลม์)'
  ),

  // ---------------- ชีวิตและสังคม ----------------
  rule(
    ['marriage', 'marriages', 'nikah', 'divorce', 'family', 'spouses', 'husband', 'wife',
     'parenting', 'parents', 'children', 'polygamy', 'islamic home', 'role models'],
    ['แต่งงาน', 'นิกาห', 'ครอบครัว', 'ครองรัก', 'ครองเรือน', 'สามี', 'ภรรยา', 'บุตร',
     'เลี้ยงลูก', 'เด็กแรกเกิด', 'ภรรยาหลายคน', 'บิดามารดา', 'بر الوالدين', 'الوالدين', 'الأسرة', 'النكاح'],
    'การแต่งงานและครอบครัว'
  ),
  rule(
    ['health', 'medicine', 'ruqyah', 'sihr', 'magic', 'evil eye', 'suicide', 'depression'],
    ['สุขภาพ', 'พลานามัย', 'รุกยะฮ', 'ไสยศาสตร', 'อาคม', 'ฆ่าตัวตาย'],
    'สุขภาพและพลานามัย'
  ),
  rule(
    ['women', 'woman', 'female', 'hijab', 'niqab', 'tabarruj', 'muslim woman', 'little sister'],
    ['สตรี', 'ผู้หญิง', 'ฮิญาบ', 'นิกอบ', 'ตะบัรรุจ'],
    'สตรีและอิสลาม'
  ),
  rule(
    ['education', 'school', 'curriculum', 'teaching'],
    ['การศึกษา', 'โรงเรียน', 'หลักสูตร', 'การเรียนการสอน'],
    'การศึกษา'
  ),
  rule(
    ['contemporary', 'modern issue', 'social media', 'technology', 'covid'],
    ['ประเด็นร่วมสมัย', 'โซเชียล', 'ปัญหาเยาวชน', 'ปัญหาชายหญิง', 'ยุคปัจจุบัน', 'ร่วมสมัย'],
    'ประเด็นร่วมสมัย'
  ),

  // ---------------- หัวข้ออื่นๆ ----------------
  rule(
    ['atheis', 'atheism', 'naturalism', 'materialism', 'darwin', 'evolution', 'scientism',
     'new atheism'],
    ['อเทวนิยม', 'ไม่มีพระเจ้า', 'พระเจ้ามีจริง', 'วิวัฒนาการ', 'บูชาวิทยาศาสตร'],
    'อเทวนิยมและลัทธิบูชาวิทยาศาสตร์'
  ),
  rule(
    ['terroris', 'extremis', 'takfir', 'takfeer', 'fanatism', 'fanaticism', 'suicide bombing',
     'isis', 'daesh', 'tamayyu'],
    ['ก่อการร้าย', 'สุดโต่ง', 'ตักฟีร', 'คลั่งศาสนา'],
    'ลัทธิสุดโต่งและการก่อการร้าย'
  ),
  rule(
    ['misconception', 'doubt', 'shubuhat', 'clarifying', 'response to', 'distortion',
     'consensus word'],
    ['ความเข้าใจผิด', 'ชุบฮาต', 'ชี้แจง', 'บิดเบือน', 'คลาดเคลื่อน', 'ใส่ไคล้', 'ข้อเท็จจริง'],
    'ความเข้าใจผิด'
  ),
  rule(
    ['christian', 'christianity', 'bible', 'buddhis', 'hindu', 'judaism', 'jewish',
     'comparative religion', 'other religions', 'origins of modern'],
    ['ศาสนาคริสต', 'ศาสนาพุทธ', 'ไบเบิล', 'มุฮัมหมัดในไบเบิล', 'พุทธศาสนา', 'ฮินดู', 'ยิว', 'ศาสนาต่างๆ', 'ศาสนาเปรียบเทียบ'],
    'ศาสนาต่างๆ'
  ),
  rule(
    ['liberal', 'secular', 'feminis', 'nationalis', 'democracy', 'ideolog', 'identity'],
    ['เสรีนิยม', 'ฆราวาส', 'สตรีนิยม', 'ประชาธิปไตย', 'อุดมการณ', 'ชาตินิยม'],
    'อุดมการณ์และการเคลื่อนไหว'
  ),
  rule(
    ['fatwa', 'fataawa', 'fatawa', 'questions', 'q&a', 'answers'],
    ['ฟัตวา', 'ถาม-ตอบ', 'ถามตอบ', 'ตอบปัญหา', 'คำถามเกี่ยวกับ', 'ปํญหาเกี่ยวกับ', 'ปัญหาเกี่ยวกับ'],
    'ถาม-ตอบ'
  ),
  rule(
    ['dawah', "da'wah", 'calling to allah', 'advice to the caller'],
    ['ดะอวะฮ', 'ดะอฺวะฮ', 'เผยแผ่'],
    'ผู้แสวงหาความรู้ (ฏอลิบุลอิลม์)'
  ),
];

/** A subject-matter match, or '' when nothing fits clearly. */
export function classifyCategory(text) {
  const cleaned = normaliseForMatch(text);
  for (const [re, category] of CATEGORY_RULES) {
    if (re.test(cleaned)) return category;
  }
  return '';
}
