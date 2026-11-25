/**
 * Transliteration-tolerant search for Thai, Arabic, and English library queries.
 *
 * Readers searching an Islamic library rarely spell a scholar's name or Arabic
 * loanword the exact same way the catalogue does: "อุษัยมีน" vs "อุซัยมีน" vs
 * "Uthaymin", "หะดีษ" vs "ฮะดีษ", "ฟิกฮ์" vs "ฟิกฮฺ". Normalising both the
 * query and the haystack — plus expanding well-known scholar aliases — lets
 * any reasonable spelling find the canonical record.
 */

export function normalizeSearch(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    // Strip Latin combining diacritics (ā, ī, ū, ṣ, ḥ, ṭ, etc.) without touching Thai vowels.
    .replace(/[\u0300-\u036f]/g, '')
    // Strip Thai phinthu (ฺ) and thanthakhat (์) which vary wildly across transliterations.
    .replace(/[\u0E3A\u0E4C]/g, '')
    // Fold common Thai transliteration equivalents for Arabic consonants.
    .replace(/[ษศซ]/g, 'ส')
    .replace(/[ฎฏ]/g, 'ด')
    .replace(/[หฮ]/g, 'ฮ')
    .replace(/[ฆค]/g, 'ค')
    // Strip punctuation/hyphens/apostrophes into spaces.
    .replace(/[’'`"“”‘’\-–—_.,:;!?()[\]{}\\/|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Groups of equivalent terms across Thai and English transliterations.
 * If a query term matches any entry in a group, a haystack containing ANY
 * entry from that group counts as a match.
 */
const ALIAS_GROUPS = [
  ['uthaymin', 'uthaymeen', 'usaymin', 'อุษัยมีน', 'อุซัยมีน', 'อุไษมีน', 'อุไซมีน'],
  ['fawzan', 'fawzaan', 'เฟาซาน', 'ฟาวซาน'],
  ['albani', 'albaani', 'อัลบานี', 'อัลบานีย์', 'อัลบานีย'],
  ['ibn baz', 'bin baz', 'ibn baaz', 'bin baaz', 'บินบาซ', 'บิน บาซ', 'อิบนุบาซ', 'อิบนุ บาซ'],
  ['ibn taymiyyah', 'ibn taymiyah', 'taymiyyah', 'ตัยมียะฮ์', 'ตัยมียะฮ', 'ไตกียะฮ'],
  ['ibn al qayyim', 'ibn qayyim', 'qayyim', 'ก็อยยิม', 'กอยยิม'],
  ['ibn kathir', 'ibn katheer', 'กะซีร', 'กะษีร'],
  ['munajjid', 'มุนัจญิด', 'มุนัจญีด'],
  ['nawawi', 'nawawee', 'นะวาวี', 'นะวะวี', 'นะวาวีย์'],
  ['bukhari', 'bukhaari', 'บุคอรี', 'บุคอรีย์'],
  ['abdul wahhab', 'abdul-wahhab', 'อับดุลวะฮ์ฮาบ', 'อับดุลวะฮาบ', 'อับดิลวะฮาบ'],
  ['madkhali', 'rabee', 'ร่อบีอ', 'รอบีอ', 'มัดคอลี'],
  ['sadi', 'saadi', 'ซะอ์ดี', 'สะอ์ดี', 'ซะดี'],
  ['abbad', 'al-badr', 'อัลอับบาด', 'อับบาด'],
  ['ibn rajab', 'รอญับ', 'เราะญับ'],
  ['ajurri', 'อาญุรรี', 'อาญุรรีย์'],
  ['hadith', 'hadeeth', 'หะดีษ', 'ฮะดีษ', 'หะดิษ', 'ฮะดิษ'],
  ['fiqh', 'ฟิกฮ์', 'ฟิกฮฺ', 'ฟิกห'],
  ['aqidah', 'aqeedah', 'อะกีดะฮ์', 'อะกีดะฮฺ', 'อะกีดะห'],
  ['tawhid', 'tawheed', 'เตาฮีด', 'เตาฮีต'],
  ['tafsir', 'tafseer', 'ตัฟซีร', 'ตัฟสีร'],
  ['sunnah', 'ซุนนะฮ์', 'ซุนนะฮฺ', 'สุนนะฮ'],
  ['salafi', 'salafiyyah', 'ซะละฟี', 'สะละฟี', 'สลัฟ'],
  ['manhaj', 'มันฮัจญ์', 'มันฮัจ'],
  ['shia', 'shiite', 'ชีอะฮ์', 'ชีอะฮฺ', 'ชีอะห'],
  ['sufi', 'sufism', 'ซูฟี', 'ศูฟี'],
  ['ramadan', 'ramadhan', 'รอมฎอน', 'เราะมะฎอน', 'ร่อมะฎอน'],
  ['hijab', 'ฮิญาบ', 'หิญาบ'],
  ['dua', 'duaa', 'ดุอาอ์', 'ดุอาอฺ', 'ดุอา'],
];

const NORM_GROUPS = ALIAS_GROUPS.map((g) => g.map(normalizeSearch).filter(Boolean));

/** Returns normalised variants for a single query term (always includes the term itself). */
function expandTerm(normTerm) {
  if (!normTerm) return [];
  const variants = new Set([normTerm]);
  if (normTerm.length >= 3) {
    for (const group of NORM_GROUPS) {
      if (group.some((alias) => alias === normTerm || (normTerm.length >= 4 && alias.includes(normTerm)))) {
        for (const alias of group) variants.add(alias);
      }
    }
  }
  return [...variants];
}

/**
 * True when every whitespace-separated term in `queryText` matches `rawHaystack`
 * under transliteration-tolerant normalisation and scholar/topic aliases.
 */
export function matchesSearch(rawHaystack, queryText) {
  const normQuery = normalizeSearch(queryText);
  if (!normQuery) return true;
  const terms = normQuery.split(' ').filter(Boolean);
  if (terms.length === 0) return true;

  const normHaystack = normalizeSearch(rawHaystack);
  const compactHaystack = normHaystack.replace(/\s+/g, '');

  return terms.every((term) => {
    const variants = expandTerm(term);
    return variants.some((v) => {
      if (normHaystack.includes(v)) return true;
      const compact = v.replace(/\s+/g, '');
      return compact.length >= 3 && compactHaystack.includes(compact);
    });
  });
}

/** Single-value match helper for autocomplete suggestions. */
export function matchesSuggestion(value, queryText) {
  return matchesSearch(value, queryText);
}
