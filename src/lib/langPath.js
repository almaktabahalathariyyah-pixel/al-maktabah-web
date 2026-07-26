/**
 * Maps a language name from the database (e.g. 'อาหรับ', 'English') 
 * to a short URL path segment (e.g. 'ar', 'en').
 * Defaults to 'th' if no match is found or if language is empty.
 */
export function getLangPath(language) {
  if (!language) return 'th';
  
  const langLower = String(language).toLowerCase().trim();
  
  // Arabic variations
  if (langLower.includes('อาหรับ') || langLower.includes('arabic') || langLower.includes('ar')) {
    return 'ar';
  }
  
  // English variations
  if (langLower.includes('อังกฤษ') || langLower.includes('english') || langLower.includes('en')) {
    return 'en';
  }
  
  // Urdu variations
  if (langLower.includes('อูรดู') || langLower.includes('urdu') || langLower.includes('ur')) {
    return 'ur';
  }
  
  // Persian variations
  if (langLower.includes('เปอร์เซีย') || langLower.includes('persian') || langLower.includes('fa')) {
    return 'fa';
  }
  
  // Default to Thai for anything else (or explicit Thai)
  return 'th';
}
