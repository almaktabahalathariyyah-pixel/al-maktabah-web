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
      <header style={{ padding: 'clamp(2.25rem, 5vw, 3.5rem) 0 1.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p className="eyebrow" style={{ display: 'block', marginBottom: '0.7rem' }}>ผู้ดูแลระบบ</p>
          <h1 style={{ fontFamily: 'var(--display)', fontSize: 'clamp(1.8rem, 4.5vw, 2.6rem)', fontWeight: 600, margin: 0 }}>จัดการรายชื่อ</h1>
          <p className="lede" style={{ marginTop: '0.5rem' }}>
            จัดการผู้แต่ง ผู้แปล และสำนักพิมพ์สำหรับตัวเลือกในระบบ
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button 
            className="btn" 
            onClick={handleSyncFromBooks} 
            disabled={syncing || saving}
            style={{ fontSize: '0.9rem', padding: '0.75rem 1rem' }}
          >
            {syncing ? 'กำลังดึงข้อมูล...' : 'ดึงรายชื่อจากหนังสือ'}
          </button>
          <button 
            className="btn btn-solid" 
            onClick={handleSave} 
            disabled={saving || syncing}
            style={{ background: 'var(--accent)', borderColor: 'var(--accent)', fontSize: '1rem', padding: '0.75rem 1.5rem' }}
          >
            <Save size={18} style={{ marginRight: '0.5rem' }}/>
            {saving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}>
        <button 
          className={`btn ${activeTab === 'authors' ? 'btn-solid' : ''}`}
          onClick={() => setActiveTab('authors')}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          ผู้แต่ง (Authors)
        </button>
        <button 
          className={`btn ${activeTab === 'translators' ? 'btn-solid' : ''}`}
          onClick={() => setActiveTab('translators')}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          ผู้แปล (Translators)
        </button>
        <button 
          className={`btn ${activeTab === 'publishers' ? 'btn-solid' : ''}`}
          onClick={() => setActiveTab('publishers')}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          สำนักพิมพ์ (Publishers)
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
