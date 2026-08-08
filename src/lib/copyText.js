'use client';

/**
 * Puts text on the clipboard, by whichever route is actually available.
 *
 * `navigator.clipboard` is the right API and it is not always there:
 * it needs a secure context (so plain http, including a dev server reached by
 * LAN address, is out), and it can be refused outright by permission policy.
 * Observed while testing the share button — writeText threw NotAllowedError
 * and the reader got nothing but an error toast, with the link they asked for
 * nowhere on screen.
 *
 * So: the modern API first, then the deprecated execCommand path, which needs
 * no permission because it copies the current selection. Returns whether
 * anything worked, so the caller can say so honestly.
 */
export async function copyText(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through — a refusal here says nothing about execCommand.
    }
  }

  if (typeof document === 'undefined') return false;

  try {
    const field = document.createElement('textarea');
    field.value = text;
    // Off-screen but focusable, and readonly so a phone keyboard stays down.
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

export default copyText;
