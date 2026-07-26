'use client';

import { useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { facetValues } from '@/lib/bookFields';
import Select from 'react-select';
import { selectStyles } from '@/lib/selectStyles';
import styles from './FilterRail.module.css';

/**
 * Reader-facing filters, built from the field config rather than hardcoded.
 * Options come from the books already loaded, so adding a filter costs no
 * extra Firestore reads.
 */
export default function FilterRail({ fields, books, active, onChange, onReset }) {
  const filterable = fields.filter((f) => f.filter);
  const activeCount = Object.values(active).filter(Boolean).length;

  return (
    <aside className={styles.rail}>
      <div className={styles.head}>
        <span className={styles.headTitle}>ตัวกรอง</span>
        {activeCount > 0 && (
          <button className={styles.reset} onClick={onReset}>
            ล้าง {activeCount}
          </button>
        )}
      </div>

      {filterable.map((field) => (
        <FilterGroup
          key={field.key}
          field={field}
          books={books}
          value={active[field.key] || ''}
          onChange={(v) => onChange(field.key, v)}
        />
      ))}

      {filterable.length === 0 && (
        <p className={styles.none}>ยังไม่ได้เปิดใช้ตัวกรอง</p>
      )}
    </aside>
  );
}

function FilterGroup({ field, books, value, onChange }) {
  const [open, setOpen] = useState(true);

  const options = facetValues(books, field.key);
  if (options.length === 0) return null;

  // Newest years first; everything else stays ranked by frequency.
  if (field.type === 'number') {
    options.sort((a, b) => Number(b.value) - Number(a.value));
  }

  const useSelect = options.length > 6;
  const selectOptions = options.map(o => ({ value: o.value, label: `${o.value} (${o.count})` }));
  const selectedOption = value ? selectOptions.find(o => o.value === value) : null;

  return (
    <section className={styles.group}>
      <button
        className={styles.groupHead}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {field.label}
        <ChevronDown
          size={15}
          className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
        />
      </button>

      {open && (
        <div className={styles.options}>
          {useSelect ? (
            <Select
              isClearable
              styles={selectStyles}
              options={selectOptions}
              value={selectedOption}
              onChange={(selected) => onChange(selected ? selected.value : '')}
              placeholder="ค้นหา..."
              classNamePrefix="react-select"
            />
          ) : (
            <>
              {value && (
                <button className={styles.selected} onClick={() => onChange('')}>
                  {value} <X size={12} />
                </button>
              )}
              {options
                .filter((o) => o.value !== value)
                .map((o) => (
                  <button
                    key={o.value}
                    className={styles.option}
                    onClick={() => onChange(o.value)}
                  >
                    <span className={styles.optionLabel}>{o.value}</span>
                    <span className={styles.optionCount}>{o.count}</span>
                  </button>
                ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
