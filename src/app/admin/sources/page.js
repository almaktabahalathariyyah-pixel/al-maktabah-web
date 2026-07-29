'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Plus, Trash2, Save, ArrowUp, ArrowDown, ExternalLink, Compass, TriangleAlert,
  Search, X, ChevronDown, ChevronsDownUp, ChevronsUpDown, Copy,
  Globe, MonitorPlay, Send, Users, HardDrive, Library, Link2,
} from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { loadSources, saveSources, SOURCE_KINDS, kindOf, isSafeUrl } from '@/lib/sources';
import styles from './page.module.css';

/** Same map the public page keeps, for the same reason: lib/sources stays
    free of lucide so a server component can import it. */
const ICONS = { Globe, MonitorPlay, Send, Users, HardDrive, Library, Link2 };

const blank = () => ({
  id: `source-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  kind: 'website',
  title: '',
  description: '',
  url: '',
});

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Two entries pointing at the same place, ignoring trailing slash and case. */
function urlKey(url) {
  const trimmed = String(url || '').trim().toLowerCase().replace(/\/+$/, '');
  return trimmed;
}

export default function AdminSourcesPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // A hundred links do not fit on a screen, so the list is a list: one line
  // each, opened only when it is the one being edited.
  const [openIds, setOpenIds] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [flagFilter, setFlagFilter] = useState(''); // '' | 'problem' | 'duplicate'
  const scrollTo = useRef(null);

  useEffect(() => {
    let alive = true;
    loadSources()
      .then((loaded) => alive && setItems(loaded))
      .catch(() => alive && toast.error('โหลดรายการแหล่งหนังสือไม่สำเร็จ'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [toast]);

  // Losing an afternoon of edits to a stray back-gesture is the one failure
  // this page can actually prevent.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const patch = (id, changes) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...changes } : it)));
    setDirty(true);
  };

  const toggleOpen = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const add = () => {
    const item = blank();
    // A blank row matches no search and no kind chip, so it would be added
    // straight into a filtered-out limbo. Clear the view first.
    setQuery('');
    setKindFilter('');
    setFlagFilter('');
    setItems((prev) => [...prev, item]);
    setOpenIds((prev) => new Set(prev).add(item.id));
    setDirty(true);
    scrollTo.current = item.id;
  };

  useEffect(() => {
    if (!scrollTo.current) return;
    const el = document.getElementById(`source-row-${scrollTo.current}`);
    scrollTo.current = null;
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.querySelector('input[type="text"]')?.focus();
  }, [items]);

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
  const move = (id, delta) => {
    setItems((prev) => {
      const index = prev.findIndex((it) => it.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  };

  // Rows the public page would silently drop, named here instead.
  const problems = useMemo(
    () => items.filter((it) => !it.title.trim() || !isSafeUrl(it.url)),
    [items]
  );

  // At a hundred links, pasting the same one twice is a matter of when.
  const duplicateKeys = useMemo(() => {
    const seen = new Map();
    items.forEach((it) => {
      const key = urlKey(it.url);
      if (!key) return;
      seen.set(key, (seen.get(key) || 0) + 1);
    });
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([key]) => key));
  }, [items]);

  const duplicates = items.filter((it) => duplicateKeys.has(urlKey(it.url)));

  const kindCounts = useMemo(() => {
    const counts = new Map();
    items.forEach((it) => counts.set(it.kind, (counts.get(it.kind) || 0) + 1));
    return counts;
  }, [items]);

  const needle = query.trim().toLowerCase();
  const shown = items.filter((it) => {
    if (kindFilter && it.kind !== kindFilter) return false;
    if (flagFilter === 'problem' && !(!it.title.trim() || !isSafeUrl(it.url))) return false;
    if (flagFilter === 'duplicate' && !duplicateKeys.has(urlKey(it.url))) return false;
    if (!needle) return true;
    return `${it.title} ${it.url} ${it.description}`.toLowerCase().includes(needle);
  });

  const filtering = Boolean(needle || kindFilter || flagFilter);
  const allShownOpen = shown.length > 0 && shown.every((it) => openIds.has(it.id));

  const toggleAllShown = () => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (allShownOpen) shown.forEach((it) => next.delete(it.id));
      else shown.forEach((it) => next.add(it.id));
      return next;
    });
  };

  const clearFilters = () => {
    setQuery('');
    setKindFilter('');
    setFlagFilter('');
  };

  const save = async () => {
    if (problems.length > 0) {
      toast.error(
        `ยังมี ${problems.length} รายการที่กรอกไม่ครบ — ต้องมีชื่อ และลิงก์ที่ขึ้นต้นด้วย http:// หรือ https://`
      );
      setFlagFilter('problem');
      setQuery('');
      setKindFilter('');
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
          {filtering ? `${shown.length} / ${items.length} รายการ` : `${items.length} รายการ`}
          {dirty && <span className={styles.dirty}>ยังไม่ได้บันทึก</span>}
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

      {items.length > 0 && (
        <div className={styles.tools}>
          <div className={styles.searchWrap}>
            <Search size={16} className={styles.searchIcon} aria-hidden />
            <input
              type="text"
              className={styles.search}
              value={query}
              placeholder="ค้นหาชื่อ ลิงก์ หรือคำอธิบาย…"
              onChange={(e) => setQuery(e.target.value)}
              aria-label="ค้นหาแหล่งหนังสือ"
            />
            {query && (
              <button className={styles.searchClear} onClick={() => setQuery('')} aria-label="ล้างคำค้น">
                <X size={14} />
              </button>
            )}
          </div>

          <button
            className={`btn ${styles.expandBtn}`}
            onClick={toggleAllShown}
            disabled={shown.length === 0}
          >
            {allShownOpen ? <ChevronsDownUp size={16} /> : <ChevronsUpDown size={16} />}
            <span>{allShownOpen ? 'ปิดทั้งหมด' : 'เปิดทั้งหมด'}</span>
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className={styles.chips} role="group" aria-label="กรองรายการ">
          <button
            className={`chip ${!kindFilter && !flagFilter ? 'chip-on' : ''}`}
            onClick={clearFilters}
          >
            ทั้งหมด <span className={styles.chipCount}>{items.length}</span>
          </button>

          {SOURCE_KINDS.filter((k) => (kindCounts.get(k.key) || 0) > 0).map((k) => (
            <button
              key={k.key}
              className={`chip ${kindFilter === k.key ? 'chip-on' : ''}`}
              onClick={() => { setKindFilter(kindFilter === k.key ? '' : k.key); setFlagFilter(''); }}
            >
              {k.label} <span className={styles.chipCount}>{kindCounts.get(k.key)}</span>
            </button>
          ))}

          {problems.length > 0 && (
            <button
              className={`chip ${styles.chipWarn} ${flagFilter === 'problem' ? styles.chipWarnOn : ''}`}
              onClick={() => { setFlagFilter(flagFilter === 'problem' ? '' : 'problem'); setKindFilter(''); }}
            >
              <TriangleAlert size={13} /> กรอกไม่ครบ <span className={styles.chipCount}>{problems.length}</span>
            </button>
          )}

          {duplicates.length > 0 && (
            <button
              className={`chip ${styles.chipWarn} ${flagFilter === 'duplicate' ? styles.chipWarnOn : ''}`}
              onClick={() => { setFlagFilter(flagFilter === 'duplicate' ? '' : 'duplicate'); setKindFilter(''); }}
            >
              <Copy size={13} /> ลิงก์ซ้ำ <span className={styles.chipCount}>{duplicates.length}</span>
            </button>
          )}
        </div>
      )}

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
      ) : shown.length === 0 ? (
        <div className={styles.empty}>
          <p className={styles.emptyLead}>ไม่พบรายการที่ค้นหา</p>
          <p className={styles.emptyBody}>ลองเปลี่ยนคำค้น หรือล้างตัวกรองเพื่อดูทั้งหมด</p>
          <button className="btn" onClick={clearFilters}>ล้างตัวกรอง</button>
        </div>
      ) : (
        <ul className={styles.rows}>
          {shown.map((item) => {
            const index = items.indexOf(item);
            const kind = kindOf(item.kind);
            const Icon = ICONS[kind.icon] || Link2;
            const badUrl = item.url.trim() !== '' && !isSafeUrl(item.url);
            const incomplete = !item.title.trim() || !isSafeUrl(item.url);
            const duplicated = duplicateKeys.has(urlKey(item.url));
            const open = openIds.has(item.id);
            const host = hostOf(item.url);

            return (
              <li
                key={item.id}
                id={`source-row-${item.id}`}
                className={`${styles.row} ${open ? styles.rowOpen : ''} ${incomplete ? styles.rowBad : ''}`}
              >
                <div className={styles.summary}>
                  <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => toggleOpen(item.id)}
                    aria-expanded={open}
                    aria-controls={`source-fields-${item.id}`}
                  >
                    <ChevronDown size={16} className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden />
                    <span className={styles.rowNum}>{index + 1}</span>
                    <Icon size={15} className={styles.kindIcon} aria-hidden />
                    <span className={styles.rowTitle}>
                      {item.title.trim() || <span className={styles.untitled}>(ยังไม่ได้ตั้งชื่อ)</span>}
                    </span>
                    <span className={styles.rowHost}>{host || item.url || '—'}</span>
                    {incomplete && (
                      <span className={styles.tagBad} title="ยังกรอกไม่ครบ — จะไม่ขึ้นในหน้าเว็บ">
                        <TriangleAlert size={12} /> ไม่ครบ
                      </span>
                    )}
                    {duplicated && !incomplete && (
                      <span className={styles.tagDup} title="ลิงก์นี้ซ้ำกับรายการอื่น">
                        <Copy size={12} /> ซ้ำ
                      </span>
                    )}
                  </button>

                  <div className={styles.rowActs}>
                    <button
                      className={styles.iconBtn}
                      onClick={() => move(item.id, -1)}
                      disabled={index === 0 || filtering}
                      aria-label="เลื่อนขึ้น"
                      title={filtering ? 'ล้างตัวกรองก่อนจึงจะสลับลำดับได้' : 'เลื่อนขึ้น'}
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      className={styles.iconBtn}
                      onClick={() => move(item.id, 1)}
                      disabled={index === items.length - 1 || filtering}
                      aria-label="เลื่อนลง"
                      title={filtering ? 'ล้างตัวกรองก่อนจึงจะสลับลำดับได้' : 'เลื่อนลง'}
                    >
                      <ArrowDown size={15} />
                    </button>

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
                </div>

                {open && (
                  <div className={styles.fields} id={`source-fields-${item.id}`}>
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
                      {duplicated && !badUrl && (
                        <span className={styles.fieldWarn}>
                          ลิงก์นี้ซ้ำกับรายการอื่นในลิสต์
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
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
