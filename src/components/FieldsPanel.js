'use client';

import { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Plus, Trash2, RotateCcw, X } from 'lucide-react';
import { DEFAULT_FIELDS, loadBookFields, saveBookFields } from '@/lib/bookFields';
import { useToast } from '@/context/ToastContext';
import panelStyles from './BookFormPanel.module.css';
import styles from '@/app/admin/fields/page.module.css';

const TYPES = [
  { value: 'text', label: 'ข้อความ' },
  { value: 'select', label: 'ตัวเลือก' },
  { value: 'multi', label: 'ตัวเลือก (หลายค่า)' },
  { value: 'number', label: 'ตัวเลข' },
  { value: 'textarea', label: 'ข้อความยาว' },
  { value: 'bool', label: 'ใช่/ไม่ใช่' },
];

export default function FieldsPanel({ isOpen, onClose }) {
  const { toast } = useToast();
  const [fields, setFields] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');

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
    const fetchFields = async () => {
      setLoading(true);
      try {
        const f = await loadBookFields();
        if (isMounted) setFields(f);
      } catch (err) {
        if (isMounted) toast.error('โหลดการตั้งค่าฟิลด์ไม่สำเร็จ');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchFields();
    return () => { isMounted = false; };
  }, [isOpen, toast]);

  const update = (index, patch) =>
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));

  const move = (index, delta) =>
    setFields((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const remove = (index) =>
    setFields((prev) => prev.filter((_, i) => i !== index));

  const addField = () =>
    setFields((prev) => [
      ...prev,
      { key: '', label: '', type: 'text', form: true, filter: false },
    ]);

  const save = async () => {
    const invalid = fields.find((f) => !f.key.trim() || !f.label.trim());
    if (invalid) {
      setNote('กรุณากรอกชื่อฟิลด์ (key) และป้ายกำกับให้ครบทุกแถว');
      return;
    }
    const keys = fields.map((f) => f.key.trim());
    if (new Set(keys).size !== keys.length) {
      setNote('มีชื่อฟิลด์ (key) ซ้ำกัน');
      return;
    }

    setSaving(true);
    setNote('');
    try {
      await saveBookFields(fields.map((f) => ({ ...f, key: f.key.trim() })));
      toast.success('บันทึกการตั้งค่าฟิลด์สำเร็จ');
      onClose();
    } catch (error) {
      console.error(error);
      toast.error('บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={panelStyles.backdrop} onClick={onClose} />
      <div className={panelStyles.panel}>
        <div className={panelStyles.header}>
          <div>
            <h2 className={panelStyles.title}>ตั้งค่าฟอร์มหนังสือ</h2>
            <p style={{ fontSize: 'var(--t-small)', color: 'var(--fg-2)', margin: '0.2rem 0 0 0' }}>
              กำหนดว่าฟิลด์ไหนแสดงในฟอร์มเพิ่มหนังสือ และเปิดให้ใช้ตัวกรอง
            </p>
          </div>
          <button className={panelStyles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className={panelStyles.content}>
          {loading || !fields ? (
            <div className={panelStyles.loadingState}>กำลังโหลดข้อมูล...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              
              <div className={styles.tableHead} style={{ marginTop: 0, paddingRight: '2rem' }}>
                <span>ป้ายกำกับ</span>
                <span>ชื่อฟิลด์ (key)</span>
                <span>ชนิด</span>
                <span className={styles.center}>ในฟอร์ม</span>
                <span className={styles.center}>ตัวกรอง</span>
                <span />
              </div>

              <ul className={styles.rows}>
                {fields.map((field, i) => (
                  <li key={i} className={styles.row}>
                    <input
                      className={styles.input}
                      value={field.label}
                      placeholder="เช่น สำนักพิมพ์"
                      onChange={(e) => update(i, { label: e.target.value })}
                    />
                    <input
                      className={`${styles.input} ${styles.mono}`}
                      value={field.key}
                      placeholder="publisher"
                      disabled={field.locked}
                      onChange={(e) => update(i, { key: e.target.value })}
                    />
                    <select
                      className={styles.input}
                      value={field.type}
                      onChange={(e) => update(i, { type: e.target.value })}
                    >
                      {TYPES.map((t) => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>

                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={!!field.form}
                        onChange={(e) => update(i, { form: e.target.checked })}
                      />
                    </label>
                    <label className={styles.check}>
                      <input
                        type="checkbox"
                        checked={!!field.filter}
                        onChange={(e) => update(i, { filter: e.target.checked })}
                      />
                    </label>

                    <div className={styles.rowActs}>
                      <button onClick={() => move(i, -1)} disabled={i === 0} title="เลื่อนขึ้น">
                        <ArrowUp size={14} />
                      </button>
                      <button
                        onClick={() => move(i, 1)}
                        disabled={i === fields.length - 1}
                        title="เลื่อนลง"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        onClick={() => remove(i)}
                        disabled={field.locked}
                        title={field.locked ? 'ฟิลด์หลัก ลบไม่ได้' : 'ลบฟิลด์'}
                        className={styles.del}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                <button className="btn" onClick={addField}>
                  <Plus size={15} /> เพิ่มฟิลด์
                </button>
                <button className="btn" onClick={() => setFields(DEFAULT_FIELDS)}>
                  <RotateCcw size={15} /> คืนค่าเริ่มต้น
                </button>
              </div>
              
              {note && <div style={{ color: 'var(--hot)', fontSize: '0.9rem', marginTop: '0.5rem' }}>{note}</div>}

            </div>
          )}
        </div>

        <div className={panelStyles.footer}>
          <button type="button" className="btn" onClick={onClose} disabled={saving}>ยกเลิก</button>
          <button type="button" className="btn btn-solid" onClick={save} disabled={saving || loading}>
            {saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
          </button>
        </div>
      </div>
    </>
  );
}
