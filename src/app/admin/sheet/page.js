'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, doc, writeBatch, query, orderBy } from 'firebase/firestore';
import { Save, Search, ArrowDownToLine, Undo2, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { getDropdownSettings } from '@/lib/settings';
import styles from './page.module.css';

/**
 * A spreadsheet over the library.
 *
 * Editing 362 books one slide-over form at a time is the wrong shape of tool:
 * the work is repetitive and columnar, so the interface should be too. Cells
 * are edited in place, keyboard navigation works the way a spreadsheet's does,
 * and one value can be pushed down a whole column at once.
 *
 * Nothing is written until Save, and only the rows that actually changed are
 * sent — a batch of 362 identical writes would cost a lot and change nothing.
 */

const COLUMNS = [
  { key: 'title', label: 'ชื่อเรื่อง', width: 300, type: 'text' },
  { key: 'author', label: 'ผู้แต่ง', width: 190, type: 'text' },
  { key: 'translator', label: 'ผู้แปล', width: 160, type: 'text' },
  { key: 'category', label: 'หมวดหมู่', width: 190, type: 'select', source: 'categories' },
  { key: 'type', label: 'ประเภท', width: 130, type: 'select', source: 'types' },
  { key: 'language', label: 'ภาษา', width: 110, type: 'select', source: 'languages' },
  { key: 'publisher', label: 'สำนักพิมพ์', width: 170, type: 'text' },
  { key: 'year', label: 'ปีพิมพ์', width: 90, type: 'text' },
  { key: 'pages', label: 'หน้า', width: 80, type: 'number' },
  { key: 'description', label: 'คำอธิบาย', width: 320, type: 'text' },
];

/** Firestore caps a batch at 500 writes. */
const BATCH_LIMIT = 400;

export default function SheetPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [rows, setRows] = useState([]);
  const [edits, setEdits] = useState({}); // { [bookId]: { field: value } }
  const [options, setOptions] = useState({ categories: [], types: [], languages: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState({ row: 0, col: 0 });

  const gridRef = useRef(null);

  // ------------------------------------------------------------------ load --

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const [snap, settings] = await Promise.all([
          getDocs(query(collection(db, 'books'), orderBy('createdAt', 'desc'))),
          getDropdownSettings(),
        ]);
        if (!alive) return;

        const list = [];
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
        setRows(list);

        // Categories are stored as groups; the sheet wants a flat list.
        const categories = (settings.categories || []).flatMap((g) =>
          (g.options || []).map((o) => o.value)
        );
        const languages = (settings.languages || []).map((l) => l.value || l);

        setOptions({
          categories,
          types: settings.types || [],
          languages,
        });
      } catch (err) {
        console.error(err);
        toast.error('โหลดข้อมูลไม่สำเร็จ');
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    return () => { alive = false; };
  }, [toast]);

  // ----------------------------------------------------------------- edits --

  const valueOf = useCallback(
    (row, key) => {
      const pending = edits[row.id];
      if (pending && key in pending) return pending[key];
      return row[key] ?? '';
    },
    [edits]
  );

  const setValue = useCallback((rowId, key, value, original) => {
    setEdits((prev) => {
      const next = { ...prev };
      const forRow = { ...(next[rowId] || {}) };

      // Typing a value back to what it was should clear the pending edit, so
      // the save count stays honest.
      if (String(value) === String(original ?? '')) delete forRow[key];
      else forRow[key] = value;

      if (Object.keys(forRow).length === 0) delete next[rowId];
      else next[rowId] = forRow;
      return next;
    });
  }, []);

  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.title ?? ''} ${r.author ?? ''} ${r.category ?? ''} ${r.sourceFile ?? ''}`
        .toLowerCase()
        .includes(needle)
    );
  }, [rows, filter]);

  const changedCount = Object.keys(edits).length;

  /** Copies the focused cell down every row below it — the spreadsheet staple. */
  const fillDown = () => {
    const column = COLUMNS[active.col];
    const source = visible[active.row];
    if (!column || !source) return;

    const value = valueOf(source, column.key);
    let touched = 0;

    visible.slice(active.row + 1).forEach((row) => {
      if (String(valueOf(row, column.key)) === String(value)) return;
      setValue(row.id, column.key, value, row[column.key]);
      touched += 1;
    });

    if (touched > 0) toast.success(`เติม "${value || '(ว่าง)'}" ลง ${touched} แถว`);
  };

  const revert = async () => {
    if (changedCount === 0) return;
    const agreed = await confirm({
      title: `ยกเลิกการแก้ไข ${changedCount} เล่ม?`,
      message: 'ค่าที่แก้ไว้แต่ยังไม่บันทึกจะหายทั้งหมด',
      confirmLabel: 'ทิ้งการแก้ไข',
      tone: 'danger',
    });
    if (!agreed) return;
    setEdits({});
  };

  // ------------------------------------------------------------------ save --

  const save = async () => {
    const ids = Object.keys(edits);
    if (ids.length === 0) return;

    setSaving(true);
    try {
      for (let i = 0; i < ids.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        for (const id of ids.slice(i, i + BATCH_LIMIT)) {
          const patch = { ...edits[id] };
          if ('pages' in patch) patch.pages = Number(patch.pages) || 0;
          batch.update(doc(db, 'books', id), patch);
        }
        await batch.commit();
      }

      setRows((prev) => prev.map((r) => (edits[r.id] ? { ...r, ...edits[r.id] } : r)));
      setEdits({});
      toast.success(`บันทึก ${ids.length} เล่มเรียบร้อย`);
    } catch (err) {
      console.error(err);
      toast.error('บันทึกไม่สำเร็จ — ยังไม่ได้ล้างการแก้ไข ลองใหม่ได้');
    } finally {
      setSaving(false);
    }
  };

  // Ctrl+S saves, because that is what hands expect in a grid.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** Moves focus the way a spreadsheet does. */
  const onCellKeyDown = (e, rowIndex, colIndex) => {
    const move = (dRow, dCol) => {
      e.preventDefault();
      const row = Math.min(Math.max(rowIndex + dRow, 0), visible.length - 1);
      const col = Math.min(Math.max(colIndex + dCol, 0), COLUMNS.length - 1);
      setActive({ row, col });
      gridRef.current
        ?.querySelector(`[data-cell="${row}-${col}"]`)
        ?.focus();
    };

    if (e.key === 'Enter' && !e.shiftKey) move(1, 0);
    else if (e.key === 'Enter' && e.shiftKey) move(-1, 0);
    else if (e.key === 'Tab' && !e.shiftKey) move(0, 1);
    else if (e.key === 'Tab' && e.shiftKey) move(0, -1);
    else if (e.key === 'ArrowDown' && e.ctrlKey) move(1, 0);
    else if (e.key === 'ArrowUp' && e.ctrlKey) move(-1, 0);
    else if (e.key === 'd' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      fillDown();
    }
  };

  if (loading) {
    return <div className="container" style={{ paddingTop: '3rem' }}>กำลังโหลดตาราง…</div>;
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.head}>
        <div>
          <p className="eyebrow">ผู้ดูแลระบบ</p>
          <h1 className={styles.title}>แก้ไขแบบตาราง</h1>
        </div>

        <div className={styles.tools}>
          <div className={styles.searchWrap}>
            <Search size={15} className={styles.searchIcon} />
            <input
              className={styles.search}
              type="search"
              placeholder="กรองรายการ…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <button className="btn" onClick={fillDown} title="เติมค่าจากช่องที่เลือกลงทุกแถวข้างล่าง (Ctrl+D)">
            <ArrowDownToLine size={16} /> เติมลงล่าง
          </button>

          <button className="btn" onClick={revert} disabled={changedCount === 0}>
            <Undo2 size={16} /> ยกเลิก
          </button>

          <button className="btn btn-solid" onClick={save} disabled={changedCount === 0 || saving}>
            {saving ? <Loader2 size={16} className={styles.spin} /> : <Save size={16} />}
            {saving ? 'กำลังบันทึก…' : `บันทึก ${changedCount || ''}`}
          </button>
        </div>
      </header>

      <p className={styles.hint}>
        คลิกช่องแล้วพิมพ์ได้เลย · <kbd>Tab</kbd> ไปช่องขวา · <kbd>Enter</kbd> ลงแถวล่าง ·
        <kbd>Ctrl</kbd>+<kbd>D</kbd> เติมค่าลงทุกแถวข้างล่าง · <kbd>Ctrl</kbd>+<kbd>S</kbd> บันทึก
        {changedCount > 0 && <strong className={styles.dirty}> · แก้ไขค้างอยู่ {changedCount} เล่ม</strong>}
      </p>

      <div className={styles.gridWrap} ref={gridRef}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th className={styles.rowNum}>#</th>
              {COLUMNS.map((c) => (
                <th key={c.key} style={{ minWidth: c.width }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, rowIndex) => {
              const dirty = Boolean(edits[row.id]);
              return (
                <tr key={row.id} className={dirty ? styles.rowDirty : undefined}>
                  <td className={styles.rowNum}>{rowIndex + 1}</td>

                  {COLUMNS.map((c, colIndex) => {
                    const value = valueOf(row, c.key);
                    const changed = Boolean(edits[row.id]?.[c.key] !== undefined);
                    const focused = active.row === rowIndex && active.col === colIndex;

                    return (
                      <td key={c.key} className={changed ? styles.cellDirty : undefined}>
                        {c.type === 'select' ? (
                          <select
                            data-cell={`${rowIndex}-${colIndex}`}
                            className={`${styles.cell} ${focused ? styles.cellOn : ''}`}
                            value={value}
                            onFocus={() => setActive({ row: rowIndex, col: colIndex })}
                            onKeyDown={(e) => onCellKeyDown(e, rowIndex, colIndex)}
                            onChange={(e) => setValue(row.id, c.key, e.target.value, row[c.key])}
                          >
                            <option value="">—</option>
                            {(options[c.source] || []).map((o) => (
                              <option key={o} value={o}>{o}</option>
                            ))}
                            {/* Keep a value the dropdown no longer offers rather
                                than silently blanking it. */}
                            {value && !(options[c.source] || []).includes(value) && (
                              <option value={value}>{value} (ไม่อยู่ในลิสต์)</option>
                            )}
                          </select>
                        ) : (
                          <input
                            data-cell={`${rowIndex}-${colIndex}`}
                            className={`${styles.cell} ${focused ? styles.cellOn : ''}`}
                            type={c.type === 'number' ? 'number' : 'text'}
                            value={value}
                            onFocus={() => setActive({ row: rowIndex, col: colIndex })}
                            onKeyDown={(e) => onCellKeyDown(e, rowIndex, colIndex)}
                            onChange={(e) => setValue(row.id, c.key, e.target.value, row[c.key])}
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        {visible.length === 0 && (
          <p className={styles.empty}>
            {rows.length === 0 ? 'ยังไม่มีหนังสือในคลัง' : 'ไม่พบรายการที่ตรงกับคำกรอง'}
          </p>
        )}
      </div>
    </div>
  );
}
