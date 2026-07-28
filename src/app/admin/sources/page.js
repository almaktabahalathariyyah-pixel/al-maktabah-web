'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus, Trash2, Save, ArrowUp, ArrowDown, ExternalLink, Compass, TriangleAlert,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { loadSources, saveSources, SOURCE_KINDS, kindOf, isSafeUrl } from '@/lib/sources';
import styles from './page.module.css';

const blank = () => ({
  id: `source-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  kind: 'website',
  title: '',
  description: '',
  url: '',
});

export default function AdminSourcesPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    loadSources()
      .then((loaded) => alive && setItems(loaded))
      .catch(() => alive && toast.error('โหลดรายการแหล่งหนังสือไม่สำเร็จ'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [toast]);

  const patch = (id, changes) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...changes } : it)));
    setDirty(true);
  };

  const add = () => {
    setItems((prev) => [...prev, blank()]);
    setDirty(true);
  };

  const remove = async (id) => {
    const target = items.find((it) => it.id === id);
    // An untouched blank row is not worth a dialog.
    if (target?.title || target?.url) {
      const agreed = await confirm({
        title: 'ลบแหล่งนี้ออกจากรายการ?',
        message: target.title || target.url,
        confirmLabel: 'ลบแหล่งนี้',
        tone: 'danger',
      });
      if (!agreed) return;
    }
    setItems((prev) => prev.filter((it) => it.id !== id));
    setDirty(true);
  };

  /** Reordering is what sets the order readers see, so it is explicit. */
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  // Rows the public page would silently drop, named here instead.
  const problems = items.filter((it) => !it.title.trim() || !isSafeUrl(it.url));

  const save = async () => {
    if (problems.length > 0) {
      toast.error(
        `ยังมี ${problems.length} รายการที่กรอกไม่ครบ — ต้องมีชื่อ และลิงก์ที่ขึ้นต้นด้วย http:// หรือ https://`
      );
      return;
    }

    setSaving(true);
    try {
      await saveSources(items);
      setDirty(false);
      toast.success(`บันทึกแหล่งหนังสือ ${items.length} รายการแล้ว`);
    } catch (err) {
      console.error(err);
      toast.error('บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className={styles.gate}>กำลังโหลด…</div>;
  }

  return (
    <div>
      <header className={`${styles.header} rise`}>
        <p className="eyebrow">แผงควบคุม</p>
        <h1 className={styles.title}>แหล่งหนังสืออื่นๆ</h1>
        <p className="lede">
          ลิงก์ที่รวบรวมไว้ในหน้า{' '}
          <Link href="/sources" className="tlink">แหล่งหนังสืออื่นๆ</Link>{' '}
          — เว็บไซต์ ช่องยูทูป ช่องเทเลแกรม เพจเฟซบุ๊ก หรือโฟลเดอร์ไดรฟ์
          ลำดับที่เรียงไว้ตรงนี้คือลำดับที่ผู้อ่านเห็น
        </p>
      </header>

      <div className={styles.bar}>
        <span className={styles.count}>
          {items.length} รายการ
          {problems.length > 0 && (
            <span className={styles.warn}>
              <TriangleAlert size={13} /> กรอกไม่ครบ {problems.length}
            </span>
          )}
          {dirty && problems.length === 0 && (
            <span className={styles.dirty}>ยังไม่ได้บันทึก</span>
          )}
        </span>

        <div className={styles.barActs}>
          <button className="btn" onClick={add}>
            <Plus size={16} /> เพิ่มแหล่ง
          </button>
          <button className="btn btn-solid" onClick={save} disabled={saving || !dirty}>
            <Save size={16} /> {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyIcon}><Compass size={22} /></span>
          <p className={styles.emptyLead}>ยังไม่มีแหล่งหนังสือ</p>
          <p className={styles.emptyBody}>
            กด &ldquo;เพิ่มแหล่ง&rdquo; แล้วกรอกชื่อกับลิงก์ จะขึ้นในหน้าเว็บทันทีที่บันทึก
          </p>
          <button className="btn btn-solid" onClick={add}>
            <Plus size={16} /> เพิ่มแหล่งแรก
          </button>
        </div>
      ) : (
        <ul className={styles.rows}>
          {items.map((item, index) => {
            const kind = kindOf(item.kind);
            const badUrl = item.url.trim() !== '' && !isSafeUrl(item.url);

            return (
              <li key={item.id} className={styles.row}>
                <div className={styles.rowHead}>
                  <span className={styles.rowNum}>{index + 1}</span>

                  <div className={styles.rowOrder}>
                    <button
                      className={styles.iconBtn}
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="เลื่อนขึ้น"
                      title="เลื่อนขึ้น"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      className={styles.iconBtn}
                      onClick={() => move(index, 1)}
                      disabled={index === items.length - 1}
                      aria-label="เลื่อนลง"
                      title="เลื่อนลง"
                    >
                      <ArrowDown size={15} />
                    </button>
                  </div>

                  {isSafeUrl(item.url) && (
                    <a
                      className={styles.iconBtn}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="เปิดลิงก์นี้ดู"
                      aria-label="เปิดลิงก์นี้ดู"
                    >
                      <ExternalLink size={15} />
                    </a>
                  )}

                  <button
                    className={`${styles.iconBtn} ${styles.iconDanger}`}
                    onClick={() => remove(item.id)}
                    title="ลบแหล่งนี้"
                    aria-label="ลบแหล่งนี้"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span className={styles.label}>ประเภท</span>
                    <select
                      value={item.kind}
                      onChange={(e) => patch(item.id, { kind: e.target.value })}
                    >
                      {SOURCE_KINDS.map((k) => (
                        <option key={k.key} value={k.key}>{k.label}</option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>ชื่อแหล่ง</span>
                    <input
                      type="text"
                      value={item.title}
                      placeholder="เช่น ห้องสมุดอิสลามออนไลน์"
                      onChange={(e) => patch(item.id, { title: e.target.value })}
                    />
                  </label>

                  <label className={`${styles.field} ${styles.wide}`}>
                    <span className={styles.label}>ลิงก์</span>
                    <input
                      type="url"
                      inputMode="url"
                      value={item.url}
                      placeholder={kind.hint}
                      onChange={(e) => patch(item.id, { url: e.target.value })}
                      aria-invalid={badUrl || undefined}
                    />
                    {badUrl && (
                      <span className={styles.fieldErr}>
                        ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://
                      </span>
                    )}
                  </label>

                  <label className={`${styles.field} ${styles.wide}`}>
                    <span className={styles.label}>คำอธิบายสั้นๆ (ไม่บังคับ)</span>
                    <textarea
                      rows={2}
                      value={item.description}
                      placeholder="บอกผู้อ่านสั้นๆ ว่าแหล่งนี้มีอะไร"
                      onChange={(e) => patch(item.id, { description: e.target.value })}
                    />
                  </label>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
