'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, query, orderBy, writeBatch, updateDoc } from 'firebase/firestore';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import Link from 'next/link';
import { Search, Plus, Download, Edit2, Trash2, LayoutGrid, List, BookImage, UploadCloud, Filter, Mail, FileText, Sparkles } from 'lucide-react';
import { getLangPath } from '@/lib/langPath';
import { getDropdownSettings, rememberDropdowns } from '@/lib/settings';
import dynamic from 'next/dynamic';
const Select = dynamic(() => import('react-select'), { ssr: false });
import { selectStyles } from '@/lib/selectStyles';
import {
  loadGoogleScript,
  readSavedToken,
  clearSavedToken,
  connectDrive,
  deleteFromDrive,
  fetchDriveAccount,
  fetchDriveFileMeta,
  driveIdFrom,
  DELETE_REASONS,
} from '@/lib/googleDrive';
import { makeCover } from '@/lib/pdfCover';
import { extractPdfInfo } from '@/lib/pdfInfo';
import { canMirror, bookSizeBytes } from '@/lib/mirror';
import { useTabLock } from '@/lib/tabLock';
import { asList, joinPeople, hasPerson, splitPeople } from '@/lib/people';
import BookFormPanel from '@/components/BookFormPanel';
import BulkUploadPanel from '@/components/BulkUploadPanel';
import BookCover from '@/components/BookCover';
import styles from './page.module.css';
import { useAdmin } from '@/context/AdminContext';

const GOOGLE_PROMPT = `ยังไม่ได้เชื่อมต่อ Google Drive (หรือสิทธิ์หมดอายุแล้ว)
ถ้าลบเฉพาะในเว็บ ไฟล์ในไดรฟ์จะยังอยู่และยังกินพื้นที่อยู่`;

function pageWindow(current, total, span = 1) {
  const wanted = new Set([1, total]);
  for (let p = current - span; p <= current + span; p += 1) {
    if (p > 1 && p < total) wanted.add(p);
  }

  const sorted = [...wanted].sort((a, b) => a - b);
  const out = [];
  let previous = 0;

  for (const p of sorted) {
    if (p - previous === 2) out.push(previous + 1);
    else if (p - previous > 2) out.push(`gap-${p}`);
    out.push(p);
    previous = p;
  }
  return out;
}

/**
 * A book worth re-reading: it has a file, but is missing something the file
 * itself could answer.
 *
 * Year is deliberately not one of those things. Most of this library's scans
 * simply never printed a publication year — that is not a gap re-reading the
 * file can close, so counting it here meant hundreds of books stayed flagged
 * forever no matter how many times this ran. The enrich pass still fills year
 * whenever it does find one; it just stops being the reason a book is stuck
 * on the list.
 *
 * `enrichCheckedAt` is the other half of that: once a book's file has
 * actually been downloaded and read, it is done being asked about, even if
 * some fields stayed empty — re-reading the same bytes a second time cannot
 * find what was not there the first time. Without this, a book whose author
 * genuinely cannot be parsed out of its text would get re-downloaded and
 * re-OCR'd on every single run, forever, for nothing. The "กดเพื่อตรวจซ้ำ"
 * fallback in handleEnrichMissing is the deliberate way around this, for
 * when a file behind an existing link has actually changed.
 */
function needsEnrich(book) {
  return Boolean(book.driveUrl) && !book.enrichCheckedAt && (
    !book.coverUrl || !book.pages || !book.language || asList(book.author).length === 0
  );
}

function readInitialHealthFilter() {
  if (typeof window === 'undefined') return '';
  const health = new URLSearchParams(window.location.search).get('health');
  return ['nofile', 'telegram', 'unmirrored'].includes(health) ? health : '';
}

