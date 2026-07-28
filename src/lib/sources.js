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

/**
 * The kinds a source can be. `key` is what lands in Firestore, so these
 * strings are a stored contract — rename one and existing rows fall back to
 * OTHER_KIND rather than disappearing.
 *
 * `icon` names a lucide export, resolved on the rendering side; keeping the
 * component out of here lets a server component import this module.
 *
 * lucide dropped its brand glyphs, so YouTube and Facebook get the nearest
 * generic shape rather than a logo — every kind still reads as a distinct mark,
 * which is the point.
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

/** One document read. Returns [] when nothing is configured yet. */
export async function loadSources() {
  try {
    const snap = await getDoc(CONFIG_REF());
    return normalise(snap.exists() ? snap.data()?.items : null);
  } catch (error) {
    console.error('Failed to load sources:', error);
    return [];
  }
}

/** One document write for the whole list. */
export async function saveSources(items) {
  await setDoc(CONFIG_REF(), { items: normalise(items), updatedAt: new Date() });
}
