import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

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
