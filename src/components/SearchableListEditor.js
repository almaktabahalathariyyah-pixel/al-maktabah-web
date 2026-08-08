'use client';

import { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Search, X, AlertTriangle } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { nameProblem } from '@/lib/nameQuality';
import styles from '@/app/admin/settings/page.module.css';

/**
 * One name, committed when the field is left rather than on every keystroke.
 *
 * Typing "กวิน" into a controlled input used to fire four separate renames,
 * one per character — invisible when the list only lived in this component,
 * but the parent now records each rename so it can rewrite the books using
 * that name, and four half-typed names are four wrong rewrites.
 */
function EditableRow({ value, problem, checkable, checked, onToggle, onCommit, onRemove }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  // A merge the owner declines leaves the typed text sitting in the field
  // while the list still holds the old name, so the row has to put the old
  // name back itself — `value` never changed, so nothing else will.
  const commit = async () => {
    const next = draft.trim();
    if (!next || next === value) { setDraft(value); return; }
    const accepted = await onCommit(value, next);
    if (!accepted) setDraft(value);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      {checkable && (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={`เลือก ${value}`}
          style={{ flex: 'none', width: '1.05rem', height: '1.05rem' }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
            if (e.key === 'Escape') setDraft(value);
          }}
          style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: '0.9rem' }}
        />
        {problem && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.25rem', fontSize: '0.75rem', color: 'var(--fg-3)' }}>
            <AlertTriangle size={11} /> {problem}
          </span>
        )}
      </div>
      <button type="button" onClick={onRemove} title="ลบ" className="icon-btn icon-btn-danger">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export default function SearchableListEditor({
  title, description, placeholder, items, onChange, onRename, onDelete,
  // The junk heuristic judges PERSON names — "looks like a computer account",
  // "reads as a sentence". Those verdicts mean nothing about a subject
  // heading, so lists that are not names opt out rather than be told their
  // categories look suspicious.
  reviewable = true,
}) {
  const [query, setQuery] = useState('');
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);
  // Review mode: show only what the heuristic doubts, with a checkbox each.
  const [reviewing, setReviewing] = useState(false);
  const [checked, setChecked] = useState(() => new Set());
  const { toast } = useToast();
  const { confirm } = useConfirm();

  /** Entry → why it does not look like a name, for the ones that do not. */
  const problems = useMemo(() => {
    const map = new Map();
    if (!reviewable) return map;
    for (const item of items) {
      const reason = nameProblem(item);
      if (reason) map.set(item, reason);
    }
    return map;
  }, [items, reviewable]);

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    if (reviewing) return items.filter((item) => problems.has(item));
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 50); // Show max 50 to avoid lagging if no query
    return items.filter(item => item.toLowerCase().includes(q)).slice(0, 100);
  }, [items, query, reviewing, problems]);

  // Everything flagged starts ticked: the owner is here to clear junk, so the
  // work is unticking the few real names, not ticking the forty wrong ones.
  const startReview = () => {
    setReviewing(true);
    setQuery('');
    setChecked(new Set(problems.keys()));
  };

  const toggleChecked = (item) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });

  const removeChecked = async () => {
    const names = [...checked].filter((name) => items.includes(name));
    if (names.length === 0) return;

    const agreed = await confirm({
      title: `ลบ ${names.length} รายการ?`,
      message:
        `เอาออกจากรายการ${title} และลบชื่อเหล่านี้ออกจากหนังสือทุกเล่มที่ใช้อยู่:\n\n` +
        `${names.slice(0, 15).join('\n')}` +
        `${names.length > 15 ? `\n…และอีก ${names.length - 15} รายการ` : ''}`,
      confirmLabel: `ลบ ${names.length} รายการ`,
      tone: 'danger',
    });
    if (!agreed) return;

    const doomed = new Set(names);
    onChange(items.filter((i) => !doomed.has(i)));
    if (onDelete) names.forEach((name) => onDelete(name));
    setChecked(new Set());
    setReviewing(false);
  };

  const handleAdd = (e) => {
    e.preventDefault();
    const val = newItem.trim();
    if (!val) return;
    if (items.includes(val)) {
      toast.info(`“${val}” มีอยู่ในรายการแล้ว`);
      return;
    }
    onChange([...items, val]);
    setNewItem('');
    setAdding(false);
    setQuery(val); // show the newly added item
  };

  const handleRemove = async (itemToRemove) => {
    const agreed = await confirm({
      title: `ลบ “${itemToRemove}”?`,
      message: `เอาออกจากรายการ${title} และลบชื่อนี้ออกจากหนังสือทุกเล่มที่ใช้อยู่`,
      confirmLabel: 'ลบรายการนี้',
      tone: 'danger',
    });
    if (!agreed) return;
    onChange(items.filter(i => i !== itemToRemove));
    if (onDelete) onDelete(itemToRemove);
  };

  /**
   * Returns whether the edit was accepted, so a declined merge can put the
   * old name back in the field it was typed over.
   */
  const handleUpdate = async (oldItem, newVal) => {
    const val = newVal.trim();
    if (!val || val === oldItem) return false;

    // Typing one entry's name onto another is how the same person spelled two
    // ways gets fixed — which is a merge, not a collision. Refusing it, as
    // this used to, left the duplicate with no way to resolve it at all.
    if (items.includes(val)) {
      const agreed = await confirm({
        title: `รวม “${oldItem}” เข้ากับ “${val}”?`,
        message:
          `“${val}” มีอยู่ในรายการแล้ว หนังสือที่ใช้ “${oldItem}” จะย้ายไปใช้ “${val}” แทน ` +
          `และ “${oldItem}” จะหายไปจากรายการ`,
        confirmLabel: 'รวมเป็นชื่อเดียว',
      });
      if (!agreed) return false;
      onChange(items.filter((i) => i !== oldItem));
      if (onRename) onRename(oldItem, val);
      return true;
    }

    onChange(items.map(i => i === oldItem ? val : i));
    if (onRename) onRename(oldItem, val);
    return true;
  };

  return (
    <section className={styles.section} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: 'var(--r-md)', background: 'var(--surface)' }}>
      <div>
        <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem' }}>{title} <span style={{ fontSize: '0.85rem', color: 'var(--fg-3)', fontWeight: 'normal' }}>({items.length} รายการ)</span></h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--fg-2)' }}>{description}</p>
      </div>

      {/* Adding used to sit directly above searching, two identical-looking
          text fields a few pixels apart, and typing a name to look for it
          into the top one created it instead. Adding is now behind a button:
          it is the rarer job here — names arrive by themselves when a book is
          saved — and it cannot be done by accident. */}
      {adding ? (
        <form onSubmit={handleAdd} className={styles.addRow}>
          <input
            type="text"
            value={newItem}
            autoFocus
            onChange={(e) => setNewItem(e.target.value)}
            placeholder={`ชื่อ${title}ที่จะเพิ่ม`}
            style={{ flex: 1, minWidth: 0, padding: '0.5rem 0.75rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--accent)', background: 'var(--surface-2)' }}
          />
          <button type="submit" className="btn btn-solid" disabled={!newItem.trim()}>
            <Plus size={16} /> เพิ่ม
          </button>
          <button type="button" className="btn" onClick={() => { setAdding(false); setNewItem(''); }}>
            ยกเลิก
          </button>
        </form>
      ) : (
        <button type="button" className={`btn ${styles.addOpen}`} onClick={() => setAdding(true)}>
          <Plus size={16} /> เพิ่ม{title}ใหม่
        </button>
      )}

      {/* Junk review. Only offered when there is something to review. */}
      {problems.size > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
          {!reviewing ? (
            <>
              <button type="button" className="btn" onClick={startReview}>
                <AlertTriangle size={15} /> ตรวจชื่อที่น่าสงสัย ({problems.size})
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--fg-3)' }}>
                ชื่อที่น่าจะมาจากข้อมูลในไฟล์ PDF มากกว่าจะเป็นชื่อคนจริง
              </span>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn"
                onClick={removeChecked}
                disabled={checked.size === 0}
                style={{ color: 'var(--hot)' }}
              >
                <Trash2 size={15} /> ลบที่เลือก ({checked.size})
              </button>
              <button type="button" className="btn" onClick={() => { setReviewing(false); setChecked(new Set()); }}>
                ยกเลิก
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--fg-3)' }}>
                ติ๊กไว้ให้แล้วทุกชื่อ — เอาติ๊กออกจากชื่อที่เป็นคนจริง แล้วค่อยกดลบ
              </span>
            </>
          )}
        </div>
      )}

      {/* Search box */}
      <div style={{ position: 'relative', display: reviewing ? 'none' : 'block' }}>
        <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-3)' }} />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder || `ค้นหาจาก ${items.length} รายการ...`}
          style={{ width: '100%', padding: '0.5rem 0.75rem 0.5rem 2.25rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: '0.9rem' }}
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', padding: '4px' }}>
            <X size={14} />
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
        {filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--fg-3)', fontSize: '0.9rem' }}>
            ไม่พบรายชื่อที่ค้นหา
          </div>
        ) : (
          filteredItems.map((item) => (
            <EditableRow
              key={item}
              value={item}
              problem={problems.get(item)}
              checkable={reviewing}
              checked={checked.has(item)}
              onToggle={() => toggleChecked(item)}
              onCommit={handleUpdate}
              onRemove={() => handleRemove(item)}
            />
          ))
        )}
        {items.length > 50 && !query && !reviewing && (
          <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--fg-3)', marginTop: '0.5rem' }}>
            แสดงเฉพาะ 50 รายการแรก (พิมพ์ค้นหาเพื่อดูรายชื่ออื่นๆ)
          </div>
        )}
      </div>
    </section>
  );
}
