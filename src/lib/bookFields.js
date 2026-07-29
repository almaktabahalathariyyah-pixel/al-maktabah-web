import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { asList } from './people';

/**
 * The book metadata schema, and which parts of it readers can filter by.
 *
 * Kept in a SINGLE Firestore document (config/bookFields) so loading it
 * costs one read, not one per field. If the document does not exist yet
 * we fall back to these defaults and write nothing.
 *
 *   key      property name on a book document
 *   label    Thai label shown in the form and the filter rail
 *   type     'text' | 'select' | 'multi' | 'number' | 'textarea' | 'bool'
 *   form     show this field in the admin add/edit form
 *   filter   offer this field as a reader-facing filter
 *   locked   structural field the owner should not be able to remove
 *
 * 'multi' is 'select' that accepts several values and stores an array — a book
 * with two authors, or a translator and a reviser.
 */
export const DEFAULT_FIELDS = [
  { key: 'title',      label: 'ชื่อหนังสือ',   type: 'text',     form: true, filter: false, locked: true },
  { key: 'author',     label: 'ผู้แต่ง',        type: 'multi',    form: true, filter: true,  locked: true },
  { key: 'category',   label: 'หมวดหมู่',      type: 'select',   form: true, filter: true,  locked: true },
  { key: 'type',       label: 'ประเภท',        type: 'select',   form: true, filter: true },
  { key: 'translator', label: 'ผู้แปล',         type: 'multi',    form: true, filter: true },
  { key: 'publisher',  label: 'สำนักพิมพ์',    type: 'select',   form: true, filter: true },
  { key: 'year',       label: 'ปีพิมพ์',        type: 'select',   form: true, filter: true },
  { key: 'pages',      label: 'จำนวนหน้า',     type: 'number',   form: true, filter: false },
  { key: 'language',   label: 'ภาษา',          type: 'select',   form: true, filter: true },
  { key: 'description',label: 'คำอธิบาย',      type: 'textarea', form: true, filter: false },
];

const CONFIG_REF = () => doc(db, 'config', 'bookFields');

/**
 * Fields the schema promotes to 'multi' even if the saved config predates it.
 *
 * A config document written before multi-person support says these are plain
 * selects. Nothing would break, but the owner would have to go and flip both
 * by hand to get the feature they asked for, so the upgrade happens on read.
 * Setting either back to 'select' in the Fields panel sticks — the promotion
 * only fires on the type it replaced.
 */
const PROMOTE_TO_MULTI = new Set(['author', 'translator']);

/** One document read. Returns defaults when nothing is configured yet. */
export async function loadBookFields() {
  try {
    const snap = await getDoc(CONFIG_REF());
    const fields = snap.exists() ? snap.data()?.fields : null;
    if (Array.isArray(fields) && fields.length) {
      return fields.map((field) => (
        PROMOTE_TO_MULTI.has(field.key) && field.type === 'select'
          ? { ...field, type: 'multi' }
          : field
      ));
    }
  } catch (error) {
    console.error('Failed to load field config, using defaults:', error);
  }
  return DEFAULT_FIELDS;
}

/** One document write for the whole schema. */
export async function saveBookFields(fields) {
  await setDoc(CONFIG_REF(), { fields, updatedAt: new Date() });
}

/**
 * Distinct values for a field, taken from books already in memory.
 * Deriving facets client-side keeps the read count flat — no extra
 * queries per filter.
 */
export function facetValues(books, key) {
  const seen = new Map();
  for (const book of books) {
    // asList flattens the multi fields and still handles the single-value
    // ones, so a book with two authors counts once under each.
    for (const value of asList(book?.[key])) {
      seen.set(value, (seen.get(value) || 0) + 1);
    }
  }
  return [...seen.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'th'))
    .map(([value, count]) => ({ value, count }));
}
