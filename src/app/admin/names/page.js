'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { getDropdownSettings, saveDropdownSettings } from '@/lib/settings';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { Save } from 'lucide-react';
import SearchableListEditor from '@/components/SearchableListEditor';
import { asList } from '@/lib/people';
import { renameInBooks } from '@/lib/renameName';
import styles from '../settings/page.module.css'; // We can reuse settings styles for layout

/** Thai collation, so ก comes before ข and an English name sorts sensibly. */
const sortNames = (list) => [...(list || [])].sort((a, b) => String(a).localeCompare(String(b), 'th'));

/** Which book field each list on this page governs. */
const BOOK_FIELD = {
  authors: { field: 'author', isMulti: true },
  translators: { field: 'translator', isMulti: true },
  publishers: { field: 'publisher', isMulti: false },
};

export default function NamesPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const { confirm } = useConfirm();
  
  const [authors, setAuthors] = useState([]);
  const [translators, setTranslators] = useState([]);
  const [publishers, setPublishers] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('authors'); // 'authors', 'translators', 'publishers'

  /**
   * Per list, the name each entry started as: current spelling → original.
   *
   * Renaming twice before saving (a typo, then a fix) has to reach the books
   * as ONE rewrite from the original — chaining through the intermediate
   * spelling would query for a name no book ever held.
   */
  const originalOf = useRef({ authors: new Map(), translators: new Map(), publishers: new Map() });

  const trackRename = useCallback(
    (listKey) => (from, to) => {
      const map = originalOf.current[listKey];
      map.set(to, map.get(from) ?? from);
      map.delete(from);
    },
    []
  );

  const pendingRenames = (listKey) =>
    [...originalOf.current[listKey]].filter(([current, original]) => current !== original);

  const renameCount = Object.keys(BOOK_FIELD).reduce(
    (total, key) => total + pendingRenames(key).length,
    0
  );

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
        setAuthors(sortNames(settings.authors));
        setTranslators(sortNames(settings.translators));
        setPublishers(sortNames(settings.publishers));
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
    // Renaming here rewrites real books, so it is not something to discover
    // after the fact — say how many names and let the owner back out.
    if (renameCount > 0) {
      const lines = Object.keys(BOOK_FIELD).flatMap((key) =>
        pendingRenames(key).map(([current, original]) => `“${original}” → “${current}”`)
      );
      const agreed = await confirm({
        title: `แก้ชื่อในหนังสือด้วย? (${renameCount} ชื่อ)`,
        message:
          `หนังสือทุกเล่มที่ใช้ชื่อเดิมจะถูกแก้ให้ตรงกับชื่อใหม่:\n\n${lines.join('\n')}`,
        confirmLabel: 'บันทึกและแก้หนังสือ',
      });
      if (!agreed) return;
    }

    setSaving(true);
    try {
      const payload = {
        authors: authors.filter(Boolean),
        translators: translators.filter(Boolean),
        publishers: publishers.filter(Boolean),
      };
      // saveDropdownSettings now uses merge: true, so it won't overwrite categories/languages
      const success = await saveDropdownSettings(payload);
      if (!success) {
        toast.error('บันทึกไม่สำเร็จ');
        return;
      }

      let booksTouched = 0;
      for (const [listKey, { field, isMulti }] of Object.entries(BOOK_FIELD)) {
        for (const [current, original] of pendingRenames(listKey)) {
          booksTouched += await renameInBooks({ field, from: original, to: current, isMulti });
          // Cleared as each one lands, so a failure part-way through leaves
          // only the renames still owed — pressing save again finishes them
          // rather than redoing what already worked.
          originalOf.current[listKey].set(current, current);
        }
      }

      toast.success(
        booksTouched > 0
          ? `บันทึกแล้ว และแก้ชื่อในหนังสือ ${booksTouched} เล่ม`
          : 'บันทึกการตั้งค่าสำเร็จ'
      );
    } catch (err) {
      console.error('Save names failed:', err);
      toast.error('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
    }
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
      
      setAuthors(newAuthors);
      setTranslators(newTranslators);
      setPublishers(newPublishers);
      
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
    <div className="container" style={{ maxWidth: '1000px', paddingBottom: '5rem' }}>
      {/* Classes, not inline styles: this header has to reflow under 700px and
          an inline style cannot carry a media query, which is why the buttons
          were climbing into the heading on a phone. */}
      <header className={styles.pageHead}>
        <div>
          <p className="eyebrow" style={{ display: 'block', marginBottom: '0.7rem' }}>ผู้ดูแลระบบ</p>
          <h1 className={styles.pageTitle}>จัดการรายชื่อ</h1>
          <p className="lede" style={{ marginTop: '0.5rem' }}>
            จัดการผู้แต่ง ผู้แปล และสำนักพิมพ์สำหรับตัวเลือกในระบบ
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
          <button className="btn btn-solid" onClick={handleSave} disabled={saving || syncing}>
            <Save size={17} />
            {saving
              ? 'กำลังบันทึก…'
              : renameCount > 0
                ? `บันทึก (แก้ ${renameCount} ชื่อ)`
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
          />
        )}
      </div>
      

    </div>
  );
}
