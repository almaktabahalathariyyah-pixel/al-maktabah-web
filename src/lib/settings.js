import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

/**
 * Get dropdown settings (categories and languages) from Firestore.
 * If they don't exist, returns empty arrays.
 */
export async function getDropdownSettings() {
  try {
    const docSnap = await getDoc(doc(db, 'settings', 'dropdowns'));
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return { categories: [], languages: [] };
  } catch (err) {
    console.error('Error fetching dropdown settings:', err);
    return { categories: [], languages: [] };
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
