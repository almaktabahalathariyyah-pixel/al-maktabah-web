import { arrayUnion, doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { asList } from './people';

/**
 * Every list the admin forms read, so a partially-written settings document
 * can never hand a caller `undefined` where it expects to call .some/.map.
 */
const EMPTY_SETTINGS = {
  categories: [],
  languages: [],
  types: [],
  authors: [],
  translators: [],
  publishers: [],
};

/** Normalises whatever is in Firestore into the shape above. */
function withDefaults(data) {
  const merged = { ...EMPTY_SETTINGS, ...(data || {}) };
  for (const key of Object.keys(EMPTY_SETTINGS)) {
    if (!Array.isArray(merged[key])) merged[key] = [];
  }
  return merged;
}

/**
 * Get dropdown settings (categories, languages, names…) from Firestore.
 * Missing or malformed keys come back as empty arrays.
 */
export async function getDropdownSettings() {
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'dropdowns'));
    return withDefaults(docSnap.exists() ? docSnap.data() : null);
  } catch (err) {
    console.error('Error fetching dropdown settings:', err);
    return withDefaults(null);
  }
}

/**
 * Where a category nobody filed by hand ends up. The same label the "ดึงจาก
 * หนังสือ" button uses, so both routes put a new category in one place rather
 * than two groups meaning the same thing.
 */
const AUTO_GROUP = 'นำเข้าจากหนังสือ';

/** The value of a language entry, whichever shape it was written in. */
const langValue = (entry) => String(entry?.value ?? entry ?? '').trim();

/** Every category value across every group. */
const categoryValues = (groups) =>
  groups.flatMap((group) => (group?.options || []).map((opt) => opt?.value)).filter(Boolean);

/**
 * Every category value paired with the group holding it.
 *
 * The manage-lists page edits categories as one flat list, because merging
 * two spellings of the same subject is the job and which group each sits in
 * is beside the point. This and `groupCategories` are the two halves of
 * flattening for editing and putting the structure back afterwards.
 */
export function categoryEntries(groups) {
  return (groups || []).flatMap((group) =>
    (group?.options || [])
      .map((opt) => opt?.value)
      .filter(Boolean)
      .map((value) => ({ value, group: group?.label || AUTO_GROUP }))
  );
}

/**
 * Rebuilds the group structure from an edited flat list, keeping every
 * category in the group it came from and sending anything new to the auto
 * group. A group left with nothing in it is dropped rather than kept as an
 * empty heading.
 */
export function groupCategories(groups, values, groupOf) {
  const labelOf = (group) => group?.label || AUTO_GROUP;

  const rebuilt = (groups || [])
    .map((group) => ({
      ...group,
      options: values
        .filter((value) => (groupOf.get(value) || AUTO_GROUP) === labelOf(group))
        .map((value) => ({ value, label: value })),
    }))
    .filter((group) => group.options.length > 0);

  const placed = new Set(rebuilt.flatMap((group) => group.options.map((opt) => opt.value)));
  const orphans = values.filter((value) => !placed.has(value));
  return orphans.length === 0 ? rebuilt : withCategories(rebuilt, orphans);
}

/** Adds categories to the auto group, creating it only if it is not there yet. */
function withCategories(groups, additions) {
  const options = additions.map((value) => ({ value, label: value }));
  const index = groups.findIndex((group) => group?.label === AUTO_GROUP);
  if (index === -1) return [...groups, { label: AUTO_GROUP, options }];

  const next = [...groups];
  next[index] = { ...next[index], options: [...(next[index].options || []), ...options] };
  return next;
}

/**
 * Files whatever a book just introduced — names, category, type, language —
 * into the dropdown lists, leaving everything already there untouched.
 *
 * A value typed into the book form used to live only on that book, so
 * /admin/names and the settings panel stayed empty until someone pressed
 * "ดึงจากหนังสือ" — a read of every book in the library — and then Save.
 * Each write site announces its new values here instead.
 *
 * Everything the caller passes is a plain string; the stored shapes differ and
 * that is this function's business, not the caller's:
 *
 *   names, types   flat arrays — `arrayUnion` merges them on the server, so no
 *                  read is needed and two tabs saving at once cannot clobber
 *                  each other.
 *   languages      `{value,label}` objects, and categories are GROUPS holding
 *   categories     options, so arrayUnion cannot reach inside them. These two
 *                  are re-read and written back whole — one extra document
 *                  read, and only when a genuinely new value showed up.
 *
 * Never let this sink a book that saved fine: the value is still on the book,
 * and the sync button remains as the way to recover it.
 */
export async function rememberDropdowns(values) {
  const flat = {};
  for (const key of ['authors', 'translators', 'publishers', 'types']) {
    const clean = asList(values?.[key]);
    if (clean.length > 0) flat[key] = clean;
  }
  const languages = asList(values?.languages);
  const categories = asList(values?.categories);

  if (Object.keys(flat).length === 0 && languages.length === 0 && categories.length === 0) {
    return true;
  }

  try {
    const payload = {};
    for (const [key, clean] of Object.entries(flat)) payload[key] = arrayUnion(...clean);

    if (languages.length > 0 || categories.length > 0) {
      // getDoc, NOT getDropdownSettings: that one answers a failed read with
      // empty arrays, and writing those back would erase the whole category
      // tree. Here a failed read throws, and the catch below writes nothing.
      const snap = await getDoc(doc(db, 'settings', 'dropdowns'));
      const current = withDefaults(snap.exists() ? snap.data() : null);

      const knownLangs = new Set(current.languages.map(langValue));
      const newLangs = languages.filter((value) => !knownLangs.has(value));
      if (newLangs.length > 0) {
        payload.languages = [
          ...current.languages,
          ...newLangs.map((value) => ({ value, label: value })),
        ];
      }

      const knownCats = new Set(categoryValues(current.categories));
      const newCats = categories.filter((value) => !knownCats.has(value));
      if (newCats.length > 0) payload.categories = withCategories(current.categories, newCats);
    }

    if (Object.keys(payload).length === 0) return true;

    await setDoc(doc(db, 'settings', 'dropdowns'), payload, { merge: true });
    return true;
  } catch (err) {
    console.error('Error remembering dropdown values:', err);
    return false;
  }
}

/**
 * Save dropdown settings to Firestore.
 */
export async function saveDropdownSettings(data) {
  try {
    await setDoc(doc(db, 'settings', 'dropdowns'), data, { merge: true });
    return true;
  } catch (err) {
    console.error('Error saving dropdown settings:', err);
    return false;
  }
}
