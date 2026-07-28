'use client';

import { useState, useMemo } from 'react';
import { Plus, Trash2, Search, X } from 'lucide-react';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import styles from '@/app/admin/settings/page.module.css';

export default function SearchableListEditor({ title, description, placeholder, items, onChange }) {
  const [query, setQuery] = useState('');
  const [newItem, setNewItem] = useState('');
  const { toast } = useToast();
  const { confirm } = useConfirm();

  // Filter items based on search query
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 50); // Show max 50 to avoid lagging if no query
    return items.filter(item => item.toLowerCase().includes(q)).slice(0, 100);
  }, [items, query]);

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
    setQuery(val); // show the newly added item
  };

  const handleRemove = async (itemToRemove) => {
    const agreed = await confirm({
      title: `ลบ “${itemToRemove}”?`,
      message: `เอาออกจากรายการ${title} — หนังสือที่ใช้ชื่อนี้อยู่จะไม่ถูกแก้`,
      confirmLabel: 'ลบรายการนี้',
      tone: 'danger',
    });
    if (!agreed) return;
    onChange(items.filter(i => i !== itemToRemove));
  };

  const handleUpdate = (oldItem, newVal) => {
    const val = newVal.trim();
    if (!val || val === oldItem) return;
    if (items.includes(val)) {
      toast.info(`“${val}” มีอยู่ในรายการแล้ว`);
      return;
    }
    onChange(items.map(i => i === oldItem ? val : i));
  };

  return (
    <section className={styles.section} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', border: '1px solid var(--border)', padding: '1.5rem', borderRadius: 'var(--r-md)', background: 'var(--surface)' }}>
      <div>
        <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem' }}>{title} <span style={{ fontSize: '0.85rem', color: 'var(--fg-3)', fontWeight: 'normal' }}>({items.length} รายการ)</span></h3>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--fg-2)' }}>{description}</p>
      </div>

      {/* Add new item form */}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={`+ เพิ่ม${title}ใหม่`}
          style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface-2)' }}
        />
        <button type="submit" className="btn btn-solid" disabled={!newItem.trim()}>
          <Plus size={16} /> เพิ่ม
        </button>
      </form>

      {/* Search box */}
      <div style={{ position: 'relative' }}>
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
          filteredItems.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input 
                type="text"
                value={item}
                onChange={(e) => handleUpdate(item, e.target.value)}
                style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: '0.9rem' }}
              />
              <button 
                type="button" 
                onClick={() => handleRemove(item)} 
                title="ลบ" 
                style={{ padding: '0.5rem', border: 'none', background: 'var(--surface-2)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--hot)' }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
        {items.length > 50 && !query && (
          <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--fg-3)', marginTop: '0.5rem' }}>
            แสดงเฉพาะ 50 รายการแรก (พิมพ์ค้นหาเพื่อดูรายชื่ออื่นๆ)
          </div>
        )}
      </div>
    </section>
  );
}
