import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export function generateSlug(title) {
  if (!title) return 'book-' + Math.random().toString(36).substring(2, 8);
  
  const slug = title
    .trim()
    .toLowerCase()
    // Allow Thai characters (\u0E00-\u0E7F), English alphanumeric, spaces, and hyphens
    .replace(/[^\u0E00-\u0E7Fa-z0-9\s-]/g, '') 
    .replace(/[\s_]+/g, '-') // replace spaces and underscores with hyphen
    .replace(/-+/g, '-') // remove consecutive hyphens
    .replace(/^-+|-+$/g, ''); // trim hyphens from start and end
    
  return slug || 'book-' + Math.random().toString(36).substring(2, 8);
}

export async function getUniqueSlug(title) {
  const baseSlug = generateSlug(title);
  let slug = baseSlug;
  let counter = 1;
  
  while (true) {
    const docRef = doc(db, 'books', slug);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      return slug;
    }
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}
