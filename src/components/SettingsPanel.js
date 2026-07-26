'use client';

import { useState, useEffect } from 'react';
import { getDropdownSettings, saveDropdownSettings } from '@/lib/settings';
import { useToast } from '@/context/ToastContext';
import { X, Plus, Trash2, GripVertical, Save } from 'lucide-react';
import panelStyles from './BookFormPanel.module.css';
import styles from '@/app/admin/settings/page.module.css'; // Reuse existing setting styles
import SearchableListEditor from './SearchableListEditor';

export default function SettingsPanel({ isOpen, onClose }) {
  const { toast } = useToast();
  
  const [categories, setCategories] = useState([]);
  const [languages, setLanguages] = useState([]);
  const [types, setTypes] = useState([]);
  const [authors, setAuthors] = useState([]);
  const [translators, setTranslators] = useState([]);
  const [publishers, setPublishers] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
        const settings = await getDropdownSettings();
        if (!isMounted) return;
        setCategories(settings.categories || []);
        setLanguages(settings.languages || []);
        setTypes(settings.types || ['หนังสือ', 'ไฟล์ออนไลน์', 'รายงาน', 'แผ่นพับ', 'วารสาร', 'งานวิจัย', 'วิทยานิพนธ์']);
        setAuthors(settings.authors || []);
        setTranslators(settings.translators || []);
        setPublishers(settings.publishers || []);
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
        authors: authors.filter(Boolean),
        translators: translators.filter(Boolean),
        publishers: publishers.filter(Boolean),
      };
      const success = await saveDropdownSettings(payload);
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

  // --- Type Handlers ---
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
          <div>
            <h2 className={panelStyles.title}>ตั้งค่าหมวดหมู่ & ภาษา</h2>
            <p style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', margin: '0.2rem 0 0 0' }}>
              ปรับแต่งโครงสร้างหมวดหมู่หนังสือและภาษาที่จะแสดงในฟอร์ม
            </p>
          </div>
          <button className={panelStyles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
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

              {/* Large List Editors */}
              <SearchableListEditor 
                title="ผู้แต่ง (Authors)"
                description="จัดการรายชื่อผู้แต่ง พิมพ์ค้นหาเพื่อแก้ไขหรือลบ"
                placeholder="ค้นหาชื่อผู้แต่ง..."
                items={authors}
                onChange={setAuthors}
              />
              
              <SearchableListEditor 
                title="ผู้แปล (Translators)"
                description="จัดการรายชื่อผู้แปล พิมพ์ค้นหาเพื่อแก้ไขหรือลบ"
                placeholder="ค้นหาชื่อผู้แปล..."
                items={translators}
                onChange={setTranslators}
              />
              
              <SearchableListEditor 
                title="สำนักพิมพ์ (Publishers)"
                description="จัดการรายชื่อสำนักพิมพ์ พิมพ์ค้นหาเพื่อแก้ไขหรือลบ"
                placeholder="ค้นหาชื่อสำนักพิมพ์..."
                items={publishers}
                onChange={setPublishers}
              />

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
