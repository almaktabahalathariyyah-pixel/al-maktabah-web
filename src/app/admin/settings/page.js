'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { getDropdownSettings, saveDropdownSettings } from '@/lib/settings';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, GripVertical, Save } from 'lucide-react';
import styles from './page.module.css';

export default function SettingsPage() {
  const { isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  
  const [categories, setCategories] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      router.push('/');
    }
  }, [isAdmin, authLoading, router]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await getDropdownSettings();
        setCategories(settings.categories || []);
        setLanguages(settings.languages || []);
      } catch (err) {
        toast.error('โหลดข้อมูลการตั้งค่าไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    };
    
    if (isAdmin) {
      fetchSettings();
    }
  }, [isAdmin, toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const success = await saveDropdownSettings({ categories, languages });
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

  // --- Category Handlers ---
  const addCategoryGroup = () => {
    setCategories([...categories, { label: 'กลุ่มหมวดหมู่ใหม่', options: [] }]);
  };
  const removeCategoryGroup = (groupIndex) => {
    if (!window.confirm('ยืนยันการลบกลุ่มหมวดหมู่นี้?')) return;
    const newCats = [...categories];
    newCats.splice(groupIndex, 1);
    setCategories(newCats);
  };
  const updateCategoryGroupLabel = (groupIndex, label) => {
    const newCats = [...categories];
    newCats[groupIndex].label = label;
    setCategories(newCats);
  };
  const addCategoryOption = (groupIndex) => {
    const newCats = [...categories];
    newCats[groupIndex].options.push({ value: '', label: '' });
    setCategories(newCats);
  };
  const updateCategoryOption = (groupIndex, optIndex, val) => {
    const newCats = [...categories];
    newCats[groupIndex].options[optIndex] = { value: val, label: val };
    setCategories(newCats);
  };
  const removeCategoryOption = (groupIndex, optIndex) => {
    const newCats = [...categories];
    newCats[groupIndex].options.splice(optIndex, 1);
    setCategories(newCats);
  };

  // --- Language Handlers ---
  const addLanguage = () => {
    setLanguages([...languages, { value: '', label: '' }]);
  };
  const updateLanguage = (index, val) => {
    const newLangs = [...languages];
    newLangs[index] = { value: val, label: val };
    setLanguages(newLangs);
  };
  const removeLanguage = (index) => {
    const newLangs = [...languages];
    newLangs.splice(index, 1);
    setLanguages(newLangs);
  };

  if (authLoading || loading) {
    return <div className="container" style={{paddingTop: '4rem'}}>กำลังโหลดข้อมูล...</div>;
  }

  if (!isAdmin) return null;

  return (
    <div className="container" style={{ paddingBottom: '6rem' }}>
      <header className={`${styles.header} rise`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <Link href="/admin" className={styles.backBtn}>
            <ArrowLeft size={20} />
          </Link>
          <p className="eyebrow" style={{ margin: 0 }}>ผู้ดูแลระบบ</p>
        </div>
        <h1 className={styles.title}>ตั้งค่าหมวดหมู่ & ภาษา</h1>
        <p className="lede">
          ปรับแต่งโครงสร้างหมวดหมู่หนังสือและภาษาที่จะแสดงในฟอร์มการเพิ่ม/แก้ไขหนังสือ<br/>
          <span style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)' }}>
            *หากต้องการตั้งค่าว่าฟิลด์ไหนควรเป็น Text หรือ Dropdown กรุณาไปที่ <Link href="/admin/fields" className="tlink" style={{ color: 'var(--accent)' }}>หน้าตั้งค่าฟิลด์ฟอร์ม</Link>
          </span>
        </p>
      </header>

      <div className={styles.layout}>
        {/* Categories Section */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>กลุ่มหมวดหมู่ (Categories)</h2>
            <button className="btn" onClick={addCategoryGroup}><Plus size={16}/> เพิ่มกลุ่ม</button>
          </div>
          
          <div className={styles.groupList}>
            {categories.map((group, gIdx) => (
              <div key={gIdx} className={styles.groupCard}>
                <div className={styles.groupHeader}>
                  <input 
                    type="text" 
                    value={group.label}
                    onChange={(e) => updateCategoryGroupLabel(gIdx, e.target.value)}
                    className={styles.groupInput}
                    placeholder="ชื่อกลุ่มหมวดหมู่"
                  />
                  <button className={styles.iconBtn} onClick={() => removeCategoryGroup(gIdx)} style={{ color: 'var(--hot)' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <div className={styles.optionsList}>
                  {group.options.map((opt, oIdx) => (
                    <div key={oIdx} className={styles.optionRow}>
                      <GripVertical size={14} className={styles.dragIcon} />
                      <input 
                        type="text"
                        value={opt.value}
                        onChange={(e) => updateCategoryOption(gIdx, oIdx, e.target.value)}
                        className={styles.optionInput}
                        placeholder="ชื่อหมวดหมู่ย่อย"
                      />
                      <button className={styles.iconBtn} onClick={() => removeCategoryOption(gIdx, oIdx)} title="ลบหมวดหมู่ย่อย">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <button className={styles.addOptionBtn} onClick={() => addCategoryOption(gIdx)}>
                    <Plus size={14} /> เพิ่มหมวดหมู่ย่อย
                  </button>
                </div>
              </div>
            ))}
            {categories.length === 0 && <div style={{color:'var(--fg-3)', padding:'1rem', textAlign:'center'}}>ยังไม่มีกลุ่มหมวดหมู่</div>}
          </div>
        </section>

        {/* Languages Section */}
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>ภาษาหลัก (Languages)</h2>
            <button className="btn" onClick={addLanguage}><Plus size={16}/> เพิ่มภาษา</button>
          </div>
          
          <div className={styles.langList}>
            {languages.map((lang, lIdx) => (
              <div key={lIdx} className={styles.optionRow}>
                <GripVertical size={14} className={styles.dragIcon} />
                <input 
                  type="text"
                  value={lang.value}
                  onChange={(e) => updateLanguage(lIdx, e.target.value)}
                  className={styles.optionInput}
                  placeholder="ชื่อภาษา (เช่น ไทย, อาหรับ)"
                />
                <button className={styles.iconBtn} onClick={() => removeLanguage(lIdx)} title="ลบภาษา">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            {languages.length === 0 && <div style={{color:'var(--fg-3)', padding:'1rem', textAlign:'center'}}>ยังไม่มีภาษา</div>}
          </div>
        </section>
      </div>

      <div className={styles.actionBar}>
        <button className="btn btn-solid" style={{ minWidth: '150px' }} onClick={handleSave} disabled={saving}>
          {saving ? 'กำลังบันทึก...' : <><Save size={18} style={{marginRight: '0.5rem'}} /> บันทึกการตั้งค่า</>}
        </button>
      </div>
    </div>
  );
}
