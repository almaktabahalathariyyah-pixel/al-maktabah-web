'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { getDropdownSettings, saveDropdownSettings } from '@/lib/settings';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { Save } from 'lucide-react';
import SearchableListEditor from '@/components/SearchableListEditor';
import styles from '../settings/page.module.css'; // We can reuse settings styles for layout

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
        setAuthors(settings.authors || []);
        setTranslators(settings.translators || []);
        setPublishers(settings.publishers || []);
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
    setSaving(true);
    try {
      const payload = {
        authors: authors.filter(Boolean),
        translators: translators.filter(Boolean),
        publishers: publishers.filter(Boolean),
      };
      // saveDropdownSettings now uses merge: true, so it won't overwrite categories/languages
      const success = await saveDropdownSettings(payload);
      if (success) {
        toast.success('บันทึกการตั้งค่าสำเร็จ');
      } else {
        toast.error('บันทึกไม่สำเร็จ');
      }
    } catch (err) {
      toast.error('เกิดข้อผิดพลาดในการบันทึก');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncFromBooks = async () => {
    const agreed = await confirm({
      title: 'ดึงรายชื่อจากหนังสือทั้งหมด?',
      message:
        'ระบบจะรวบรวมผู้แต่ง ผู้แปล และสำนักพิมพ์ จากหนังสือทุกเล่มมาเพิ่มในหน้านี้\nรายชื่อเดิมจะไม่หายไป',
      confirmLabel: 'ดึงรายชื่อ',
    });
    if (!agreed) return;
    setSyncing(true);
    try {
      const { collection, getDocs } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const booksSnap = await getDocs(collection(db, 'books'));
      const books = booksSnap.docs.map(d => d.data());
      
      const newAuthors = Array.from(new Set([...authors, ...books.map(b => b.author).filter(Boolean)])).sort();
      const newTranslators = Array.from(new Set([...translators, ...books.map(b => b.translator).filter(Boolean)])).sort();
      const newPublishers = Array.from(new Set([...publishers, ...books.map(b => b.publisher).filter(Boolean)])).sort();
      
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
          </p>
        </div>

        <div className={styles.pageHeadActs}>
          <button className="btn" onClick={handleSyncFromBooks} disabled={syncing || saving}>
            {syncing ? 'กำลังดึงข้อมูล…' : 'ดึงรายชื่อจากหนังสือ'}
          </button>
          <button className="btn btn-solid" onClick={handleSave} disabled={saving || syncing}>
            <Save size={17} />
            {saving ? 'กำลังบันทึก…' : 'บันทึกการเปลี่ยนแปลง'}
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
          />
        )}
        
        {activeTab === 'translators' && (
          <SearchableListEditor 
            title="ผู้แปล (Translators)"
            description="จัดการรายชื่อผู้แปล พิมพ์ค้นหาเพื่อแก้ไขหรือลบ"
            placeholder="ค้นหาชื่อผู้แปล..."
            items={translators}
            onChange={setTranslators}
          />
        )}
        
        {activeTab === 'publishers' && (
          <SearchableListEditor 
            title="สำนักพิมพ์ (Publishers)"
            description="จัดการรายชื่อสำนักพิมพ์ พิมพ์ค้นหาเพื่อแก้ไขหรือลบ"
            placeholder="ค้นหาชื่อสำนักพิมพ์..."
            items={publishers}
            onChange={setPublishers}
          />
        )}
      </div>
      

    </div>
  );
}