export default function AdminPage() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, ask } = useConfirm();
  /**
   * Both passes below walk the entire shelf and write to Firestore, which is
   * exactly what the bulk uploader and the Telegram mirror already hold a
   * lease for. Two admin tabs running these at once doubles every Drive
   * download, every OCR pass and every write — the last of which comes
   * straight out of a Spark-tier quota.
   */
  const { runExclusive: runShelfJob, busyElsewhere: shelfJobElsewhere } = useTabLock('shelf-scan');

  const [books, setBooks] = useState([]);
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [predefinedCategories, setPredefinedCategories] = useState([]);
  const [predefinedAuthors, setPredefinedAuthors] = useState([]);
  const [predefinedTranslators, setPredefinedTranslators] = useState([]);
  const [predefinedPublishers, setPredefinedPublishers] = useState([]);
  const [predefinedLanguages, setPredefinedLanguages] = useState([]);
  const [predefinedTypes, setPredefinedTypes] = useState([]);
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'card' | 'cover'

  // Form Panel State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [editingBookId, setEditingBookId] = useState(null);
  
  // Admin Context for Sidebar Auto-Collapse
  const { setIsSidebarOpen } = useAdmin();
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [translatorFilter, setTranslatorFilter] = useState('');
  const [publisherFilter, setPublisherFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [languageFilter, setLanguageFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // 'all', 'public', 'restricted'
  const [ownerFilter, setOwnerFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' = Newest first, 'asc' = Oldest first
  const [currentPage, setCurrentPage] = useState(1);
  // Set by the links on the stats page: 'nofile' | 'telegram' | ''
  const [healthFilter, setHealthFilter] = useState(readInitialHealthFilter);


  // Selection & Bulk Edit
  const [selectedBooks, setSelectedBooks] = useState(new Set());
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false);
  const [bulkValues, setBulkValues] = useState({ category: '', author: '', language: '', restricted: '' });
  const [submittingBulk, setSubmittingBulk] = useState(false);
  const [storingFileNames, setStoringFileNames] = useState(false);
  const [fileNameProgress, setFileNameProgress] = useState({ done: 0, total: 0 });
  const [enriching, setEnriching] = useState(false);
  const [enrichProgress, setEnrichProgress] = useState({ done: 0, total: 0 });
  const [enrichCurrent, setEnrichCurrent] = useState('');
  // Lets the "หยุด" click during a run reach the loop without re-running the effect.
  const enrichCancelled = useRef(false);

  const updateFilter = (setter, value) => {
    setter(value);
    setCurrentPage(1);
  };

  // The Google script is only needed when a delete touches Drive.
  useEffect(() => {
    loadGoogleScript();
  }, []);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/');
    }
  }, [isAdmin, authLoading, router]);

  useEffect(() => {
    const fetchBooks = async () => {
      try {
        const booksRef = collection(db, 'books');
        const q = query(booksRef, orderBy('createdAt', 'desc'));
        const [querySnapshot, settings] = await Promise.all([
          getDocs(q),
          getDropdownSettings()
        ]);
        
        const fetchedBooks = [];
        querySnapshot.forEach((doc) => {
          fetchedBooks.push({ id: doc.id, ...doc.data() });
        });
        setBooks(fetchedBooks);
        // Categories are saved as groups { label, options: [{value, label}] }
        const flatCategories = (settings.categories || []).reduce((acc, group) => {
          if (group.options) {
            acc.push(...group.options.map(o => o.value));
          }
          return acc;
        }, []);
        setPredefinedCategories(flatCategories);
        
        setPredefinedAuthors(settings.authors || []);
        setPredefinedTranslators(settings.translators || []);
        setPredefinedPublishers(settings.publishers || []);
        
        // Languages are saved as { value, label }
        const flatLanguages = (settings.languages || []).map(l => l.value || l);
        setPredefinedLanguages(flatLanguages);
        
        // Note: types might be in categories or hardcoded, fallback to dynamic if missing
        if (settings.types) setPredefinedTypes(settings.types);
      } catch (error) {
        console.error("Error fetching books:", error);
        toast.error('โหลดข้อมูลหนังสือไม่สำเร็จ');
      } finally {
        setLoadingBooks(false);
      }
    };
    
    if (isAdmin) {
      fetchBooks();
    }
  }, [isAdmin, toast]);

  const handleSelectBook = (id) => {
    const newSelected = new Set(selectedBooks);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedBooks(newSelected);
  };

  // Select-all applies to what is on screen, and only clears what is on
  // screen — a selection made under a different filter is not thrown away.
  const handleSelectAll = (e, currentList) => {
    const ids = currentList.map((b) => b.id);
    setSelectedBooks((prev) => {
      const next = new Set(prev);
      if (e.target.checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  /**
   * Ensures we hold a Drive token before a delete, asking for one if needed.
   *
   * Returns { proceed, token }. The old yes/no prompt had no way to back out:
   * dismissing it fell through to "delete site-side only", so a mis-click
   * still orphaned the file in Drive. Backing out is now its own answer.
   */
  const ensureDriveToken = async () => {
    const saved = readSavedToken();
    if (saved) return { proceed: true, token: saved.token };

    const answer = await ask({
      title: 'ยังไม่ได้เชื่อมต่อ Google Drive',
      message: GOOGLE_PROMPT,
      actions: [
        { key: 'connect', label: 'เชื่อมต่อไดรฟ์ก่อนลบ' },
        { key: 'site-only', label: 'ลบเฉพาะในเว็บ', tone: 'danger' },
      ],
    });

    if (answer === null) return { proceed: false, token: null };
    if (answer === 'site-only') return { proceed: true, token: null };

    try {
      const fresh = await connectDrive();
      return { proceed: true, token: fresh.token };
    } catch (err) {
      toast.error(err.message);
      return { proceed: false, token: null };
    }
  };

  /**
   * Removes the Drive copies for the given books and reports what happened.
   * Failures used to be swallowed entirely — which matters most when a file
   * lives in a different Google account than the one currently connected.
   */
  const removeDriveCopies = async (targets, token) => {
    const withFiles = targets.filter((b) => b?.driveUrl);
    if (!token || withFiles.length === 0) return;

    const failures = new Map();
    for (const book of withFiles) {
      const result = await deleteFromDrive(book.driveUrl, token);
      if (!result.ok) failures.set(result.reason, (failures.get(result.reason) || 0) + 1);
    }

    if (failures.size > 0) {
      const worst = [...failures.entries()].sort((a, b) => b[1] - a[1])[0];
      const count = [...failures.values()].reduce((a, b) => a + b, 0);
      toast.error(
        `ลบออกจากเว็บแล้ว แต่ไฟล์ใน Drive ${count} ไฟล์ลบไม่สำเร็จ — ${DELETE_REASONS[worst[0]] || worst[0]}`
      );
    }
  };

  const handleBulkDelete = async () => {
    if (selectedBooks.size === 0) return;

    const agreed = await confirm({
      title: `ลบหนังสือ ${selectedBooks.size} เล่ม?`,
      message: 'การลบนี้ย้อนกลับไม่ได้',
      confirmLabel: 'ลบทั้งหมด',
      tone: 'danger',
    });
    if (!agreed) return;

    const { proceed, token } = await ensureDriveToken();
    if (!proceed) return;

    const targets = books.filter((b) => selectedBooks.has(b.id));

    try {
      await removeDriveCopies(targets, token);

      const batch = writeBatch(db);
      targets.forEach((b) => batch.delete(doc(db, 'books', b.id)));
      await batch.commit();

      setBooks((prev) => prev.filter((b) => !selectedBooks.has(b.id)));
      setSelectedBooks(new Set());
      toast.success(`ลบหนังสือ ${targets.length} เล่มสำเร็จ`);
    } catch (err) {
      console.error(err);
      toast.error('ลบไม่สำเร็จ');
    }
  };

  const handleSingleDelete = async (id) => {
    const book = books.find((b) => b.id === id);

    const agreed = await confirm({
      title: 'ลบหนังสือเล่มนี้?',
      message: `“${book?.title || 'เล่มนี้'}” — การลบนี้ย้อนกลับไม่ได้`,
      confirmLabel: 'ลบเล่มนี้',
      tone: 'danger',
    });
    if (!agreed) return;

    let token = null;
    if (book?.driveUrl) {
      const drive = await ensureDriveToken();
      if (!drive.proceed) return;
      token = drive.token;
    }

    try {
      await removeDriveCopies([book], token);
      await deleteDoc(doc(db, 'books', id));

      setBooks((prev) => prev.filter((b) => b.id !== id));
      setSelectedBooks((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success('ลบหนังสือสำเร็จ');
    } catch (err) {
      console.error(err);
      toast.error('ลบไม่สำเร็จ');
    }
  };

  const handleOpenNewBook = () => {
    setEditingBookId(null);
    setIsFormOpen(true);
    // Auto-collapse sidebar to maximize workspace
    if (window.innerWidth > 900) {
      setIsSidebarOpen(false);
    }
  };

  const handleOpenEditBook = (id) => {
    setEditingBookId(id);
    setIsFormOpen(true);
  };

  const handleBookSaved = (savedBook) => {
    setBooks(prev => {
      const idx = prev.findIndex(b => b.id === savedBook.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...savedBook };
        return next;
      }
      return [savedBook, ...prev];
    });
  };

  const handleBulkUpdate = async (e) => {
    e.preventDefault();
    setSubmittingBulk(true);
    try {
      const batch = writeBatch(db);
      const updates = {};
      if (bulkValues.category) updates.category = bulkValues.category;
      // Stored as a list like every other write to this field. Semicolons let
      // one bulk edit set two authors at once.
      if (bulkValues.author) updates.author = splitPeople(bulkValues.author);
      if (bulkValues.language) updates.language = bulkValues.language;
      if (bulkValues.restricted !== '') updates.restricted = bulkValues.restricted === 'true';
      
      if (Object.keys(updates).length === 0) {
        setBulkEditModalOpen(false);
        setSubmittingBulk(false);
        return;
      }

      selectedBooks.forEach(id => {
        batch.update(doc(db, 'books', id), updates);
      });
      await batch.commit();

      // Same rule as the single-book form: what is set here joins the lists.
      // The two selects offer values harvested from the books as well as the
      // saved ones, so filter first — otherwise picking a category that is
      // already on the list would cost a read on every bulk edit.
      await rememberDropdowns({
        authors: (updates.author || []).filter((n) => !predefinedAuthors.includes(n)),
        categories: predefinedCategories.includes(updates.category) ? [] : updates.category,
        languages: predefinedLanguages.includes(updates.language) ? [] : updates.language,
      });

      setBooks(books.map(b => selectedBooks.has(b.id) ? { ...b, ...updates } : b));
      setSelectedBooks(new Set());
      setBulkEditModalOpen(false);
      setBulkValues({ category: '', author: '', language: '', restricted: '' });
      toast.success('แก้ไขข้อมูลสำเร็จ');
    } catch (err) {
      console.error(err);
      toast.error('แก้ไขไม่สำเร็จ');
    } finally {
      setSubmittingBulk(false);
    }
  };

  /**
   * Backfills `sourceFile` AND `driveOwner` from Drive.
   *
   * The owner half is the point: nothing ever wrote `driveOwner` for books
   * uploaded before that field existed, which is why the "บัญชี Google ที่เก็บไฟล์"
   * filter only ever listed "ยังไม่ได้บันทึกบัญชี". A book counts as done only
   * once BOTH are stored, and when everything is already stored the button
   * re-reads the whole shelf instead of sitting dead — that is the only way to
   * repair a name or an account that changed on the Drive side.
   *
   * Files in a second Google account answer 404 under the connected token, so
   * they are reported as skipped rather than failed: switch account, run again.
   */
  const handleStoreFileNames = () =>
    runShelfJob(runStoreFileNamesPass, () =>
      toast.error('มีการตรวจคลังทำงานอยู่ในอีกแท็บ — ปิดแท็บนั้น หรือรอให้เสร็จก่อน')
    );

  const runStoreFileNamesPass = async () => {
    const onDrive = books.filter((book) => book.driveUrl);
    if (onDrive.length === 0) {
      toast.info('ยังไม่มีเล่มที่เก็บไฟล์ไว้ใน Google Drive');
      return;
    }

    const missing = onDrive.filter((book) => !book.sourceFile || !book.driveOwner);
    const targets = missing.length > 0 ? missing : onDrive;

    setStoringFileNames(true);
    setFileNameProgress({ done: 0, total: targets.length });
    try {
      let saved = readSavedToken();
      if (!saved) {
        toast.info('กำลังเปิดหน้าต่างเชื่อมต่อ Google Drive');
        saved = await connectDrive();
      }

      // Drive omits `owners` on shared drives; the connected account stands in.
      const account = await fetchDriveAccount(saved.token);

      const updates = [];
      let skipped = 0;
      let otherAccount = 0;
      let expired = false;

      // Five at a time: 365 books one-after-another is a minute of staring at
      // a spinner, and Drive is happy to answer this many metadata reads.
      const BATCH = 5;
      for (let i = 0; i < targets.length && !expired; i += BATCH) {
        const slice = targets.slice(i, i + BATCH);
        const results = await Promise.all(
          slice.map((book) => fetchDriveFileMeta(book.driveUrl, saved.token, account?.email || ''))
        );

        results.forEach((result, index) => {
          const book = slice[index];
          if (!result.ok) {
            if (result.reason === 'expired') expired = true;
            else if (result.reason === 'other-account') otherAccount += 1;
            else skipped += 1;
            return;
          }
          const patch = {};
          if (result.name && result.name !== book.sourceFile) patch.sourceFile = result.name;
          if (result.owner && result.owner !== book.driveOwner) patch.driveOwner = result.owner;
          if (Object.keys(patch).length > 0) updates.push({ id: book.id, patch });
        });

        setFileNameProgress((prev) => ({ ...prev, done: Math.min(prev.total, i + slice.length) }));
      }

      // A write batch caps at 500 operations, and this shelf can exceed that.
      for (let i = 0; i < updates.length; i += 400) {
        const batch = writeBatch(db);
        updates.slice(i, i + 400).forEach((item) => batch.update(doc(db, 'books', item.id), item.patch));
        await batch.commit();
      }

      if (updates.length > 0) {
        const byId = new Map(updates.map((item) => [item.id, item.patch]));
        setBooks((prev) => prev.map((book) => (
          byId.has(book.id) ? { ...book, ...byId.get(book.id) } : book
        )));
      }

      if (expired) {
        clearSavedToken();
        toast.error('สิทธิ์ Google Drive หมดอายุ — กดปุ่มนี้อีกครั้งเพื่อเชื่อมต่อใหม่');
      } else if (otherAccount > 0) {
        toast.info(
          `บันทึกแล้ว ${updates.length} เล่ม · ข้าม ${otherAccount} เล่มที่อยู่ในบัญชี Google อื่น — สลับบัญชีแล้วกดอีกครั้ง`
        );
      } else if (skipped > 0) {
        toast.error(`บันทึกแล้ว ${updates.length} เล่ม, อ่านไม่ได้ ${skipped} เล่ม`);
      } else if (updates.length === 0) {
        toast.success('ข้อมูลชื่อไฟล์และบัญชีครบถ้วนแล้ว');
      } else {
        toast.success(`บันทึกชื่อไฟล์และบัญชี ${updates.length} เล่มสำเร็จ`);
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'เก็บชื่อไฟล์ไม่สำเร็จ');
    } finally {
      setStoringFileNames(false);
      setFileNameProgress({ done: 0, total: 0 });
    }
  };

  /**
   * Runs the same cover-render + text-scan the single-book form runs on one
   * file (src/lib/pdfCover.js, src/lib/pdfInfo.js) across every book that
   * already has a Drive file but is missing something that file could answer
   * — pages, author, year, language, or the cover itself.
   *
   * Sequential and slow on purpose: each book downloads its whole PDF and
   * renders it in this tab, unlike handleStoreFileNames above which is a
   * cheap metadata-only call Drive answers in bulk. A shelf of a few hundred
   * books legitimately takes minutes, hence the stop button.
   *
   * Only reads files this app uploaded — the drive.file scope cannot open
   * anything else without the owner picking it by hand in Google's own
   * picker, which is what the "เลือกไฟล์จาก Drive" button on the single-book
   * form is for. A book this loop can't open is reported, not retried.
   *
   * Never overwrites a field that already has a value. Every book whose file
   * was successfully read gets `enrichCheckedAt` stamped regardless of what
   * was found, so a normal run only ever looks at books it has not looked at
   * before — see needsEnrich. When nothing is left to check, this instead
   * re-reads every book with a file, ignoring that stamp.
   */
  const handleEnrichMissing = async () => {
    // Stopping a run in progress is this same button, and must not be gated
    // on a lease this tab already holds.
    if (enriching) {
      enrichCancelled.current = true;
      return;
    }
    runShelfJob(runEnrichPass, () =>
      toast.error('มีการตรวจคลังทำงานอยู่ในอีกแท็บ — ปิดแท็บนั้น หรือรอให้เสร็จก่อน')
    );
  };

  const runEnrichPass = async () => {
    let targets = books.filter(needsEnrich);

    // Nothing left unchecked. Re-reading the whole shelf is a legitimate thing
    // to want — a relinked file, a newly connected Drive account — but it is
    // hours of downloading and OCR, and the button still reads "เติมข้อมูลที่
    // ขาด" with no count beside it. On a phone the explanatory tooltip cannot
    // be seen at all, so a mis-tap would silently start the most expensive job
    // in the app. Ask first.
    if (targets.length === 0) {
      const everything = books.filter((b) => Boolean(b.driveUrl));
      if (everything.length === 0) {
        toast.info('ยังไม่มีหนังสือที่มีไฟล์ให้ตรวจ');
        return;
      }
      const goAhead = await confirm({
        title: 'ตรวจซ้ำทั้งคลัง?',
        message:
          `ทุกเล่มถูกตรวจไปแล้ว การตรวจซ้ำจะดาวน์โหลดไฟล์ทั้ง ${everything.length} เล่มใหม่ทั้งหมด ` +
          'และใช้เวลานานมาก (เล่มที่เป็นภาพสแกนต้องอ่านตัวอักษรจากภาพทีละเล่ม) ' +
          'ทำเมื่อไฟล์ใน Drive เปลี่ยนไปจริงๆ เท่านั้น',
        confirmLabel: 'ตรวจซ้ำทั้งคลัง',
        tone: 'danger',
      });
      if (!goAhead) return;
      targets = everything;
    }

    enrichCancelled.current = false;
    setEnriching(true);
    setEnrichProgress({ done: 0, total: targets.length });

    let saved;
    try {
      saved = readSavedToken();
      if (!saved) {
        toast.info('กำลังเปิดหน้าต่างเชื่อมต่อ Google Drive');
        saved = await connectDrive();
      }
    } catch (err) {
      toast.error(err.message || 'เชื่อมต่อ Google Drive ไม่สำเร็จ');
      setEnriching(false);
      setEnrichProgress({ done: 0, total: 0 });
      return;
    }

    let updated = 0;
    let unreadable = 0;
    let expired = false;
    const seenAuthors = new Set();
    const seenTranslators = new Set();
    const filledCounts = { coverUrl: 0, pages: 0, year: 0, language: 0, author: 0, translator: 0 };

    for (let i = 0; i < targets.length; i += 1) {
      if (enrichCancelled.current || expired) break;
      const book = targets[i];
      setEnrichCurrent(book.title || book.id);

      try {
        const id = driveIdFrom(book.driveUrl);
        const res = id
          ? await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {
              headers: { Authorization: `Bearer ${saved.token}` },
            })
          : null;

        // 401 is OUR token expiring — every remaining book would fail the same
        // way, so stop rather than burn through the shelf marking it unreadable.
        if (res?.status === 401) { expired = true; break; }

        if (!res || !res.ok) {
          unreadable += 1;
          // 403/404 means this file belongs to a different Google account (or
          // is gone). That is permanent as far as the connected token is
          // concerned, so stamp it and stop asking — otherwise these books
          // sit in the queue being re-attempted on every single run forever,
          // which is the exact waste enrichCheckedAt exists to end. Anything
          // else (a timeout, a 5xx) is left unstamped so it retries.
          if (res && (res.status === 403 || res.status === 404)) {
            const stamp = { enrichCheckedAt: new Date() };
            await updateDoc(doc(db, 'books', book.id), stamp);
            setBooks((prev) => prev.map((b) => (b.id === book.id ? { ...b, ...stamp } : b)));
          }
          continue;
        }

        const blob = await res.blob();
        const file = new File([blob], book.sourceFile || 'book.pdf', { type: 'application/pdf' });

        const patch = {};

        if (!book.coverUrl) {
          const idToken = await user.getIdToken();
          const cover = await makeCover(file, { idToken });
          if (cover.url) patch.coverUrl = cover.url;
        }

        const info = await extractPdfInfo(file);
        if (info.pages && !book.pages) patch.pages = info.pages;
        if (info.year && !book.year) patch.year = info.year;
        if (info.language && !book.language) patch.language = info.language;
        if (info.author && asList(book.author).length === 0) {
          patch.author = [info.author];
          seenAuthors.add(info.author);
        }
        if (info.translator && asList(book.translator).length === 0) {
          patch.translator = [info.translator];
          seenTranslators.add(info.translator);
        }

        // Whatever this pass found is everything this file has to give — a
        // future run gains nothing by re-downloading and re-OCRing it, so it
        // is marked read regardless of whether anything above was empty.
        const hadRealPatch = Object.keys(patch).length > 0;
        patch.enrichCheckedAt = new Date();

        await updateDoc(doc(db, 'books', book.id), patch);
        setBooks((prev) => prev.map((b) => (b.id === book.id ? { ...b, ...patch } : b)));
        if (hadRealPatch) {
          updated += 1;
          for (const key of Object.keys(patch)) {
            if (key in filledCounts) filledCounts[key] += 1;
          }
        }
      } catch (err) {
        console.error('Enrich failed for', book.id, err);
        unreadable += 1;
      } finally {
        setEnrichProgress((prev) => ({ ...prev, done: i + 1 }));
      }

      // A small gap between books — the same courtesy delay the bulk uploader uses.
      await new Promise((r) => setTimeout(r, 400));
    }

    if (seenAuthors.size > 0 || seenTranslators.size > 0) {
      await rememberDropdowns({ authors: [...seenAuthors], translators: [...seenTranslators] });
    }

    const FIELD_LABELS = {
      coverUrl: 'ปก', pages: 'หน้า', year: 'ปี', language: 'ภาษา', author: 'ผู้แต่ง', translator: 'ผู้แปล',
    };
    const breakdown = Object.entries(filledCounts)
      .filter(([, n]) => n > 0)
      .map(([key, n]) => `${FIELD_LABELS[key]} ${n}`)
      .join(' · ');

    if (expired) {
      clearSavedToken();
      toast.error('สิทธิ์ Google Drive หมดอายุ — กดปุ่มนี้อีกครั้งเพื่อเชื่อมต่อใหม่');
    } else if (enrichCancelled.current) {
      toast.info(`หยุดแล้ว — เติมข้อมูลไปแล้ว ${updated} เล่ม` + (breakdown ? ` (${breakdown})` : ''));
    } else if (updated === 0) {
      toast.info(
        unreadable > 0
          ? `อ่านไฟล์ไม่ได้ ${unreadable} เล่ม — ไฟล์เหล่านั้นน่าจะไม่ได้อัปโหลดผ่านเว็บนี้ ใช้ "เลือกไฟล์จาก Drive" ในหน้าแก้ไขเล่มนั้นแทน`
          : 'ไม่มีอะไรให้เติมเพิ่ม'
      );
    } else {
      toast.success(
        `เติมข้อมูลสำเร็จ ${updated} เล่ม` +
        (breakdown ? ` (${breakdown})` : '') +
        (unreadable > 0 ? ` · อ่านไม่ได้ ${unreadable} เล่ม (ไฟล์จากที่อื่น)` : '')
      );
    }

    setEnriching(false);
    setEnrichProgress({ done: 0, total: 0 });
    setEnrichCurrent('');
  };

  if (authLoading || loadingBooks) {
    return <div className="container" style={{paddingTop: '4rem'}}>กำลังตรวจสอบสิทธิ์...</div>;
  }

  if (!isAdmin) {
    return null;
  }

  const categories = Array.from(new Set([...predefinedCategories, ...books.map(b => b.category).filter(Boolean)])).sort();
  // flatMap, not map: a book crediting two authors offers both to the filter.
  const authors = Array.from(new Set([...predefinedAuthors, ...books.flatMap(b => asList(b.author))])).sort();
  const translators = Array.from(new Set([...predefinedTranslators, ...books.flatMap(b => asList(b.translator))])).sort();
  const publishers = Array.from(new Set([...predefinedPublishers, ...books.map(b => b.publisher).filter(Boolean)])).sort();
  const languages = Array.from(new Set([...predefinedLanguages, ...books.map(b => b.language).filter(Boolean)])).sort();
  const types = Array.from(new Set([...predefinedTypes, ...books.map(b => b.type).filter(Boolean)])).sort();
  const years = Array.from(new Set(books.map(b => b.year).filter(Boolean))).sort((a, b) => b - a);
  const owners = Array.from(new Set(books.map(b => b.driveOwner).filter(Boolean))).sort();

  const filteredBooks = books.filter(book => {
    const needle = searchQuery.toLowerCase();
    const matchesSearch =
      book.title?.toLowerCase().includes(needle) ||
      joinPeople(book.author, ' ').toLowerCase().includes(needle);
    const matchesCat = categoryFilter ? book.category === categoryFilter : true;
    const matchesAuthor = authorFilter ? hasPerson(book.author, authorFilter) : true;
    const matchesTranslator = translatorFilter ? hasPerson(book.translator, translatorFilter) : true;
    const matchesPublisher = publisherFilter ? book.publisher === publisherFilter : true;
    const matchesLanguage = languageFilter ? book.language === languageFilter : true;
    const matchesType = typeFilter ? book.type === typeFilter : true;
    const matchesYear = yearFilter ? String(book.year) === yearFilter : true;
    const matchesStatus = statusFilter === 'restricted' ? book.restricted : statusFilter === 'public' ? !book.restricted : true;
    // '__none__' finds the books uploaded before the account was recorded.
    const matchesOwner = ownerFilter
      ? ownerFilter === '__none__' ? !book.driveOwner : book.driveOwner === ownerFilter
      : true;

    const hasAnyFile = book.driveUrl || book.telegramFileId || book.telegramUrl;
    const matchesHealth =
      healthFilter === 'nofile' ? !hasAnyFile
      : healthFilter === 'telegram' ? !book.driveUrl && (book.telegramFileId || book.telegramUrl)
      : healthFilter === 'unmirrored' ? book.driveUrl && !book.telegramFileId && canMirror(bookSizeBytes(book))
      : true;

    return matchesSearch && matchesCat && matchesAuthor && matchesTranslator && matchesPublisher && matchesLanguage && matchesType && matchesYear && matchesStatus && matchesOwner && matchesHealth;
  });

  // Sort the filtered books based on sortOrder (books array is already 'desc' by default)
  let sortedBooks = [...filteredBooks];
  if (sortOrder === 'asc') {
    sortedBooks.reverse();
  }

  // Pagination logic
  const PAGE_SIZE = 20;
  const pageCount = Math.max(1, Math.ceil(sortedBooks.length / PAGE_SIZE));
  const current = Math.min(currentPage, pageCount);
  const shownBooks = sortedBooks.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const totalBooks = books.length;
  const restrictedCount = books.filter(b => b.restricted).length;
  const publicCount = totalBooks - restrictedCount;
  const driveBookCount = books.filter((book) => book.driveUrl).length;
  const missingMetaCount = books.filter(
    (book) => book.driveUrl && (!book.sourceFile || !book.driveOwner)
  ).length;
  const fileNameButtonLabel = storingFileNames
    ? `กำลังอ่าน ${fileNameProgress.done}/${fileNameProgress.total}`
    : `เก็บชื่อไฟล์${missingMetaCount > 0 ? ` (${missingMetaCount})` : ''}`;
  const fileNameButtonHint = missingMetaCount > 0
    ? `ยังขาดชื่อไฟล์หรือบัญชี Google อยู่ ${missingMetaCount} เล่ม — กดเพื่อดึงจากไดรฟ์`
    : 'ข้อมูลครบแล้ว — กดเพื่อตรวจซ้ำทั้งคลัง';

  const enrichCount = books.filter(needsEnrich).length;
  const enrichButtonLabel = enriching
    ? `กำลังอ่าน ${enrichProgress.done}/${enrichProgress.total} — หยุด`
    : `เติมข้อมูลที่ขาด${enrichCount > 0 ? ` (${enrichCount})` : ''}`;
  const enrichButtonHint = enriching
    ? `กำลังอ่าน: ${enrichCurrent || '…'} — กดอีกครั้งเพื่อหยุดกลางคัน`
    : shelfJobElsewhere
    ? 'มีการตรวจคลังทำงานอยู่ในอีกแท็บ'
    : enrichCount > 0
      ? `มี ${enrichCount} เล่มที่ยังไม่เคยตรวจ และยังขาดปก/ผู้แต่ง/ภาษา ฯลฯ — กดเพื่อลองอ่านจากไฟล์ให้อัตโนมัติ`
      : 'ทุกเล่มที่มีไฟล์ถูกตรวจแล้ว — กดอีกครั้งเพื่อตรวจซ้ำทั้งคลัง';

  const allSelected =
    shownBooks.length > 0 && shownBooks.every((b) => selectedBooks.has(b.id));

  return (
    <div className="container">
      <header className={`${styles.header} rise`}>
        <p className="eyebrow">ผู้ดูแลระบบ</p>
        <h1 className={styles.title}>จัดการระบบ</h1>
        <p className="lede">
          จัดการหนังสือในคลัง และตรวจสอบสิทธิ์
        </p>
      </header>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{totalBooks}</div>
          <div className={styles.statLabel}>หนังสือทั้งหมด</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{publicCount}</div>
          <div className={styles.statLabel}>สาธารณะ</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue} style={{ color: 'var(--hot)' }}>{restrictedCount}</div>
          <div className={styles.statLabel}>สงวนสิทธิ์</div>
        </div>
      </div>

      {healthFilter && (
        <div className={styles.healthBanner}>
          <span>
            {healthFilter === 'nofile'
              ? 'กำลังแสดงเฉพาะเล่มที่ยังไม่มีไฟล์แนบเลย'
              : healthFilter === 'unmirrored'
                ? 'กำลังแสดงเฉพาะเล่มที่ยังไม่มีสำเนาสำรอง — เปิดเล่มนั้นแล้วกด "สำรองตอนนี้"'
                : 'กำลังแสดงเฉพาะเล่มที่มีแต่ไฟล์ Telegram (เล่มใหญ่กว่า 20MB จะเปิดไม่ได้)'}
          </span>
          <button className="btn" onClick={() => updateFilter(setHealthFilter, '')}>แสดงทั้งหมด</button>
        </div>
      )}

      {enriching && (
        <div className={`${styles.healthBanner} ${styles.enrichBanner}`}>
          <div className={styles.enrichBannerTop}>
            <span>
              กำลังอ่าน {enrichProgress.done}/{enrichProgress.total} — {enrichCurrent || '…'}
            </span>
            <button className="btn" onClick={handleEnrichMissing}>หยุด</button>
          </div>
          <div className={styles.enrichTrack}>
            <div
              className={styles.enrichFill}
              style={{
                width: `${enrichProgress.total > 0 ? Math.round((enrichProgress.done / enrichProgress.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      <div className={styles.filterBar}>
        <div className={styles.filterTopRow}>
          <div className={styles.searchTools}>
            <div className={styles.searchWrap}>
              <input 
                type="text" 
                placeholder="ค้นหาชื่อ หรือผู้แต่ง..."
                value={searchQuery}
                onChange={(e) => updateFilter(setSearchQuery, e.target.value)}
                className={styles.searchInput}
              />
              <Search className={styles.searchIcon} size={18} />
            </div>
            
            <button 
              className={`btn ${showFilters ? 'btn-solid' : ''}`} 
              onClick={() => setShowFilters(!showFilters)}
              title="ตัวกรอง"
            >
              <Filter size={18} /> <span className={styles.hideMobile}>ตัวกรอง {(categoryFilter || statusFilter || sortOrder !== 'desc') && '•'}</span>
            </button>
          </div>
          
          <div className={styles.actionButtons}>
            <div className={styles.viewToggle}>
              <button 
                className={`${styles.viewBtn} ${viewMode === 'table' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('table')}
                title="มุมมองตาราง"
              >
                <List size={18} />
              </button>
              <button
                className={`${styles.viewBtn} ${viewMode === 'card' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('card')}
                title="มุมมองการ์ด"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                className={`${styles.viewBtn} ${viewMode === 'cover' ? styles.viewBtnActive : ''}`}
                onClick={() => setViewMode('cover')}
                title="มุมมองปกหนังสือ"
              >
                <BookImage size={18} />
              </button>
            </div>
            {/* Below 600px these keep the glyph and drop the words. Three Thai
                labels cannot share a phone's width without breaking mid-word,
                and a button whose label has broken is worse than no label —
                the tooltip and aria-label carry the meaning instead. */}
            <button
              onClick={handleStoreFileNames}
              className={`btn ${styles.fileNameBtn}`}
              disabled={storingFileNames || enriching || shelfJobElsewhere || driveBookCount === 0}
              title={fileNameButtonHint}
              aria-label={fileNameButtonLabel}
            >
              <FileText size={18} />
              <span className={styles.hideMobile}>{fileNameButtonLabel}</span>
              {/* A 365-book run is long enough that the phone needs the count
                  too, even once the label is gone. */}
              {storingFileNames && (
                <span className={styles.mobileOnly}>
                  {fileNameProgress.done}/{fileNameProgress.total}
                </span>
              )}
            </button>
            <button
              onClick={handleEnrichMissing}
              className={`btn ${styles.fileNameBtn}`}
              // Never disabled while THIS tab is running: the same button is
              // the stop control.
              disabled={
                !enriching &&
                (storingFileNames || shelfJobElsewhere || driveBookCount === 0)
              }
              title={enrichButtonHint}
              aria-label={enrichButtonLabel}
            >
              <Sparkles size={18} />
              <span className={styles.hideMobile}>{enrichButtonLabel}</span>
              {enriching && (
                <span className={styles.mobileOnly}>
                  {enrichProgress.done}/{enrichProgress.total}
                </span>
              )}
            </button>
            <button
              onClick={() => setIsBulkUploadOpen(true)}
              className={`btn btn-solid ${styles.hotBtn}`}
              title="อัปโหลดหลายเล่ม"
              aria-label="อัปโหลดหลายเล่ม"
            >
              <UploadCloud size={18} /> <span className={styles.hideMobile}>อัปโหลดหลายเล่ม</span>
            </button>
            <button
              onClick={handleOpenNewBook}
              className="btn btn-solid"
              title="เพิ่มหนังสือ"
              aria-label="เพิ่มหนังสือ"
            >
              <Plus size={18} /> <span className={styles.hideMobile}>เพิ่มหนังสือ</span>
            </button>
          </div>
        </div>

        {showFilters && (
          <div className={styles.filterBottomRow}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>เรียงลำดับ</label>
              <Select instanceId={"select-1"} styles={selectStyles}
                options={[
                  { value: 'desc', label: 'ใหม่ไปเก่า' },
                  { value: 'asc', label: 'เก่าไปใหม่' }
                ]}
                value={{ value: sortOrder, label: sortOrder === 'asc' ? 'เก่าไปใหม่' : 'ใหม่ไปเก่า' }}
                onChange={(selected) => updateFilter(setSortOrder, selected ? selected.value : 'desc')}
                isSearchable={false}
                classNamePrefix="react-select"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>หมวดหมู่</label>
              <Select instanceId={"select-2"} styles={selectStyles}
                options={[{ value: '', label: 'ทั้งหมด' }, ...categories.map(c => ({ value: c, label: c }))]}
                value={{ value: categoryFilter, label: categoryFilter || 'ทั้งหมด' }}
                onChange={(selected) => updateFilter(setCategoryFilter, selected ? selected.value : '')}
                placeholder="ทั้งหมด"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>ประเภท</label>
              <Select instanceId={"select-3"} styles={selectStyles}
                options={[{ value: '', label: 'ทั้งหมด' }, ...types.map(c => ({ value: c, label: c }))]}
                value={{ value: typeFilter, label: typeFilter || 'ทั้งหมด' }}
                onChange={(selected) => updateFilter(setTypeFilter, selected ? selected.value : '')}
                placeholder="ทั้งหมด"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>สถานะ</label>
              <Select instanceId={"select-4"} styles={selectStyles}
                options={[
                  { value: '', label: 'ทั้งหมด' },
                  { value: 'public', label: 'สาธารณะ' },
                  { value: 'restricted', label: 'สงวนสิทธิ์' }
                ]}
                value={{ value: statusFilter, label: statusFilter === 'public' ? 'สาธารณะ' : statusFilter === 'restricted' ? 'สงวนสิทธิ์' : 'ทั้งหมด' }}
                onChange={(selected) => updateFilter(setStatusFilter, selected ? selected.value : '')}
                placeholder="ทั้งหมด"
                isSearchable={false}
                classNamePrefix="react-select"
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>ภาษา</label>
              <Select instanceId={"select-5"} styles={selectStyles}
                options={[{ value: '', label: 'ทั้งหมด' }, ...languages.map(c => ({ value: c, label: c }))]}
                value={{ value: languageFilter, label: languageFilter || 'ทั้งหมด' }}
                onChange={(selected) => updateFilter(setLanguageFilter, selected ? selected.value : '')}
                placeholder="ทั้งหมด"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>ปีพิมพ์</label>
              <Select instanceId={"select-6"} styles={selectStyles}
                options={[{ value: '', label: 'ทั้งหมด' }, ...years.map(c => ({ value: c, label: c }))]}
                value={{ value: yearFilter, label: yearFilter || 'ทั้งหมด' }}
                onChange={(selected) => updateFilter(setYearFilter, selected ? selected.value : '')}
                placeholder="ทั้งหมด"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>ผู้แต่ง</label>
              <Select instanceId={"select-7"} styles={selectStyles}
                options={[{ value: '', label: 'ทั้งหมด' }, ...authors.map(c => ({ value: c, label: c }))]}
                value={{ value: authorFilter, label: authorFilter || 'ทั้งหมด' }}
                onChange={(selected) => updateFilter(setAuthorFilter, selected ? selected.value : '')}
                placeholder="ทั้งหมด"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>ผู้แปล</label>
              <Select instanceId={"select-8"} styles={selectStyles}
                options={[{ value: '', label: 'ทั้งหมด' }, ...translators.map(c => ({ value: c, label: c }))]}
                value={{ value: translatorFilter, label: translatorFilter || 'ทั้งหมด' }}
                onChange={(selected) => updateFilter(setTranslatorFilter, selected ? selected.value : '')}
                placeholder="ทั้งหมด"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>สำนักพิมพ์</label>
              <Select instanceId={"select-9"} styles={selectStyles}
                options={[{ value: '', label: 'ทั้งหมด' }, ...publishers.map(c => ({ value: c, label: c }))]}
                value={{ value: publisherFilter, label: publisherFilter || 'ทั้งหมด' }}
                onChange={(selected) => updateFilter(setPublisherFilter, selected ? selected.value : '')}
                placeholder="ทั้งหมด"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--fg-2)', fontWeight: 600 }}>บัญชี Google ที่เก็บไฟล์</label>
              <Select instanceId={"select-10"} styles={selectStyles}
                options={[
                  { value: '', label: 'ทั้งหมด' },
                  ...owners.map(o => ({ value: o, label: o })),
                  { value: '__none__', label: 'ยังไม่ได้บันทึกบัญชี' },
                ]}
                value={{
                  value: ownerFilter,
                  label: ownerFilter === '__none__' ? 'ยังไม่ได้บันทึกบัญชี' : ownerFilter || 'ทั้งหมด',
                }}
                onChange={(selected) => updateFilter(setOwnerFilter, selected ? selected.value : '')}
                placeholder="ทั้งหมด"
                isSearchable={true}
                classNamePrefix="react-select"
              />
            </div>

            <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button className="btn" onClick={() => {
                setCategoryFilter(''); setAuthorFilter(''); setTranslatorFilter('');
                setPublisherFilter(''); setTypeFilter(''); setLanguageFilter('');
                setYearFilter(''); setStatusFilter(''); setOwnerFilter(''); setSearchQuery('');
                setSortOrder('desc');
                setCurrentPage(1);
              }}>ล้างตัวกรองทั้งหมด</button>
            </div>
          </div>
        )}
      </div>

      <div className={styles.tableHeader} style={{ display: viewMode !== 'table' ? 'none' : '' }}>
        <div style={{ display: 'flex', alignItems: 'center', paddingLeft: '1.1rem' }}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={allSelected}
            onChange={(e) => handleSelectAll(e, shownBooks)}
          />
        </div>
        <div style={{ paddingLeft: '1rem', color: 'var(--fg-3)', fontSize: '0.85rem' }}>
          {selectedBooks.size > 0 ? `เลือกแล้ว ${selectedBooks.size} เล่ม` : `${filteredBooks.length} เล่ม`}
        </div>
      </div>

      {viewMode !== 'table' && (
        <div style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            type="checkbox"
            className={styles.checkbox}
            checked={allSelected}
            onChange={(e) => handleSelectAll(e, shownBooks)}
          />
          <span style={{ color: 'var(--fg-3)', fontSize: '0.85rem' }}>เลือกทั้งหมดในหน้านี้</span>
        </div>
      )}

      {viewMode === 'cover' ? (
        <ul className={`${styles.rowsCover} stagger`}>
          {shownBooks.length === 0 && (
            <li style={{color: 'var(--fg-3)', padding: '2rem', textAlign: 'center', background: 'var(--surface)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)'}}>
              {searchQuery || categoryFilter || statusFilter ? 'ไม่พบหนังสือที่ค้นหา' : 'ยังไม่มีหนังสือในระบบ'}
            </li>
          )}
          {shownBooks.map((book) => (
            <li key={book.id} className={`${styles.coverCard} ${selectedBooks.has(book.id) ? styles.rowSelected : ''}`}>
              <div className={styles.coverCheckbox}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={selectedBooks.has(book.id)}
                  onChange={() => handleSelectBook(book.id)}
                />
              </div>
              <Link href={`/book/${getLangPath(book.language)}/${book.id}`} className={styles.coverWrap}>
                <BookCover src={book.coverUrl} title={book.title} author={book.author} />
              </Link>
              <span className={styles.name} title={book.title}>{book.title}</span>
              <span className={styles.smallMeta}>{joinPeople(book.author) || 'ไม่ระบุผู้แต่ง'}</span>
              <div className={styles.coverActions}>
                <Link href={`/book/${getLangPath(book.language)}/${book.id}`} className={styles.view}>
                  <span className="tlink">ดู</span>
                </Link>
                <button onClick={() => handleOpenEditBook(book.id)} className={styles.edit} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem' }}>
                  <span className="tlink">แก้ไข</span>
                </button>
                <button
                  onClick={() => handleSingleDelete(book.id)}
                  className={styles.delete}
                  style={{ background: 'none', border: 'none', color: 'var(--hot)', cursor: 'pointer', padding: '0.4rem', borderRadius: 'var(--r-sm)' }}
                  title="ลบหนังสือ"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <ul className={`${viewMode === 'card' ? styles.rowsCard : styles.rows} stagger`}>
          {shownBooks.length === 0 && (
            <li style={{color: 'var(--fg-3)', padding: '2rem', textAlign: 'center', background: 'var(--surface)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)'}}>
              {searchQuery || categoryFilter || statusFilter ? 'ไม่พบหนังสือที่ค้นหา' : 'ยังไม่มีหนังสือในระบบ'}
            </li>
          )}
          {shownBooks.map((book) => (
            <li key={book.id} className={`${styles.bookRow} ${selectedBooks.has(book.id) ? styles.rowSelected : ''}`}>
              <div className={styles.checkboxWrap}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={selectedBooks.has(book.id)}
                  onChange={() => handleSelectBook(book.id)}
                />
              </div>
              <div className={styles.who}>
                <span className={styles.name}>{book.title}</span>
                <span className={styles.smallMeta}>
                  {joinPeople(book.author) || 'ไม่ระบุผู้แต่ง'}
                  {book.driveOwner && (
                    <>
                      {' · '}
                      <span className={styles.owner} title={`ไฟล์อยู่ในบัญชี ${book.driveOwner}`}>
                        <Mail size={11} /> {book.driveOwner}
                      </span>
                    </>
                  )}
                </span>
              </div>
              <span className={styles.when}>{book.category}</span>
              <span className={book.restricted ? styles.flagOn : styles.flag}>
                {book.restricted ? 'สงวนสิทธิ์' : 'สาธารณะ'}
              </span>
              <span className={styles.downloads}>
                <Download size={14} /> {book.downloadCount || 0}
              </span>
              <div className={styles.rowActions}>
                <Link href={`/book/${getLangPath(book.language)}/${book.id}`} className={styles.view}>
                  <span className="tlink">ดู</span>
                </Link>
                <button onClick={() => handleOpenEditBook(book.id)} className={styles.edit} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.4rem' }}>
                  <span className="tlink">แก้ไข</span>
                </button>
                <button
                  onClick={() => handleSingleDelete(book.id)}
                  className={styles.delete}
                  style={{ background: 'none', border: 'none', color: 'var(--hot)', cursor: 'pointer', padding: '0.4rem', borderRadius: 'var(--r-sm)' }}
                  title="ลบหนังสือ"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <div className={styles.pagination}>
          <button 
            className="btn" 
            disabled={current === 1}
            onClick={() => {
              setCurrentPage(current - 1);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            ก่อนหน้า
          </button>
          
          <div className={styles.pageNumbers}>
            {pageWindow(current, pageCount).map((item, index) => 
              typeof item === 'string' ? (
                <span key={`gap-${index}`} className={styles.pageGap}>...</span>
              ) : (
                <button
                  key={item}
                  className={`btn ${current === item ? 'btn-solid' : ''}`}
                  onClick={() => {
                    setCurrentPage(item);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  style={current === item ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : {}}
                >
                  {item}
                </button>
              )
            )}
          </div>

          <button 
            className="btn" 
            disabled={current === pageCount}
            onClick={() => {
              setCurrentPage(current + 1);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            ถัดไป
          </button>
        </div>
      )}

      {selectedBooks.size > 0 && (
        <div className={styles.bulkActionBar}>
          <div style={{ fontSize: 'var(--t-small)' }}>เลือกแล้ว <strong>{selectedBooks.size}</strong> รายการ</div>
          <div style={{ display: 'flex', gap: '0.8rem' }}>
            <button className="btn" onClick={() => setBulkEditModalOpen(true)}>
              <Edit2 size={16} /> แก้ไขพร้อมกัน
            </button>
            <button className="btn" style={{ color: 'var(--hot)', borderColor: 'var(--hot)' }} onClick={handleBulkDelete}>
              <Trash2 size={16} /> ลบที่เลือก
            </button>
          </div>
        </div>
      )}

      {bulkEditModalOpen && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modal}>
            <h2 style={{ marginBottom: '1rem', fontSize: 'var(--t-h2)' }}>แก้ไข {selectedBooks.size} เล่มพร้อมกัน</h2>
            <p style={{ color: 'var(--fg-2)', fontSize: 'var(--t-small)', marginBottom: '1.5rem' }}>
              เว้นว่างไว้หากไม่ต้องการเปลี่ยนแปลงค่าเดิม
            </p>
            <form onSubmit={handleBulkUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <label>
                <div style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', marginBottom: '0.3rem' }}>ผู้แต่งใหม่ (เปลี่ยนทั้งหมด) — หลายคนคั่นด้วย ;</div>
                <input 
                  type="text" 
                  value={bulkValues.author} 
                  onChange={e => setBulkValues({...bulkValues, author: e.target.value})}
                  placeholder="ปล่อยว่างเพื่อคงเดิม เช่น ชื่อที่หนึ่ง; ชื่อที่สอง"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                />
              </label>
              
              <label>
                <div style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', marginBottom: '0.3rem' }}>หมวดหมู่ใหม่</div>
                <select 
                  value={bulkValues.category} 
                  onChange={e => setBulkValues({...bulkValues, category: e.target.value})}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                >
                  <option value="">ปล่อยว่างเพื่อคงเดิม</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>

              <label>
                <div style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', marginBottom: '0.3rem' }}>ภาษาใหม่</div>
                <select 
                  value={bulkValues.language} 
                  onChange={e => setBulkValues({...bulkValues, language: e.target.value})}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                >
                  <option value="">ปล่อยว่างเพื่อคงเดิม</option>
                  {/* `languages` is a flat list of strings — reading .value/.label
                      off it produced a dropdown of blank options. */}
                  {languages.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>

              <label>
                <div style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', marginBottom: '0.3rem' }}>สถานะการเข้าถึง</div>
                <select 
                  value={bulkValues.restricted} 
                  onChange={e => setBulkValues({...bulkValues, restricted: e.target.value})}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                >
                  <option value="">ปล่อยว่างเพื่อคงเดิม</option>
                  <option value="false">สาธารณะ</option>
                  <option value="true">สงวนสิทธิ์</option>
                </select>
              </label>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                <button type="button" className="btn btn-block" onClick={() => setBulkEditModalOpen(false)}>ยกเลิก</button>
                <button type="submit" className="btn btn-solid btn-block" disabled={submittingBulk}>
                  {submittingBulk ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slide-over Form Panel */}
      <BookFormPanel 
        isOpen={isFormOpen} 
        onClose={() => setIsFormOpen(false)} 
        bookId={editingBookId} 
        onSaved={handleBookSaved}
      />

      {/* Bulk Upload Panel */}
      <BulkUploadPanel
        isOpen={isBulkUploadOpen}
        onClose={() => setIsBulkUploadOpen(false)}
        onSaved={handleBookSaved}
      />
    </div>
  );
}

