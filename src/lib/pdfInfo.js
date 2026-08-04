'use client';

/**
 * Best-effort book metadata read straight from a PDF the owner just picked,
 * so the single-book form starts half-filled instead of blank.
 *
 * Runs client-side on file selection, before any upload. Mirrors the
 * heuristics in scripts/extract-catalog.mjs and scripts/enrich-catalog.mjs
 * (which do the same job in bulk, offline, from pdftotext output) — same
 * scholar list, same byline patterns, same year logic — but reads pdf.js's
 * text layer directly since there is no shell around this page.
 *
 * Nothing here is authoritative. Every value is a guess the owner still
 * reviews; a wrong attribution on a religious text is worse than a blank
 * field, so this only ever fills fields that are still empty.
 *
 * A scanned book has pages but no selectable text, so pdf.js's text layer
 * comes back empty and every heuristic above has nothing to read. When that
 * happens this falls back to OCR (Tesseract.js, in the browser) on the title
 * page — much slower, only paid when the fast path truly found nothing.
 */

import { loadPdfjs } from './pdfCover';
import { toCE } from './thaiYear';

const PAGES_TO_SCAN = 6;
const MAX_TEXT_LENGTH = 8000;

// Scholars whose title pages this library actually prints — matching a name
// the page states is identification, not a guess.
const AUTHOR_PATTERNS = [
  [/ibn\s+taymiyy?ah|ابن تيمية|อิบนุ ตัยมียะฮ/i, 'Ibn Taymiyyah'],
  [/ibn\s+al[- ]?qayyim|ابن القيم|อิบนุ ก็อยยิม/i, 'Ibn al-Qayyim'],
  [/ibn\s+kathir|ابن كثير|อิบนุ กะษีร/i, 'Ibn Kathir'],
  [/(as|al)[- ]?sa'?di|السعدي|อัสสะอฺดีย/i, "Abdur-Rahman ibn Nasir as-Sa'di"],
  [/al[- ]?'?uthaym[ie]+n|العثيمين|อุษัยมีน/i, 'Muhammad ibn Salih al-Uthaymin'],
  [/ibn\s+baa?z|ابن باز|อิบนุ บาซ/i, 'Abdul-Aziz ibn Baz'],
  [/al[- ]?albani|الألباني|อัลบานีย/i, 'Muhammad Nasir-ud-Din al-Albani'],
  [/al[- ]?fawzan|الفوزان|เฟาซาน/i, 'Salih al-Fawzan'],
  [/rabee['’]?\s*(bin|ibn)?\s*haadee|ربيع|ร่อบีอฺ/i, "Rabee' ibn Hadi al-Madkhali"],
  [/an[- ]?nawaw[iy]|النووي|นะวะวี/i, 'Imam an-Nawawi'],
  [/muhammad\s+(ibn|bin)\s+abdul?[- ]?wahhab|محمد بن عبد الوهاب|อับดิลวะฮาบ/i, 'Muhammad ibn Abdul-Wahhab'],
  [/al[- ]?ajurr[iy]|الآجري|อัลอาญุรรีย/i, 'Al-Ajurri'],
  [/abdur[- ]?razzaq\s+al[- ]?badr|عبد الرزاق البدر/i, 'Abdur-Razzaq al-Badr'],
  [/zakir\s+naik|ซากิร\s*ไนค/i, 'Zakir Naik'],
  [/ดิเรก\s*กุลสิริสวัสดิ/i, 'ดิเรก กุลสิริสวัสดิ์'],
  [/อิสฮาก\s*พงษ์มณี/i, 'อิสฮาก พงษ์มณี'],
];

// Honorifics that precede a name rather than being part of it.
const TITLES = String.raw`(?:sh|shaykh|shaikh|sheikh|imam|imām|al[- ]?'?all[aā]{1,2}mah|ustadh|ust|dr|prof)\.?\s*`;

const AUTHOR_BYLINE_PATTERNS = [
  new RegExp(String.raw`ผู้เขียน\s*[:：]?\s*([฀-๿][฀-๿\s.'’-]{2,50})`),
  new RegExp(String.raw`เขียนโดย\s*(?:ชัยค์|เชค|ท่าน|อ\.|อาจารย์)?\s*([฀-๿][฀-๿\s.'’-]{2,50})`),
  new RegExp(String.raw`\bauthor\s*[:：]\s*([A-Z][\w'’\-]*(?:\s+[A-Z][\w'’\-]*){0,5})`, 'i'),
  new RegExp(String.raw`\bby\s+(?:${TITLES})?([A-Z][\w'’\-]*(?:\s+(?:bin|ibn|abu|abd[a-z]*|al|ad|ar|as|az|el|[A-Z][\w'’\-]*)){0,5})`, 'i'),
  new RegExp(String.raw`โดย\s*(?:ชัยค์|เชค|ท่าน|อ\.|อาจารย์)?\s*([฀-๿][฀-๿\s.'’-]{2,50})`),
  new RegExp(String.raw`\b(?:${TITLES})([A-Z'’][\w'’\-]*(?:\s+(?:bin|ibn|al|ad|ar|as|az|abu|abd[a-z]*|[A-Z][\w'’\-]*)){1,5})`),
];

const TRANSLATOR_BYLINE_PATTERNS = [
  new RegExp(String.raw`ผู้แปล\s*[:：]?\s*([฀-๿][฀-๿\s.'’-]{2,50})`),
  new RegExp(String.raw`แปลโดย\s*(?:ชัยค์|เชค|ท่าน|อ\.|อาจารย์)?\s*([฀-๿][฀-๿\s.'’-]{2,50})`),
  new RegExp(String.raw`เรียบเรียงโดย\s*(?:ชัยค์|เชค|ท่าน|อ\.|อาจารย์)?\s*([฀-๿][฀-๿\s.'’-]{2,50})`),
  new RegExp(String.raw`\btranslated\s+by\s+([A-Z][\w'’\-]*(?:\s+[A-Z][\w'’\-]*){0,5})`, 'i'),
];

// Words that show a capture is prose, not a name.
const NOT_A_NAME =
  /\b(this|that|these|those|work|means|decree|table|contents|publisher|publishers|rights|reserved|any|the\s+(noble|great))\b/i;

/** Cleans up a captured byline: strip separators, volume markers, extensions. */
function tidyName(raw) {
  return raw
    .replace(/[_]+/g, ' ')
    .replace(/\b(vol|volume|part|no)\b\.?\s*\d*/gi, '')
    .replace(/[\s,._-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function matchFirst(patterns, text) {
  for (const [re, value] of patterns) {
    if (re.test(text)) return value;
  }
  return '';
}

function extractByline(text, patterns) {
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) {
      const name = tidyName(m[1]);
      if (name.length < 3 || name.length > 60) continue;
      if (NOT_A_NAME.test(name)) continue;
      return name;
    }
  }
  return '';
}

/**
 * A publication year, only when the text states one — a labelled ค.ศ./พ.ศ.
 * year wins over a bare 4-digit number, which is as likely to be an ISBN
 * fragment or a page reference.
 */
function extractYear(text) {
  const labeledCE = text.match(/ค\.?\s*ศ\.?\s*(\d{3,4})/);
  if (labeledCE) return labeledCE[1];

  const labeledBE = text.match(/พ\.?\s*ศ\.?\s*(\d{3,4})/);
  if (labeledBE) return toCE(labeledBE[1]);

  const thisYear = new Date().getFullYear();
  const candidates = [...text.matchAll(/\b(1[0-9]{3}|2[0-9]{3})\b/g)].map((m) => Number(m[1]));
  for (const value of candidates) {
    if (value >= 1900 && value <= thisYear) return String(value);
    if (value >= 2500 && value <= 2600) return String(value - 543); // Buddhist era
  }
  return '';
}

function scriptCharCount(text) {
  const thai = (text.match(/[฀-๿]/g) || []).length;
  const arabic = (text.match(/[؀-ۿ]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return { thai, arabic, latin, total: thai + arabic + latin };
}

/** True once there is enough real text to say anything about it at all. */
function hasTextSignal(text) {
  return scriptCharCount(text).total >= 40;
}

/**
 * Which script dominates the text — counted, not just "contains", so a
 * bismillah on a Thai title page does not make the book Arabic. Mirrors
 * scripts/extract-catalog.mjs's detectLanguage, but with a higher signal
 * threshold: that version often has only a filename to go on, this one has
 * several pages of real text.
 */
function detectLanguage(text) {
  const { thai, arabic, latin, total } = scriptCharCount(text);
  if (total < 40) return '';

  if (thai / total > 0.25) return 'ไทย';
  if (arabic / total > 0.5) return 'อาหรับ';
  if (latin / total > 0.5) return 'อังกฤษ';
  return '';
}

// ------------------------------------------------------------------ OCR ----

const OCR_LANGS = ['eng', 'ara', 'tha'];
// Wide enough for Tesseract to read small print, not so wide that one page
// takes forever — this is already the slow path, run only when pdf.js's text
// layer came back empty (a scanned book, not a digitally-typeset one).
const OCR_SCALE_WIDTH = 1600;

let ocrWorkerPromise = null;

/**
 * One Tesseract worker, reused for every scanned book in a run. Spinning one
 * up costs real time and a few MB of downloaded language data (cached by the
 * browser after the first book) — paying that once per bulk pass is fine,
 * paying it once per book across a few hundred books is not.
 */
function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = import('tesseract.js').then(({ createWorker }) =>
      createWorker(OCR_LANGS)
    );
  }
  return ocrWorkerPromise;
}

/**
 * OCRs one pdf.js page and returns whatever text Tesseract finds.
 * Never throws — a page OCR can't read is just another empty result, same as
 * a page with no text layer at all.
 */
async function ocrPage(page) {
  const canvas = document.createElement('canvas');
  try {
    const worker = await getOcrWorker();
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: OCR_SCALE_WIDTH / base.width });

    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, canvas }).promise;

    const { data } = await worker.recognize(canvas);
    return data?.text || '';
  } catch (err) {
    console.warn('OCR failed for page', page?.pageNumber, err?.message || err);
    return '';
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Falls back to OCR when pdf.js found no real text layer to begin with — the
 * signature of a scanned book. Tries the title page first since that is
 * where author/translator/year usually live; only pays for a second page
 * when the first came back just as empty (a plain cover graphic, say).
 */
async function ocrFallbackText(doc) {
  let text = await ocrPage(await doc.getPage(1));
  if (!hasTextSignal(text) && doc.numPages > 1) {
    text += '\n' + (await ocrPage(await doc.getPage(2)));
  }
  return text;
}

/**
 * Reads `file`'s page count, embedded Author metadata, and (best-effort)
 * author, translator, language and publication year out of its first pages
 * of text.
 *
 * Never throws — a file pdf.js cannot parse comes back as all-empty, the
 * same as a file with nothing to find.
 */
export async function extractPdfInfo(file) {
  const result = { pages: 0, author: '', translator: '', year: '', language: '' };
  let doc = null;

  try {
    const lib = await loadPdfjs();
    const buffer = await file.arrayBuffer();

    doc = await lib.getDocument({
      data: buffer,
      disableFontFace: false,
      isEvalSupported: false,
    }).promise;

    result.pages = doc.numPages || 0;

    const meta = await doc.getMetadata().catch(() => null);
    const metaAuthor = meta?.info?.Author ? String(meta.info.Author).trim() : '';
    // Metadata is only trustworthy when it is a name, not a piece of software.
    if (metaAuthor && !/acrobat|adobe|word|pdf|scanner|unknown/i.test(metaAuthor)) {
      result.author = metaAuthor;
    }

    let text = '';
    const upto = Math.min(PAGES_TO_SCAN, doc.numPages || 0);
    for (let i = 1; i <= upto; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(' ') + '\n';
      if (text.length > MAX_TEXT_LENGTH) break;
    }
    text = text.slice(0, MAX_TEXT_LENGTH);

    // No selectable text at all means a scanned book — pdf.js's text layer
    // has nothing to give, so this is the only way to still find a language,
    // author, translator or year. Slow (several seconds), so it only runs
    // when the fast path truly found nothing.
    if (!hasTextSignal(text)) {
      const ocrText = await ocrFallbackText(doc);
      if (ocrText) text = ocrText.slice(0, MAX_TEXT_LENGTH);
    }

    if (!result.author) {
      result.author = matchFirst(AUTHOR_PATTERNS, text) || extractByline(text, AUTHOR_BYLINE_PATTERNS);
    }
    result.translator = extractByline(text, TRANSLATOR_BYLINE_PATTERNS);
    result.year = extractYear(text);
    result.language = detectLanguage(text);
  } catch (err) {
    console.warn('Could not read info from', file.name, err?.message || err);
  } finally {
    try {
      await doc?.destroy();
    } catch {
      /* already gone */
    }
  }

  return result;
}
