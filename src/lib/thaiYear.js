/**
 * Buddhist-era to Common-era conversion.
 *
 * พ.ศ. runs 543 years ahead of ค.ศ. — nothing printed on a Thai title page
 * that is a 4-digit year in the 2100s or higher can be a Common-era year, so
 * a value that high is unambiguously พ.ศ. and safe to convert automatically.
 */
const BE_OFFSET = 543;
const BE_THRESHOLD = 2100;

export function looksLikeBE(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= BE_THRESHOLD;
}

/** Passes a ค.ศ. year through unchanged; converts anything that can only be พ.ศ. */
export function toCE(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return String(looksLikeBE(n) ? n - BE_OFFSET : n);
}
