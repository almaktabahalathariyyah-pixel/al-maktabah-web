/**
 * Tells a person's name apart from the debris a PDF hands over in its place.
 *
 * Every book read by the enrich pass contributes its embedded Author field to
 * the shared name lists, and that field is very often not an author: it is
 * whoever's Windows account made the file, the software that made it, or a
 * fragment of a sentence the text layer happened to return. The author list
 * had grown roughly a fifth junk that way — "win10", "Lenovo", "aykh",
 * "the most humiliated of nations" — which is what the reader scrolls past in
 * the person rail on the shelf.
 *
 * Used in two places, deliberately with the same rules: at intake, to keep a
 * bad value out of the list in the first place, and on the names page, to
 * surface what already got in FOR REVIEW. Nothing here ever deletes on its
 * own — a heuristic this blunt will occasionally be wrong about a real name,
 * so the owner is always the one who decides.
 */

/** The machine or account that produced the file, not a person. */
const DEVICE_OR_ACCOUNT =
  /^(?:admin(?:istrator)?|user|owner|guest|default|test|win\d*|windows|pc|desktop|laptop|home|lenovo|dell|hp|asus|acer|toshiba|samsung|msi|compaq|sharp|brother|canon|epson|ricoh|xerox|kyocera|sony|apple|macbook|mac)$/i;

/** The program that wrote the PDF. */
const SOFTWARE =
  /acrobat|adobe|microsoft|powerpoint|excel|\bword\b|\bpdf\b|scanner|scansnap|foxit|nitro|pdfelement|libreoffice|openoffice|ghostscript|latex|quark|indesign|photoshop|unknown|untitled/i;

/**
 * English function words. A byline is a name; a name does not contain "is" or
 * "the", so a value that does is a run of prose the byline pattern grabbed by
 * mistake. Only applied to Latin script — Thai has no equivalent giveaway.
 */
const PROSE = /\b(?:is|are|was|were|the|and|of|for|with|that|this|his|her|their|from|about|over|by|number)\b/i;

/**
 * Why this value is not a usable name, or null when it looks like one.
 * The reason is what the names page shows beside each flagged entry.
 */
export function nameProblem(value) {
  const v = String(value ?? '').trim();

  if (v.length < 2) return 'สั้นเกินไป';
  if (v.length > 60) return 'ยาวเกินกว่าจะเป็นชื่อ';
  if (/^[\d\s.\-_]+$/.test(v)) return 'มีแต่ตัวเลข';
  if (DEVICE_OR_ACCOUNT.test(v)) return 'ชื่อเครื่อง/บัญชีคอมพิวเตอร์';
  if (SOFTWARE.test(v)) return 'ชื่อโปรแกรม';

  const isLatin = /^[A-Za-z]/.test(v);
  // A name nobody capitalised is almost always a fragment the text layer
  // produced rather than a byline a person typed.
  if (isLatin && /^[a-z][a-z\s'’.-]*$/.test(v)) return 'ไม่ได้ขึ้นต้นด้วยตัวพิมพ์ใหญ่';
  if (isLatin && PROSE.test(v)) return 'เป็นประโยค ไม่ใช่ชื่อ';

  // Stray single letters are how a broken text layer renders a name it split
  // mid-word ("A bu S ukeiaii"). An initial is written "J." — with the stop —
  // so only bare ones count, and one alone is too common to judge.
  if (isLatin && (v.match(/(?:^|\s)[A-Za-z](?=\s)/g) || []).length >= 2) {
    return 'ตัวอักษรกระจัดกระจาย น่าจะอ่านไฟล์ผิด';
  }

  return null;
}

/** Convenience for the intake path, which only cares yes/no. */
export const looksLikeName = (value) => nameProblem(value) === null;
