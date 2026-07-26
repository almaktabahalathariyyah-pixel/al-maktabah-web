'use client';

import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { useToast } from '@/context/ToastContext';
import { Link as LinkIcon, Trash2, Copy, Plus, Save } from 'lucide-react';
import styles from './page.module.css';

export default function SettingsPage() {
  const { toast } = useToast();
  
  // Invite Links
  const [links, setLinks] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [newMaxUses, setNewMaxUses] = useState('');
  const [newExpiresAt, setNewExpiresAt] = useState('');

  // Contact Channels
  const [channels, setChannels] = useState([]);
  const [newType, setNewType] = useState('line');
  const [newChannelLabel, setNewChannelLabel] = useState('');
  const [newUrl, setNewUrl] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const inviteDoc = await getDoc(doc(db, 'config', 'inviteLinks'));
      if (inviteDoc.exists()) {
        setLinks(inviteDoc.data().links || []);
      }

      const siteDoc = await getDoc(doc(db, 'config', 'siteSettings'));
      if (siteDoc.exists()) {
        setChannels(siteDoc.data().contactChannels || []);
      }
    } catch (err) {
      toast.error('ไม่สามารถโหลดข้อมูลการตั้งค่าได้');
      console.error(err);
    }
  };

  const handleCreateLink = async (e) => {
    e.preventDefault();
    if (!newLabel) {
      toast.error('กรุณาระบุชื่อลิงก์');
      return;
    }

    try {
      const code = Math.random().toString(36).substring(2, 10);
      const newLink = {
        code,
        label: newLabel,
        maxUses: newMaxUses ? parseInt(newMaxUses) : null,
        usedCount: 0,
        expiresAt: newExpiresAt ? new Date(newExpiresAt) : null,
        active: true,
        createdAt: new Date()
      };

      const updatedLinks = [...links, newLink];
      
      const docRef = doc(db, 'config', 'inviteLinks');
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
         await updateDoc(docRef, { links: updatedLinks });
      } else {
         await setDoc(docRef, { links: updatedLinks });
      }
     
      setLinks(updatedLinks);
      setNewLabel('');
      setNewMaxUses('');
      setNewExpiresAt('');
      toast.success('สร้างลิงก์คำเชิญสำเร็จ');
    } catch (err) {
      toast.error('เกิดข้อผิดพลาดในการสร้างลิงก์');
      console.error(err);
    }
  };

  const handleDeleteLink = async (code) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ที่จะลบลิงก์นี้?')) return;

    try {
      const updatedLinks = links.filter(l => l.code !== code);
      await updateDoc(doc(db, 'config', 'inviteLinks'), { links: updatedLinks });
      setLinks(updatedLinks);
      toast.success('ลบลิงก์สำเร็จ');
    } catch (err) {
      toast.error('เกิดข้อผิดพลาดในการลบลิงก์');
      console.error(err);
    }
  };

  const handleToggleLinkActive = async (code, currentActive) => {
    try {
      const updatedLinks = links.map(l => 
        l.code === code ? { ...l, active: !currentActive } : l
      );
      await updateDoc(doc(db, 'config', 'inviteLinks'), { links: updatedLinks });
      setLinks(updatedLinks);
      toast.success(`สถานะลิงก์ถูกปรับปรุงแล้ว`);
    } catch (err) {
      toast.error('เกิดข้อผิดพลาดในการอัปเดตสถานะ');
      console.error(err);
    }
  };

  const copyToClipboard = (code) => {
    const url = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(url);
    toast.info('คัดลอกลิงก์แล้ว');
  };

  const handleAddChannel = async (e) => {
    e.preventDefault();
    if (!newChannelLabel || !newUrl) {
      toast.error('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    try {
      const newChannel = {
        type: newType,
        label: newChannelLabel,
        url: newUrl
      };

      const updatedChannels = [...channels, newChannel];
      
      const docRef = doc(db, 'config', 'siteSettings');
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
         await updateDoc(docRef, { contactChannels: updatedChannels });
      } else {
         await setDoc(docRef, { contactChannels: updatedChannels });
      }

      setChannels(updatedChannels);
      setNewChannelLabel('');
      setNewUrl('');
      toast.success('เพิ่มช่องทางติดต่อสำเร็จ');
    } catch (err) {
      toast.error('เกิดข้อผิดพลาดในการเพิ่มช่องทางติดต่อ');
      console.error(err);
    }
  };

  const handleDeleteChannel = async (index) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ที่จะลบช่องทางนี้?')) return;

    try {
      const updatedChannels = channels.filter((_, i) => i !== index);
      await updateDoc(doc(db, 'config', 'siteSettings'), { contactChannels: updatedChannels });
      setChannels(updatedChannels);
      toast.success('ลบช่องทางติดต่อสำเร็จ');
    } catch (err) {
      toast.error('เกิดข้อผิดพลาดในการลบช่องทางติดต่อ');
      console.error(err);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>ตั้งค่าระบบ</h1>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>ลิงก์คำเชิญ (Invite Links)</h2>
          <p className={styles.sectionDesc}>สร้างลิงก์สำหรับให้สมาชิกเข้าถึงคลังหนังสือโดยอัตโนมัติ</p>
        </div>

        <form onSubmit={handleCreateLink} className={styles.form}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>ชื่อลิงก์ / หมายเหตุ</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="เช่น กลุ่ม Line รุ่นที่ 1"
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label>จำนวนที่ใช้ได้สูงสุด (เว้นว่างได้)</label>
              <input
                type="number"
                value={newMaxUses}
                onChange={(e) => setNewMaxUses(e.target.value)}
                placeholder="ไม่จำกัด"
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label>วันหมดอายุ (เว้นว่างได้)</label>
              <input
                type="date"
                value={newExpiresAt}
                onChange={(e) => setNewExpiresAt(e.target.value)}
                className={styles.input}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-solid">
            <Plus size={18} /> สร้างลิงก์ใหม่
          </button>
        </form>

        <div className={styles.cardList}>
          {links.length === 0 ? (
            <p className={styles.empty}>ยังไม่มีลิงก์คำเชิญ</p>
          ) : (
            links.map((link) => (
              <div key={link.code} className={`${styles.card} ${!link.active ? styles.inactive : ''}`}>
                <div className={styles.cardInfo}>
                  <h3 className={styles.cardTitle}>{link.label}</h3>
                  <div className={styles.cardMeta}>
                    <span>รหัส: {link.code}</span>
                    <span>ใช้งาน: {link.usedCount} {link.maxUses ? `/ ${link.maxUses}` : 'ครั้ง'}</span>
                    {link.expiresAt && (
                      <span>
                        หมดอายุ: {new Date(link.expiresAt.toDate ? link.expiresAt.toDate() : link.expiresAt).toLocaleDateString('th-TH')}
                      </span>
                    )}
                  </div>
                  <div className={styles.urlDisplay}>
                    {`${typeof window !== 'undefined' ? window.location.origin : ''}/join/${link.code}`}
                  </div>
                </div>
                <div className={styles.cardActions}>
                  <button onClick={() => handleToggleLinkActive(link.code, link.active)} className="btn">
                    {link.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                  </button>
                  <button onClick={() => copyToClipboard(link.code)} className="btn btn-solid" title="คัดลอกลิงก์">
                    <Copy size={18} />
                  </button>
                  <button onClick={() => handleDeleteLink(link.code)} className={`btn ${styles.deleteBtn}`} title="ลบ">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>ช่องทางติดต่อ (Contact Channels)</h2>
          <p className={styles.sectionDesc}>จัดการช่องทางติดต่อที่แสดงในหน้าโปรไฟล์ผู้ดูแลระบบ</p>
        </div>

        <form onSubmit={handleAddChannel} className={styles.form}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>ประเภท</label>
              <select value={newType} onChange={(e) => setNewType(e.target.value)} className={styles.input}>
                <option value="line">LINE</option>
                <option value="facebook">Facebook</option>
                <option value="telegram">Telegram</option>
                <option value="other">อื่นๆ</option>
              </select>
            </div>
            <div className={styles.formGroup}>
              <label>ชื่อช่องทาง / ป้ายกำกับ</label>
              <input
                type="text"
                value={newChannelLabel}
                onChange={(e) => setNewChannelLabel(e.target.value)}
                placeholder="เช่น ติดต่อแอดมิน (Line)"
                className={styles.input}
              />
            </div>
            <div className={styles.formGroup}>
              <label>URL / ลิงก์</label>
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://..."
                className={styles.input}
              />
            </div>
          </div>
          <button type="submit" className="btn btn-solid">
            <Plus size={18} /> เพิ่มช่องทาง
          </button>
        </form>

        <div className={styles.cardList}>
          {channels.length === 0 ? (
            <p className={styles.empty}>ยังไม่มีช่องทางติดต่อ</p>
          ) : (
            channels.map((channel, idx) => (
              <div key={idx} className={styles.card}>
                <div className={styles.cardInfo}>
                  <h3 className={styles.cardTitle}>{channel.label}</h3>
                  <div className={styles.cardMeta}>
                    <span>ประเภท: {channel.type}</span>
                  </div>
                  <a href={channel.url} target="_blank" rel="noopener noreferrer" className={styles.urlDisplay}>
                    {channel.url}
                  </a>
                </div>
                <div className={styles.cardActions}>
                  <button onClick={() => handleDeleteChannel(idx)} className={`btn ${styles.deleteBtn}`}>
                    <Trash2 size={18} /> ลบ
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
