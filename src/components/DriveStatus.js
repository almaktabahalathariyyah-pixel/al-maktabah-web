'use client';

import { useCallback, useEffect, useState } from 'react';
import { HardDrive, RefreshCw, UserPlus, AlertTriangle } from 'lucide-react';
import {
  connectDrive,
  readSavedToken,
  clearSavedToken,
  fetchDriveAccount,
  formatBytes,
} from '@/lib/googleDrive';
import { useToast } from '@/context/ToastContext';
import styles from './DriveStatus.module.css';

const NEARLY_FULL = 90;

/**
 * The storage readout above every uploader: which Drive is connected, how
 * much room is left, and a way to switch accounts when one fills up.
 *
 * `onToken` reports the live token upward so the parent can upload with it.
 */
export default function DriveStatus({ active = true, onToken }) {
  const { toast } = useToast();
  const [token, setToken] = useState(null);
  const [account, setAccount] = useState(null);
  const [busy, setBusy] = useState(false);

  const publish = useCallback(
    (value) => {
      setToken(value);
      onToken?.(value);
    },
    [onToken]
  );

  const refreshAccount = useCallback(async (value) => {
    if (!value) {
      setAccount(null);
      return;
    }
    setAccount(await fetchDriveAccount(value));
  }, []);

  // Pick up a token saved by an earlier session.
  useEffect(() => {
    if (!active) return;
    const saved = readSavedToken();
    publish(saved?.token || null);
    refreshAccount(saved?.token || null);
  }, [active, publish, refreshAccount]);

  const connect = async (chooseAccount) => {
    setBusy(true);
    try {
      const saved = await connectDrive({ chooseAccount });
      publish(saved.token);
      await refreshAccount(saved.token);
      toast.success('เชื่อมต่อ Google Drive สำเร็จ');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    clearSavedToken();
    publish(null);
    setAccount(null);
  };

  if (!token) {
    return (
      <div className={`${styles.bar} ${styles.off}`}>
        <div className={styles.who}>
          <span className={`${styles.dot} ${styles.dotOff}`} />
          <div className={styles.text}>
            <strong>ยังไม่ได้เชื่อมต่อ Google Drive</strong>
            <span className={styles.sub}>ต้องเชื่อมต่อก่อนจึงจะอัปโหลดไฟล์ได้</span>
          </div>
        </div>
        <button type="button" className="btn btn-solid" onClick={() => connect(false)} disabled={busy}>
          {busy ? 'กำลังเชื่อมต่อ…' : 'เชื่อมต่อเลย'}
        </button>
      </div>
    );
  }

  const nearlyFull = account?.percent !== null && account?.percent >= NEARLY_FULL;

  return (
    <div className={`${styles.bar} ${nearlyFull ? styles.warn : styles.on}`}>
      <div className={styles.who}>
        <span className={`${styles.dot} ${nearlyFull ? styles.dotWarn : styles.dotOn}`} />
        <div className={styles.text}>
          <strong>
            <HardDrive size={13} className={styles.icon} />
            {account?.email || 'เชื่อมต่อแล้ว'}
          </strong>

          {account?.limit ? (
            <>
              <span className={styles.sub}>
                ใช้ไป {formatBytes(account.usage)} จาก {formatBytes(account.limit)} · เหลือ{' '}
                <strong className={nearlyFull ? styles.warnText : undefined}>
                  {formatBytes(account.free)}
                </strong>
              </span>
              <span className={styles.meter} aria-hidden>
                <span
                  className={`${styles.meterFill} ${nearlyFull ? styles.meterWarn : ''}`}
                  style={{ width: `${account.percent}%` }}
                />
              </span>
            </>
          ) : (
            <span className={styles.sub}>เชื่อมต่อแล้ว · ไม่ทราบโควตาพื้นที่</span>
          )}
        </div>
      </div>

      <div className={styles.acts}>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => connect(true)}
          disabled={busy}
          title="สลับไปใช้บัญชี Google อื่น เมื่อพื้นที่บัญชีนี้ใกล้เต็ม"
        >
          <UserPlus size={14} /> เปลี่ยนบัญชี
        </button>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => connect(false)}
          disabled={busy}
          title="ต่ออายุสิทธิ์"
        >
          <RefreshCw size={14} />
        </button>
        <button type="button" className={styles.ghost} onClick={disconnect} title="ตัดการเชื่อมต่อ">
          ออก
        </button>
      </div>

      {nearlyFull && (
        <p className={styles.warnNote}>
          <AlertTriangle size={14} />
          พื้นที่บัญชีนี้ใกล้เต็มแล้ว กด &ldquo;เปลี่ยนบัญชี&rdquo; เพื่ออัปโหลดเล่มถัดไปไว้บัญชีอื่น
          — เล่มเก่าที่อยู่บัญชีนี้ยังเปิดอ่านได้ตามปกติ
        </p>
      )}
    </div>
  );
}
