/**
 * One book, several people.
 *
 * A title can have two authors, or a translator and a reviser, and until now
 * `author` and `translator` each held a single string. They now hold EITHER —
 * a string on the 365 books written before this, an array on anything saved
 * since — and every read goes through `asList` instead of touching the field.
 *
 * Both shapes are supported rather than migrated on purpose. Nothing queries
 * these fields in Firestore (every filter and search on this site runs client
 * side over books already in memory), so an array costs no index and no
 * rewrite, and rewriting 365 documents to gain nothing is 365 writes off a
 * free-tier budget. A book converts itself the next time it is saved.
 */

/** Anything → a clean array of names. The one function every read site uses. */
export function asList(value) {
  if (value === undefined || value === null) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .map((item) => String(item ?? '').trim())
    .filter((item) => item !== '' && item !== '-');
}

/** For a heading or a card: "อบู ฟาฏิมะฮ์ · อะบู อิยาฎ". */
export function joinPeople(value, separator = ' · ') {
  return asList(value).join(separator);
}

/** Where only one name fits — the cover art, a Telegram caption. */
export function firstPerson(value) {
  return asList(value)[0] || '';
}

/** Does this book credit that person, in a field that may hold one or many? */
export function hasPerson(value, name) {
  if (!name) return false;
  return asList(value).includes(name);
}

/**
 * Free text → a list of names.
 *
 * Semicolon, pipe and newline separate; a plain comma does NOT, because Thai
 * and Arabic names carry commas of their own ("อะบู อุมัยร์ ฮานี, อะบู อุบัยดะฮ์"
 * is how one of the existing books is already written) and splitting on it
 * would quietly cut real names in half.
 */
export function splitPeople(text) {
  return asList(String(text ?? '').split(/[;|\n]+/));
}

/** The inverse, for a CSV export or a text input. */
export function joinForInput(value) {
  return asList(value).join('; ');
}

/**
 * Normalises what the form hands back before it is written.
 * Multi fields always store an array, so a book saved twice does not flip
 * between shapes.
 */
export function toStoredList(value) {
  return asList(value);
}
