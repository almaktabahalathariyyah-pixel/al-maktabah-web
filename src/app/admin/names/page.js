'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import {
  getDropdownSettings, saveDropdownSettings, categoryEntries, groupCategories,
} from '@/lib/settings';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { Save } from 'lucide-react';
import SearchableListEditor from '@/components/SearchableListEditor';
import UnsavedBar from '@/components/UnsavedBar';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { asList } from '@/lib/people';
import { renameInBooks, removeFromBooks } from '@/lib/renameName';
import styles from '../settings/page.module.css'; // We can reuse settings styles for layout

/** Thai collation, so ก comes before ข and an English name sorts sensibly. */
const sortNames = (list) => [...(list || [])].sort((a, b) => String(a).localeCompare(String(b), 'th'));

const LIST_KEYS = ['authors', 'translators', 'publishers', 'categories'];

/** The four lists as one comparable string, for "has anything moved?". */
const fingerprint = (lists) =>
  LIST_KEYS.map((key) => (lists[key] || []).join('␟')).join('␞');

const emptyQueue = () => ({
  authors: { renames: [], deletes: [] },
  translators: { renames: [], deletes: [] },
  publishers: { renames: [], deletes: [] },
  categories: { renames: [], deletes: [] },
});

/** Which book field each list on this page governs. */
const BOOK_FIELD = {
  authors: { field: 'author', isMulti: true },
  translators: { field: 'translator', isMulti: true },
  publishers: { field: 'publisher', isMulti: false },
  categories: { field: 'category', isMulti: false },
};

