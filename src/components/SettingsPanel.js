'use client';

import { useState, useEffect } from 'react';
import { getDropdownSettings, saveDropdownSettings } from '@/lib/settings';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { X, Plus, Trash2, GripVertical, Save } from 'lucide-react';
import panelStyles from './BookFormPanel.module.css';
import styles from '@/app/admin/settings/page.module.css'; // Reuse existing setting styles
import SearchableListEditor from './SearchableListEditor';

export default function SettingsPanel({ isOpen, onClose }) {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  
  const [categories, setCategories] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [types, setTypes] = useState([]);
  // Shown on the account page, and used by /api/pdf as the last resort when a
  // book cannot be served at all.
  const [contactChannels, setContactChannels] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const [settings, siteSnap] = await Promise.all([
          getDropdownSettings(),
          getDoc(doc(db, 'config', 'siteSettings')),
        ]);
        if (!isMounted) return;
        setContactChannels(
          siteSnap.exists() && Array.isArray(siteSnap.data().contactChannels)
            ? siteSnap.data().contactChannels
            : []
        );
        setCategories(settings.categories || []);
        setLanguages(settings.languages || []);
        setTypes(settings.types || ['หนังสือ', 'ไฟล์ออนไลน์', 'รายงาน', 'แผ่นพับ', 'วารสาร', 'งานวิจัย', 'วิทยานิพนธ์']);
      } catch (err) {
        if (isMounted) toast.error('โหลดข้อมูลการตั้งค่าไม่สำเร็จ');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    
    fetchSettings();
    return () => { isMounted = false; };
  }, [isOpen, toast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        categories,
        languages,
        types: types.filter(Boolean),
      };
      const success = await saveDropdownSettings(payload);

      // Contact channels live in config/siteSettings, which is what the
      // account page and the "book unavailable" page both read.
      await setDoc(
        doc(db, 'config', 'siteSettings'),
        { contactChannels: contactChannels.filter((c) => c.link?.trim()) },
        { merge: true }
      );

      if (success) {
        toast.success('บันทึกการตั้งค่าสำเร็จ');
        onClose();
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
      title: 'ดึงข้อมูลจากหนังสือทั้งหมด?',
      message:
        'ระบบจะรวบรวมหมวดหมู่ ประเภท และภาษา จากหนังสือทุกเล่มมาเพิ่มในหน้านี้\nข้อมูลเดิมจะไม่หายไป',
      confirmLabel: 'ดึงข้อมูล',
    });
    if (!agreed) return;
    setSyncing(true);
    try {
      const { collection, getDocs } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const booksSnap = await getDocs(collection(db, 'books'));
      const books = booksSnap.docs.map(d => d.data());
      
      const uniqueLanguages = Array.from(new Set(books.map(b => b.language).filter(Boolean)));
      const uniqueTypes = Array.from(new Set(books.map(b => b.type).filter(Boolean)));
      const uniqueCats = Array.from(new Set(books.map(b => b.category).filter(Boolean)));
      
      setLanguages(Array.from(new Set([...languages, ...uniqueLanguages])).sort());
      setTypes(Array.from(new Set([...types, ...uniqueTypes])).sort());
      
      // For categories, we add them to a "นำเข้าอัตโนมัติ" group if they don't exist
      const existingCatSet = new Set();
      categories.forEach(group => group.options.forEach(opt => existingCatSet.add(opt.value)));
      
      const newCats = uniqueCats.filter(c => !existingCatSet.has(c));
      if (newCats.length > 0) {
        setCategories([
          ...categories, 
          { 
            label: 'นำเข้าจากหนังสือ', 
            options: newCats.map(c => ({ value: c, label: c }))
          }
        ]);
      }
      
      toast.success('ดึงข้อมูลสำเร็จ! กรุณากด "บันทึกการเปลี่ยนแปลง" เพื่อยืนยัน');
    } catch (err) {
      console.error(err);
      toast.error('เกิดข้อผิดพลาดในการดึงข้อมูล');
    } finally {
      setSyncing(false);
    }
  };

  // --- Category Handlers ---
  const addCategoryGroup = () => {
    setCategories([...categories, { label: 'กลุ่มหมวดหมู่ใหม่', options: [] }]);
  };
  const removeCategoryGroup = async (groupIndex) => {
    const agreed = await confirm({
      title: 'ลบกลุ่มหมวดหมู่นี้?',
      message: `“${categories[groupIndex]?.label || 'กลุ่มนี้'}” และหมวดหมู่ย่อยทั้งหมดในกลุ่มจะถูกเอาออกจากรายการ`,
      confirmLabel: 'ลบกลุ่มนี้',
      tone: 'danger',
    });
    if (!agreed) return;
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

  // --- Type Handlers ---
  // --- Contact channel handlers ---
  const addChannel = () => setContactChannels([...contactChannels, { label: '', link: '' }]);
  const updateChannel = (index, key, value) => {
    const next = [...contactChannels];
    next[index] = { ...next[index], [key]: value };
    setContactChannels(next);
  };
  const removeChannel = (index) => {
    const next = [...contactChannels];
    next.splice(index, 1);
    setContactChannels(next);
  };

  const addType = () => setTypes([...types, '']);
  const updateType = (index, val) => {
    const newTypes = [...types];
    newTypes[index] = val;
    setTypes(newTypes);
  };
  const removeType = (index) => {
    const newTypes = [...types];
    newTypes.splice(index, 1);
    setTypes(newTypes);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={panelStyles.backdrop} onClick={onClose} />
      <div className={panelStyles.panel}>
        <div className={panelStyles.header}>
            <div className={styles.headerRow}>
              <h2 className={styles.title}>ตั้งค่าหมวดหมู่</h2>
              <div className={styles.headerActs}>
                <button className="btn" onClick={handleSyncFromBooks} disabled={syncing || saving}>
                  {syncing ? 'กำลังดึง…' : 'ดึงจากหนังสือ'}
                </button>
                <button
                  className="btn btn-solid"
                  onClick={handleSave}
                  disabled={saving || syncing}
                >
                  <Save size={16} />
                  <span>{saving ? 'กำลังบันทึก…' : 'บันทึกการเปลี่ยนแปลง'}</span>
                </button>
                <button
                  className={`${panelStyles.closeButton} ${styles.headerClose}`}
                  onClick={onClose}
                  aria-label="ปิด"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
        </div>

        <div className={panelStyles.content}>
          {loading ? (
            <div className={panelStyles.loadingState}>กำลังโหลดข้อมูล...</div>
          ) : (
            <div className={styles.layout} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
              {/* Categories Section */}
              <section className={styles.section}>
                <div className={styles.sectionHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 className={styles.sectionTitle} style={{ margin: 0, fontSize: '1.2rem' }}>กลุ่มหมวดหมู่ (Categories)</h2>
                  <button className="btn" onClick={addCategoryGroup}><Plus size={16}/> เพิ่มกลุ่ม</button>
                </div>
                
                <div className={styles.groupList}>
                  {categories.map((group, gIdx) => (
                    <div key={gIdx} className={styles.groupCard} style={{ marginBottom: '1rem', border: '1px solid var(--border)', padding: '1rem', borderRadius: 'var(--r-md)' }}>
                      <div className={styles.groupHeader} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                        <input 
                          type="text" 
                          value={group.label}
                          onChange={(e) => updateCategoryGroupLabel(gIdx, e.target.value)}
                          className={styles.groupInput}
                          placeholder="ชื่อกลุ่มหมวดหมู่"
                          style={{ flex: 1, padding: '0.5rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                        />
                        <button className={styles.iconBtn} onClick={() => removeCategoryGroup(gIdx)} style={{ color: 'var(--hot)', padding: '0.5rem', border: 'none', background: 'none', cursor: 'pointer' }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                      
                      <div className={styles.optionsList} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {group.options.map((opt, oIdx) => (
                          <div key={oIdx} className={styles.optionRow} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <GripVertical size={14} style={{ color: 'var(--fg-3)' }} />
                            <input 
                              type="text"
                              value={opt.value}
                              onChange={(e) => updateCategoryOption(gIdx, oIdx, e.target.value)}
                              className={styles.optionInput}
                              placeholder="ชื่อหมวดหมู่ย่อย"
                              style={{ flex: 1, padding: '0.4rem 0.5rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)', fontSize: '0.9rem' }}
                            />
                            <button className={styles.iconBtn} onClick={() => removeCategoryOption(gIdx, oIdx)} title="ลบหมวดหมู่ย่อย" style={{ padding: '0.4rem', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--fg-3)' }}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                        <button className="btn" onClick={() => addCategoryOption(gIdx)} style={{ alignSelf: 'flex-start', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                          <Plus size={14} /> เพิ่มหมวดหมู่ย่อย
                        </button>
                      </div>
                    </div>
                  ))}
                  {categories.length === 0 && <div style={{color:'var(--fg-3)', padding:'1rem', textAlign:'center'}}>ยังไม่มีกลุ่มหมวดหมู่</div>}
                </div>
              </section>

              {/* Types Section */}
              <section className={styles.section}>
                <div className={styles.sectionHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 className={styles.sectionTitle} style={{ margin: 0, fontSize: '1.2rem' }}>ประเภทหนังสือ (Types)</h2>
                  <button className="btn" onClick={addType}><Plus size={16}/> เพิ่มประเภท</button>
                </div>
                
                <div className={styles.langList} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {types.map((typeVal, tIdx) => (
                    <div key={tIdx} className={styles.optionRow} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <GripVertical size={14} style={{ color: 'var(--fg-3)' }} />
                      <input 
                        type="text"
                        value={typeVal}
                        onChange={(e) => updateType(tIdx, e.target.value)}
                        className={styles.optionInput}
                        placeholder="เช่น หนังสือทั่วไป, ตำรา, บทความ"
                        style={{ flex: 1, padding: '0.5rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                      />
                      <button className={styles.iconBtn} onClick={() => removeType(tIdx)} title="ลบประเภท" style={{ padding: '0.5rem', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--fg-3)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {types.length === 0 && <div style={{color:'var(--fg-3)', padding:'1rem', textAlign:'center'}}>ยังไม่มีประเภท</div>}
                </div>
              </section>

              {/* Contact Channels */}
              <section className={styles.section}>
                <div className={styles.sectionHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <h2 className={styles.sectionTitle} style={{ margin: 0, fontSize: '1.2rem' }}>ช่องทางติดต่อ (LINE OA)</h2>
                  <button className="btn" onClick={addChannel}><Plus size={16}/> เพิ่มช่องทาง</button>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--fg-3)', lineHeight: 1.7, marginBottom: '1rem' }}>
                  แสดงในหน้าบัญชี และใช้เป็นทางออกสุดท้ายเมื่อหนังสือเปิดไม่ได้
                  ระบบจะบอกผู้อ่านให้ทักมาขอไฟล์ทางช่องทางแรกในรายการนี้
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {contactChannels.map((channel, cIdx) => (
                    <div key={cIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="text"
                        value={channel.label || ''}
                        onChange={(e) => updateChannel(cIdx, 'label', e.target.value)}
                        placeholder="ชื่อที่แสดง เช่น ติดต่อผ่าน LINE"
                        style={{ flex: '0 1 240px', padding: '0.5rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                      />
                      <input
                        type="text"
                        value={channel.link || ''}
                        onChange={(e) => updateChannel(cIdx, 'link', e.target.value)}
                        placeholder="https://lin.ee/xxxxxxx"
                        style={{ flex: 1, padding: '0.5rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                      />
                      <button className={styles.iconBtn} onClick={() => removeChannel(cIdx)} title="ลบช่องทาง" style={{ padding: '0.5rem', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--fg-3)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {contactChannels.length === 0 && <div style={{color:'var(--fg-3)', padding:'1rem', textAlign:'center'}}>ยังไม่มีช่องทางติดต่อ</div>}
                </div>
              </section>

              {/* Languages Section */}
              <section className={styles.section}>
                <div className={styles.sectionHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 className={styles.sectionTitle} style={{ margin: 0, fontSize: '1.2rem' }}>ภาษาหลัก (Languages)</h2>
                  <button className="btn" onClick={addLanguage}><Plus size={16}/> เพิ่มภาษา</button>
                </div>
                
                <div className={styles.langList} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {languages.map((lang, lIdx) => (
                    <div key={lIdx} className={styles.optionRow} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <GripVertical size={14} style={{ color: 'var(--fg-3)' }} />
                      <input 
                        type="text"
                        value={lang.value}
                        onChange={(e) => updateLanguage(lIdx, e.target.value)}
                        className={styles.optionInput}
                        placeholder="ชื่อภาษา (เช่น ไทย, อาหรับ)"
                        style={{ flex: 1, padding: '0.5rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface)' }}
                      />
                      <button className={styles.iconBtn} onClick={() => removeLanguage(lIdx)} title="ลบภาษา" style={{ padding: '0.5rem', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--fg-3)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {languages.length === 0 && <div style={{color:'var(--fg-3)', padding:'1rem', textAlign:'center'}}>ยังไม่มีภาษา</div>}
                </div>
              </section>
            </div>
          )}
        </div>

        <div className={panelStyles.footer}>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>ยกเลิก</button>
          <button type="button" className="btn btn-solid" onClick={handleSave} disabled={saving || loading}>
            {saving ? 'กำลังบันทึก...' : <><Save size={16} style={{marginRight: '0.5rem'}} /> บันทึกการตั้งค่า</>}
          </button>
        </div>
      </div>
    </>
  );
}
