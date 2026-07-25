'use client';

import { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Plus, Trash2, RotateCcw } from 'lucide-react';
import { DEFAULT_FIELDS, loadBookFields, saveBookFields } from '@/lib/bookFields';
import styles from './page.module.css';

const TYPES = [
  { value: 'text', label: 'ข้อความ' },
  { value: 'select', label: 'ตัวเลือก' },
  { value: 'number', label: 'ตัวเลข' },
  { value: 'textarea', label: 'ข้อความยาว' },
  { value: 'bool', label: 'ใช่/ไม่ใช่' },
];

export default function FieldSettingsPage() {
  const [fields, setFields] = useState(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    loadBookFields().then(setFields);
  }, []);

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
    // A field without a key would silently never match a book property.
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
      setNote('บันทึกแล้ว');
    } catch (error) {
      console.error(error);
      setNote('บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (!fields) {
    return <p className={styles.loading}>กำลังโหลดการตั้งค่า…</p>;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>ตั้งค่าฟอร์มหนังสือ</h1>
          <p className={styles.sub}>
            กำหนดว่าฟิลด์ไหนแสดงในฟอร์มเพิ่มหนังสือ และฟิลด์ไหนเปิดให้ผู้อ่านใช้กรอง
            การตั้งค่าทั้งหมดเก็บเป็นเอกสารเดียวใน Firestore จึงอ่านแค่ครั้งเดียวต่อการเข้าชม
          </p>
        </div>
      </header>

      <div className={styles.tableHead}>
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

      <div className={styles.footer}>
        <button className="btn" onClick={addField}>
          <Plus size={15} /> เพิ่มฟิลด์
        </button>
        <button className="btn" onClick={() => setFields(DEFAULT_FIELDS)}>
          <RotateCcw size={15} /> คืนค่าเริ่มต้น
        </button>
        <span className={styles.spacer} />
        {note && <span className={styles.note}>{note}</span>}
        <button className="btn btn-solid" onClick={save} disabled={saving}>
          {saving ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
        </button>
      </div>
    </div>
  );
}