export default function NamesPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  
  const [authors, setAuthors] = useState([]);
  const [translators, setTranslators] = useState([]);
  const [publishers, setPublishers] = useState([]);
  const [categories, setCategories] = useState([]);

  // Categories are stored as groups of options, not a flat array. The editor
  // works on the values alone — merging two spellings of one subject is the
  // job, and which group each sits in is beside the point — so the shape is
  // taken apart on load and put back on save. `groupOf` is what remembers
  // where each value belongs across a rename.
  const categoryGroups = useRef([]);
  const groupOf = useRef(new Map());
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('authors'); // 'authors', 'translators', 'publishers'

  /**
   * What the books still owe this page, per list, in the order it was done.
   *
   * Nothing here touches Firestore until save, so the same name can be
   * renamed twice (a typo, then the fix) or renamed and then deleted before
   * anything is written. Both have to reach the books as ONE operation
   * against the name the books actually hold — chaining through a spelling
   * that only ever existed on this screen would query for nothing.
   */
  const pending = useRef(emptyQueue());

  /**
   * The four lists as they last stood in Firestore — on load, and again after
   * every save that lands. Renames and deletes announce themselves through
   * `pending`, but a name that was merely ADDED leaves no trace there, so
   * "is there unsaved work?" is answered by comparing against this rather
   * than by trusting the queue.
   */
  const [baseline, setBaseline] = useState({ lists: {}, groupOf: new Map() });

  const trackRename = useCallback(
    (listKey) => (from, to) => {
      const { renames } = pending.current[listKey];
      const earlier = renames.find((op) => op.to === from);
      if (earlier) earlier.to = to;
      else renames.push({ from, to });
      // Renaming back to where it started leaves the books alone.
      pending.current[listKey].renames = renames.filter((op) => op.from !== op.to);
    },
    []
  );

  const trackDelete = useCallback(
    (listKey) => (name) => {
      const { renames, deletes } = pending.current[listKey];
      // Deleting something renamed earlier: the books never saw the new
      // spelling, so drop the rename and delete what they do hold.
      const earlier = renames.find((op) => op.to === name);
      if (earlier) {
        pending.current[listKey].renames = renames.filter((op) => op !== earlier);
        deletes.push(earlier.from);
      } else {
        deletes.push(name);
      }
    },
    []
  );

  // A renamed category has to carry its group across with it, or saving would
  // file it under "นำเข้าจากหนังสือ" as though it were new.
  const renameCategory = useCallback(
    (from, to) => {
      const map = groupOf.current;
      if (map.has(from)) {
        map.set(to, map.get(from));
        map.delete(from);
      }
      trackRename('categories')(from, to);
    },
    [trackRename]
  );

  const deleteCategory = useCallback(
    (name) => {
      groupOf.current.delete(name);
      trackDelete('categories')(name);
    },
    [trackDelete]
  );

  const changeCount = Object.keys(BOOK_FIELD).reduce(
    (total, key) => total + pending.current[key].renames.length + pending.current[key].deletes.length,
    0
  );

  const lists = { authors, translators, publishers, categories };
  const dirty = !loading && fingerprint(lists) !== fingerprint(baseline.lists);

  /**
   * The sidebar is one tap from here, and in the App Router a Link never
   * reaches the browser's own "leave site?" prompt — so the page has to ask
   * for itself or the edits simply vanish mid-click.
   */
  const leave = useCallback(
    async (href) => {
      const agreed = await confirm({
        title: 'ออกจากหน้านี้โดยไม่บันทึก?',
        message: 'การแก้ไขรายชื่อที่ทำไว้จะหายไปทั้งหมด — หน้านี้ไม่ได้บันทึกอัตโนมัติ',
        confirmLabel: 'ออกโดยไม่บันทึก',
        cancelLabel: 'อยู่ต่อเพื่อบันทึก',
        tone: 'danger',
      });
      if (agreed) router.push(href);
    },
    [confirm, router]
  );

  useUnsavedGuard(dirty, leave);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/');
    }
  }, [isAdmin, authLoading, router]);

  useEffect(() => {
    let isMounted = true;
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const settings = await getDropdownSettings();
        if (!isMounted) return;
        // Names now arrive on their own as books are saved, appended in the
        // order they were first used. Sorted here so a list of 300 stays
        // findable and a name never moves once it is in place.
        const loaded = {
          authors: sortNames(settings.authors),
          translators: sortNames(settings.translators),
          publishers: sortNames(settings.publishers),
          categories: [],
        };

        categoryGroups.current = settings.categories;
        const entries = categoryEntries(settings.categories);
        groupOf.current = new Map(entries.map((e) => [e.value, e.group]));
        loaded.categories = sortNames(entries.map((e) => e.value));

        setAuthors(loaded.authors);
        setTranslators(loaded.translators);
        setPublishers(loaded.publishers);
        setCategories(loaded.categories);
        setBaseline({ lists: loaded, groupOf: new Map(groupOf.current) });
      } catch (err) {
        if (isMounted) toast.error('โหลดข้อมูลการตั้งค่าไม่สำเร็จ');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    if (isAdmin) {
      fetchSettings();
    }
    return () => { isMounted = false; };
  }, [isAdmin, toast]);

  const handleSave = async () => {
    // This rewrites real books, so it is not something to discover after the
    // fact — spell out exactly what is about to change and let the owner
    // back out.
    if (changeCount > 0) {
      const lines = Object.keys(BOOK_FIELD).flatMap((key) => [
        ...pending.current[key].renames.map((op) => `“${op.from}” → “${op.to}”`),
        ...pending.current[key].deletes.map((name) => `ลบ “${name}”`),
      ]);
      const agreed = await confirm({
        title: `แก้ข้อมูลในหนังสือด้วย? (${changeCount} ชื่อ)`,
        message:
          `หนังสือทุกเล่มที่ใช้ชื่อเหล่านี้จะถูกแก้ตาม:\n\n${lines.slice(0, 20).join('\n')}` +
          `${lines.length > 20 ? `\n…และอีก ${lines.length - 20} รายการ` : ''}`,
        confirmLabel: 'บันทึกและแก้หนังสือ',
      });
      if (!agreed) return;
    }

    setSaving(true);
    try {
      // Blank rows never reach Firestore, and the page is put back in step
      // with what was actually written — otherwise the bar would still read
      // "ยังไม่ได้บันทึก" over a difference nobody can see or fix.
      const saved = {
        authors: authors.filter(Boolean),
        translators: translators.filter(Boolean),
        publishers: publishers.filter(Boolean),
        categories: categories.filter(Boolean),
      };
      const payload = {
        ...saved,
        categories: groupCategories(categoryGroups.current, saved.categories, groupOf.current),
      };
      // saveDropdownSettings now uses merge: true, so it won't overwrite categories/languages
      const success = await saveDropdownSettings(payload);
      if (!success) {
        toast.error('บันทึกไม่สำเร็จ');
        return;
      }

      let booksTouched = 0;
      for (const [listKey, { field, isMulti }] of Object.entries(BOOK_FIELD)) {
        const queue = pending.current[listKey];

        // Renames run in the order they were made, then deletes — each one
        // dropped from the queue as it lands, so a failure part-way through
        // leaves only what is still owed. Pressing save again finishes the
        // job instead of redoing the part that already worked.
        while (queue.renames.length > 0) {
          const op = queue.renames[0];
          booksTouched += await renameInBooks({ field, from: op.from, to: op.to, isMulti });
          queue.renames.shift();
        }
        while (queue.deletes.length > 0) {
          booksTouched += await removeFromBooks({ field, name: queue.deletes[0], isMulti });
          queue.deletes.shift();
        }
      }

      setAuthors(saved.authors);
      setTranslators(saved.translators);
      setPublishers(saved.publishers);
      setCategories(saved.categories);
      setBaseline({ lists: saved, groupOf: new Map(groupOf.current) });

      toast.success(
        booksTouched > 0
          ? `บันทึกแล้ว และแก้ข้อมูลในหนังสือ ${booksTouched} เล่ม`
          : 'บันทึกการตั้งค่าสำเร็จ'
      );
    } catch (err) {
      console.error('Save names failed:', err);
      toast.error('เกิดข้อผิดพลาดในการบันทึก — กดบันทึกอีกครั้งเพื่อทำต่อจากที่ค้างไว้');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Back to the last saved state. Nothing here has touched Firestore yet, so
   * this is a matter of putting the lists — and the category→group map the
   * renames edited in place — back the way they were found.
   */
  const handleDiscard = async () => {
    const agreed = await confirm({
      title: 'ทิ้งการแก้ไขทั้งหมด?',
      message: 'รายชื่อจะกลับไปเป็นเหมือนตอนบันทึกครั้งล่าสุด',
      confirmLabel: 'ทิ้งการแก้ไข',
      tone: 'danger',
    });
    if (!agreed) return;

    const { lists: saved, groupOf: savedGroups } = baseline;
    setAuthors(saved.authors || []);
    setTranslators(saved.translators || []);
    setPublishers(saved.publishers || []);
    setCategories(saved.categories || []);
    groupOf.current = new Map(savedGroups);
    pending.current = emptyQueue();
  };

  const handleSyncFromBooks = async () => {
    const agreed = await confirm({
      title: 'ดึงรายชื่อจากหนังสือทั้งหมด?',
      message:
        'ปกติไม่ต้องใช้แล้ว — ชื่อใหม่จะเข้ามาเองตอนบันทึกหนังสือ\nปุ่มนี้ไว้เก็บตกชื่อจากเล่มเก่าที่บันทึกไว้ก่อนหน้านี้\nรายชื่อเดิมจะไม่หายไป',
      confirmLabel: 'ดึงรายชื่อ',
    });
    if (!agreed) return;
    setSyncing(true);
    try {
      const { collection, getDocs } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const booksSnap = await getDocs(collection(db, 'books'));
      const books = booksSnap.docs.map(d => d.data());
      
      // flatMap: a book crediting two people contributes both names, where
      // map would have added the array itself as one unusable "name".
      const newAuthors = sortNames(new Set([...authors, ...books.flatMap(b => asList(b.author))]));
      const newTranslators = sortNames(new Set([...translators, ...books.flatMap(b => asList(b.translator))]));
      const newPublishers = sortNames(new Set([...publishers, ...books.map(b => b.publisher).filter(Boolean)]));
      const newCategories = sortNames(new Set([...categories, ...books.map(b => b.category).filter(Boolean)]));

      setAuthors(newAuthors);
      setTranslators(newTranslators);
      setPublishers(newPublishers);
      setCategories(newCategories);

      toast.success('ดึงข้อมูลสำเร็จ! กรุณากด "บันทึกการเปลี่ยนแปลง" เพื่อยืนยัน');
    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการดึงข้อมูล');
    } finally {
      setSyncing(false);
    }
  };

  if (authLoading || loading) {
    return <div className="container" style={{paddingTop: '4rem'}}>กำลังโหลดข้อมูล...</div>;
  }

  if (!isAdmin) {
    return null;
  }

  return (
    /* The unsaved tray is fixed to the bottom, so the last list row needs room
       to clear it — otherwise the name being edited sits under the bar. */
    <div className="container" style={{ maxWidth: '1000px', paddingBottom: dirty ? '11rem' : '5rem' }}>
      {/* Classes, not inline styles: this header has to reflow under 700px and
          an inline style cannot carry a media query, which is why the buttons
          were climbing into the heading on a phone. */}
      <header className={styles.pageHead}>
        <div>
          <p className="eyebrow" style={{ display: 'block', marginBottom: '0.7rem' }}>ผู้ดูแลระบบ</p>
          <h1 className={styles.pageTitle}>จัดการรายชื่อ</h1>
          <p className="lede" style={{ marginTop: '0.5rem' }}>
            จัดการผู้แต่ง ผู้แปล สำนักพิมพ์ และหมวดหมู่สำหรับตัวเลือกในระบบ
            <br />
            ชื่อที่พิมพ์ใหม่ตอนเพิ่มหรือแก้ไขหนังสือจะมาขึ้นที่นี่เอง ไม่ต้องกดดึง
            <br />
            แก้ชื่อที่นี่แล้วกดบันทึก หนังสือทุกเล่มที่ใช้ชื่อเดิมจะถูกแก้ตามให้อัตโนมัติ
          </p>
        </div>

        <div className={styles.pageHeadActs}>
          <button className="btn" onClick={handleSyncFromBooks} disabled={syncing || saving}>
            {syncing ? 'กำลังดึงข้อมูล…' : 'ดึงรายชื่อจากหนังสือ'}
          </button>
          {/* Disabled when there is nothing owed, so the button's state is
              itself the answer to "did that save?" — a live button here has
              always meant work is still sitting in the browser. */}
          <button
            className="btn btn-solid"
            onClick={handleSave}
            disabled={saving || syncing || !dirty}
            title={dirty ? undefined : 'ยังไม่มีการแก้ไขที่ต้องบันทึก'}
          >
            <Save size={17} />
            {saving
              ? 'กำลังบันทึก…'
              : changeCount > 0
                ? `บันทึก (แก้ ${changeCount} ชื่อ)`
                : 'บันทึกการเปลี่ยนแปลง'}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`btn ${activeTab === 'authors' ? 'btn-solid' : ''} ${styles.tab}`}
          onClick={() => setActiveTab('authors')}
        >
          ผู้แต่ง <span className={styles.tabEn}>(Authors)</span>
        </button>
        <button
          className={`btn ${activeTab === 'translators' ? 'btn-solid' : ''} ${styles.tab}`}
          onClick={() => setActiveTab('translators')}
        >
          ผู้แปล <span className={styles.tabEn}>(Translators)</span>
        </button>
        <button
          className={`btn ${activeTab === 'publishers' ? 'btn-solid' : ''} ${styles.tab}`}
          onClick={() => setActiveTab('publishers')}
        >
          สำนักพิมพ์ <span className={styles.tabEn}>(Publishers)</span>
        </button>
        <button
          className={`btn ${activeTab === 'categories' ? 'btn-solid' : ''} ${styles.tab}`}
          onClick={() => setActiveTab('categories')}
        >
          หมวดหมู่ <span className={styles.tabEn}>(Categories)</span>
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {activeTab === 'authors' && (
          <SearchableListEditor 
            title="ผู้แต่ง (Authors)"
            description="จัดการรายชื่อผู้แต่ง พิมพ์ค้นหาเพื่อแก้ไขหรือลบ"
            placeholder="ค้นหาชื่อผู้แต่ง..."
            items={authors}
            onChange={setAuthors}
            onRename={trackRename('authors')}
            onDelete={trackDelete('authors')}
          />
        )}
        
        {activeTab === 'translators' && (
          <SearchableListEditor 
            title="ผู้แปล (Translators)"
            description="จัดการรายชื่อผู้แปล พิมพ์ค้นหาเพื่อแก้ไขหรือลบ"
            placeholder="ค้นหาชื่อผู้แปล..."
            items={translators}
            onChange={setTranslators}
            onRename={trackRename('translators')}
            onDelete={trackDelete('translators')}
          />
        )}
        
        {activeTab === 'publishers' && (
          <SearchableListEditor 
            title="สำนักพิมพ์ (Publishers)"
            description="จัดการรายชื่อสำนักพิมพ์ พิมพ์ค้นหาเพื่อแก้ไขหรือลบ"
            placeholder="ค้นหาชื่อสำนักพิมพ์..."
            items={publishers}
            onChange={setPublishers}
            onRename={trackRename('publishers')}
            onDelete={trackDelete('publishers')}
          />
        )}

        {activeTab === 'categories' && (
          <SearchableListEditor
            title="หมวดหมู่ (Categories)"
            description="พิมพ์ชื่อหมวดหนึ่งทับอีกหมวดเพื่อรวมเข้าด้วยกัน — หนังสือจะย้ายตามให้เอง"
            placeholder="ค้นหาชื่อหมวดหมู่..."
            items={categories}
            onChange={setCategories}
            onRename={renameCategory}
            onDelete={deleteCategory}
            reviewable={false}
          />
        )}
      </div>

      <UnsavedBar
        show={dirty}
        saving={saving}
        detail={changeCount > 0 ? `แก้ ${changeCount} ชื่อในหนังสือด้วย` : 'หน้านี้ไม่บันทึกอัตโนมัติ'}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
