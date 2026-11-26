'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  CopyCheck, Trash2, Merge, RefreshCw, Download, ExternalLink, CheckCircle2, Search,
} from 'lucide-react';
import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { loadAllBooks } from '@/lib/bookCatalog';
import { bumpCatalogRev } from '@/lib/catalogRev';
import { renameInBooks } from '@/lib/renameName';
import { getDropdownSettings, saveDropdownSettings } from '@/lib/settings';
import { findDuplicateBooks, findDuplicateNames } from '@/lib/dedupe';
import { joinPeople } from '@/lib/people';
import BookCover from '@/components/BookCover';
import { useToast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import styles from './page.module.css';

const TABS = [
  { id: 'books', label: 'หนังสือซ้ำ' },
  { id: 'author', label: 'ผู้แต่งซ้ำ', listKey: 'authors', isMulti: true },
  { id: 'translator', label: 'ผู้แปลซ้ำ', listKey: 'translators', isMulti: true },
  { id: 'publisher', label: 'สำนักพิมพ์ซ้ำ', listKey: 'publishers', isMulti: false },
];

export default function DuplicatesPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('books');
  const [filterText, setFilterText] = useState('');
  const [busyKey, setBusyKey] = useState('');
  const [targets, setTargets] = useState({}); // groupKey -> chosen canonical name

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await loadAllBooks();
      setBooks(all);
    } catch (err) {
      console.error('Failed to load books for dedupe:', err);
      toast.error('โหลดรายการหนังสือไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    let alive = true;
    loadAllBooks()
      .then((all) => {
        if (alive) setBooks(all);
      })
      .catch((err) => {
        console.error('Failed to load books for dedupe:', err);
        if (alive) toast.error('โหลดรายการหนังสือไม่สำเร็จ');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, [toast]);

  const dupBooks = useMemo(() => findDuplicateBooks(books), [books]);
  const dupAuthors = useMemo(() => findDuplicateNames(books, 'author'), [books]);
  const dupTranslators = useMemo(() => findDuplicateNames(books, 'translator'), [books]);
  const dupPublishers = useMemo(() => findDuplicateNames(books, 'publisher'), [books]);

  const counts = {
    books: dupBooks.length,
    author: dupAuthors.length,
    translator: dupTranslators.length,
    publisher: dupPublishers.length,
  };

  const needle = filterText.trim().toLowerCase();

  const visibleBookGroups = useMemo(() => {
    if (!needle) return dupBooks;
    return dupBooks.filter((g) =>
      g.books.some((b) => `${b.title} ${joinPeople(b.author)} ${b.publisher}`.toLowerCase().includes(needle))
    );
  }, [dupBooks, needle]);

  const activeNameGroups = useMemo(() => {
    const list =
      tab === 'author'
        ? dupAuthors
        : tab === 'translator'
          ? dupTranslators
          : tab === 'publisher'
            ? dupPublishers
            : [];
    if (!needle) return list;
    return list.filter((g) =>
      g.variants.some((v) => v.name.toLowerCase().includes(needle))
    );
  }, [tab, dupAuthors, dupTranslators, dupPublishers, needle]);

  const handleDeleteBook = async (book) => {
    const ok = await confirm({
      title: 'ลบหนังสือซ้ำเล่มนี้?',
      body: `ต้องการลบ "${book.title}" ออกจากฐานข้อมูลคลังหนังสือหรือไม่ (ไฟล์ใน Google Drive จะไม่ถูกลบ)`,
      confirmLabel: 'ลบออกจากคลัง',
      danger: true,
    });
    if (!ok) return;

    setBusyKey(String(book.id));
    try {
      await deleteDoc(doc(db, 'books', String(book.id)));
      await bumpCatalogRev();
      setBooks((prev) => prev.filter((b) => String(b.id) !== String(book.id)));
      toast.success(`ลบ "${book.title}" แล้ว`);
    } catch (err) {
      console.error('Delete duplicate failed:', err);
      toast.error('ลบไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setBusyKey('');
    }
  };

  const handleKeepOneDeleteRest = async (keepBook, allInGroup) => {
    const toDelete = allInGroup.filter((b) => String(b.id) !== String(keepBook.id));
    if (toDelete.length === 0) return;

    const ok = await confirm({
      title: `เก็บ "${keepBook.title}" และลบอีก ${toDelete.length} เล่มซ้ำ?`,
      body: `จะลบรายการซ้ำต่อไปนี้ออกจาก Firestore:\n${toDelete.map((b) => `• ${b.title}`).join('\n')}`,
      confirmLabel: `ลบ ${toDelete.length} เล่มซ้ำ`,
      danger: true,
    });
    if (!ok) return;

    setBusyKey(`keep:${keepBook.id}`);
    try {
      for (const b of toDelete) {
        await deleteDoc(doc(db, 'books', String(b.id)));
      }
      await bumpCatalogRev();
      const delIds = new Set(toDelete.map((b) => String(b.id)));
      setBooks((prev) => prev.filter((b) => !delIds.has(String(b.id))));
      toast.success(`เก็บ "${keepBook.title}" และลบเล่มซ้ำ ${toDelete.length} รายการแล้ว`);
    } catch (err) {
      console.error('Batch delete duplicates failed:', err);
      toast.error('ลบรายการซ้ำไม่สำเร็จ');
    } finally {
      setBusyKey('');
    }
  };

  const handleMergeNames = async (group, tabMeta) => {
    const targetName = (targets[`${tabMeta.id}:${group.key}`] ?? group.suggested).trim();
    if (!targetName) {
      toast.error('กรุณาระบุชื่อกลางที่ต้องการใช้');
      return;
    }
    const sources = group.variants.map((v) => v.name).filter((n) => n !== targetName);
    if (sources.length === 0) return;

    const ok = await confirm({
      title: `รวม ${sources.length} ตัวสะกดเป็น "${targetName}"?`,
      body: `ชื่อต่อไปนี้จะถูกเปลี่ยนเป็น "${targetName}" ในหนังสือทุกเล่มที่เกี่ยวข้อง:\n${sources.map((s) => `• ${s}`).join('\n')}`,
      confirmLabel: 'รวมชื่อทั้งหมด',
    });
    if (!ok) return;

    setBusyKey(`merge:${tabMeta.id}:${group.key}`);
    try {
      let rewritten = 0;
      for (const from of sources) {
        rewritten += await renameInBooks({
          field: tabMeta.id,
          from,
          to: targetName,
          isMulti: tabMeta.isMulti,
          bump: false,
        });
      }

      // Also keep dropdown settings in sync
      const settings = await getDropdownSettings();
      const curList = Array.isArray(settings[tabMeta.listKey]) ? settings[tabMeta.listKey] : [];
      const srcSet = new Set(sources);
      const nextList = [...new Set([...curList.filter((n) => !srcSet.has(n)), targetName])].sort((a, b) =>
        String(a).localeCompare(String(b), 'th')
      );
      await saveDropdownSettings({ ...settings, [tabMeta.listKey]: nextList });
      await bumpCatalogRev();

      // Update local state immediately
      setBooks((prev) =>
        prev.map((b) => {
          if (tabMeta.isMulti) {
            const arr = Array.isArray(b[tabMeta.id])
              ? b[tabMeta.id]
              : b[tabMeta.id]
                ? [b[tabMeta.id]]
                : [];
            if (!arr.some((v) => srcSet.has(v))) return b;
            return {
              ...b,
              [tabMeta.id]: [...new Set(arr.map((v) => (srcSet.has(v) ? targetName : v)))],
            };
          }
          return srcSet.has(b[tabMeta.id]) ? { ...b, [tabMeta.id]: targetName } : b;
        })
      );

      toast.success(`รวมชื่อเป็น "${targetName}" สำเร็จ (อัปเดต ${rewritten} เล่ม)`);
    } catch (err) {
      console.error('Merge names failed:', err);
      toast.error('รวมชื่อไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setBusyKey('');
    }
  };

  const handleExportReport = () => {
    const report = {
      generatedAt: new Date().toISOString(),
      totalBooksScanned: books.length,
      duplicateBookGroups: dupBooks.map((g) => ({
        reasons: g.reasons,
        books: g.books.map((b) => ({
          id: b.id,
          title: b.title,
          author: b.author || '',
          publisher: b.publisher || '',
          pages: b.pages || '',
          size: b.size || '',
          hasCover: Boolean(b.coverUrl),
          hasDrive: Boolean(b.driveUrl),
          hasTelegram: Boolean(b.telegramFileId || b.telegramUrl),
        })),
      })),
      duplicateAuthors: dupAuthors,
      duplicateTranslators: dupTranslators,
      duplicatePublishers: dupPublishers,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `al-maktabah-duplicates-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const currentTabMeta = TABS.find((t) => t.id === tab);

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <p className="eyebrow">ทำความสะอาดข้อมูลคลัง</p>
          <h1 className={styles.title}>
            <CopyCheck size={24} aria-hidden /> ตรวจรายการซ้ำและรวมตัวสะกด
          </h1>
          <p className={styles.sub}>
            สแกนจากหนังสือทั้งหมดในฐานข้อมูล ({books.length.toLocaleString('th-TH')} เล่ม) เพื่อหาหนังสือที่ชื่อต่างแต่เป็นเล่มเดียวกัน และชื่อผู้แต่ง/ผู้แปล/สำนักพิมพ์ที่สะกดต่างกัน
          </p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className="btn" onClick={handleExportReport} disabled={loading}>
            <Download size={15} /> ส่งออกรายงาน JSON
          </button>
          <button type="button" className="btn btn-solid" onClick={refresh} disabled={loading}>
            <RefreshCw size={15} /> สแกนใหม่
          </button>
        </div>
      </header>

      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`chip ${tab === t.id ? 'chip-on' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className={styles.tabCount}>{counts[t.id]}</span>
          </button>
        ))}
      </div>

      <div className={styles.searchRow}>
        <Search size={15} className={styles.searchIcon} />
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="กรองชื่อหนังสือหรือชื่อบุคคลในรายการซ้ำ…"
          className={styles.searchInput}
        />
      </div>

      {loading ? (
        <div className={styles.empty}>กำลังสแกนหนังสือทั้งหมดในคลัง…</div>
      ) : tab === 'books' ? (
        visibleBookGroups.length === 0 ? (
          <div className={styles.empty}>
            <CheckCircle2 size={28} />
            <p>ไม่พบกลุ่มหนังสือซ้ำในคลัง</p>
          </div>
        ) : (
          <div className={styles.groupList}>
            {visibleBookGroups.map((group) => (
              <section key={group.key} className={styles.groupCard}>
                <div className={styles.groupHead}>
                  <div>
                    <strong className={styles.groupTitle}>{group.books[0].title}</strong>
                    <div className={styles.reasonRow}>
                      {group.reasons.map((r) => (
                        <span key={r} className={styles.reasonPill}>{r}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-solid"
                    disabled={Boolean(busyKey)}
                    onClick={() => handleKeepOneDeleteRest(group.books[0], group.books)}
                  >
                    เก็บเล่มที่ 1 (สมบูรณ์สุด) และลบอีก {group.books.length - 1} เล่ม
                  </button>
                </div>

                <div className={styles.bookItems}>
                  {group.books.map((b, idx) => (
                    <div key={b.id} className={styles.bookRow}>
                      <div className={styles.miniCover}>
                        <BookCover src={b.coverUrl} title={b.title} author={b.author} />
                      </div>
                      <div className={styles.bookInfo}>
                        <div className={styles.bookName}>
                          {idx === 0 && <span className={styles.bestTag}>แนะนำเก็บไว้</span>}
                          <span>{b.title}</span>
                        </div>
                        <div className={styles.bookMeta}>
                          <span>ID: {b.id}</span>
                          {joinPeople(b.author) && <span>ผู้แต่ง: {joinPeople(b.author)}</span>}
                          {b.publisher && <span>สนพ.: {b.publisher}</span>}
                          {b.pages && <span>{b.pages} หน้า</span>}
                          {b.size && <span>{b.size}</span>}
                          <span>{b.coverUrl ? '✅ มีปก' : '⚠️ ไม่มีปก'}</span>
                          <span>{b.driveUrl ? '✅ Drive' : '— ไม่มี Drive'}</span>
                          <span>{b.telegramFileId || b.telegramUrl ? '✅ Telegram' : '—'}</span>
                        </div>
                      </div>
                      <div className={styles.bookActions}>
                        <Link href={`/admin/edit/${b.id}`} className="btn" target="_blank">
                          <ExternalLink size={13} /> แก้ไข
                        </Link>
                        <button
                          type="button"
                          className={`btn ${styles.btnDanger}`}
                          disabled={Boolean(busyKey)}
                          onClick={() => handleDeleteBook(b)}
                        >
                          <Trash2 size={13} /> ลบเล่มนี้
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )
      ) : activeNameGroups.length === 0 ? (
        <div className={styles.empty}>
          <CheckCircle2 size={28} />
          <p>ไม่พบชื่อที่สะกดซ้ำกันในหมวดนี้</p>
        </div>
      ) : (
        <div className={styles.groupList}>
          {activeNameGroups.map((group) => {
            const k = `${tab}:${group.key}`;
            const chosen = targets[k] ?? group.suggested;
            return (
              <section key={k} className={styles.groupCard}>
                <div className={styles.nameGroupHead}>
                  <div>
                    <div className={styles.variantList}>
                      {group.variants.map((v) => (
                        <button
                          key={v.name}
                          type="button"
                          className={`${styles.variantChip} ${chosen === v.name ? styles.variantChosen : ''}`}
                          onClick={() => setTargets((prev) => ({ ...prev, [k]: v.name }))}
                          title="คลิกเพื่อเลือกใช้ตัวสะกดนี้เป็นชื่อหลัก"
                        >
                          <span>{v.name}</span>
                          <span className={styles.variantCount}>{v.count} เล่ม</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={styles.mergeControls}>
                    <input
                      type="text"
                      value={chosen}
                      onChange={(e) => setTargets((prev) => ({ ...prev, [k]: e.target.value }))}
                      className={styles.targetInput}
                      aria-label="ชื่อกลางที่ต้องการใช้"
                    />
                    <button
                      type="button"
                      className="btn btn-solid"
                      disabled={Boolean(busyKey)}
                      onClick={() => handleMergeNames(group, currentTabMeta)}
                    >
                      <Merge size={14} /> รวมเป็นชื่อนี้
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
