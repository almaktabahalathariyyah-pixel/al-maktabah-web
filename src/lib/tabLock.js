'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A lease held in localStorage, so a long job runs in ONE tab at a time.
 *
 * The admin desk has two jobs that walk the whole library — the bulk uploader
 * and the Telegram mirror — and neither knew about the other's tabs. Opening the
 * stats page twice and pressing "เริ่มสำรอง" in both ran two passes over the same
 * list: every book was sent to Telegram twice, and since each runner paces
 * itself at one message per 3s believing it is alone, two of them together
 * exceed what the channel accepts and both start failing.
 *
 * This is a LEASE, not a mutex. Two tabs that claim the same key in the same
 * instant can both believe they won; the confirm step below shrinks that window
 * to a few milliseconds but does not close it. That trade is deliberate — the
 * cost of losing the race is a duplicated backup, the alternative (Web Locks)
 * cannot be observed from another tab, and this has to drive the UI as well as
 * the exclusion. Nothing here guards data integrity: book ids come from a
 * Firestore transaction, which is a real one.
 */

const PREFIX = 'almaktabah:lock:';

/** Re-stamped this often, so a tab that is still working keeps its claim. */
const HEARTBEAT_MS = 3000;

/**
 * A claim older than this is treated as abandoned. Must comfortably exceed the
 * heartbeat: a tab throttled in the background still deserves to keep its lock,
 * and a crashed one should not hold it for long.
 */
const STALE_MS = 12000;

/** Identifies this tab for the life of the document. */
const TAB_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const keyFor = (name) => `${PREFIX}${name}`;

function read(name) {
  try {
    const raw = localStorage.getItem(keyFor(name));
    if (!raw) return null;
    const claim = JSON.parse(raw);
    if (!claim?.owner || typeof claim.at !== 'number') return null;
    if (Date.now() - claim.at > STALE_MS) return null;
    return claim;
  } catch {
    return null;
  }
}

function write(name, claim) {
  try {
    localStorage.setItem(keyFor(name), JSON.stringify(claim));
  } catch {
    /* storage unavailable — the job simply runs unguarded */
  }
}

/** Whether some OTHER tab currently holds it. */
export function heldByOther(name) {
  const claim = read(name);
  return Boolean(claim) && claim.owner !== TAB_ID;
}

export function release(name) {
  const claim = read(name);
  // Never clear a claim we do not own; the other tab is still working.
  if (claim && claim.owner !== TAB_ID) return;
  try {
    localStorage.removeItem(keyFor(name));
  } catch {
    /* nothing to do */
  }
}

const CONFIRM_MS = 60;

/** Claims `name`, resolving to true only if the claim still stands after a beat. */
export async function acquire(name) {
  if (heldByOther(name)) return false;

  write(name, { owner: TAB_ID, at: Date.now() });

  // Let any simultaneous claim land, then check who actually ended up in there.
  await new Promise((r) => setTimeout(r, CONFIRM_MS));

  const claim = read(name);
  return !claim || claim.owner === TAB_ID;
}

/**
 * Runs an exclusive job, keeping the lease alive for its duration.
 *
 * `onBusy` is called instead when another tab is already running it.
 */
export function useTabLock(name) {
  const [busyElsewhere, setBusyElsewhere] = useState(false);
  const timer = useRef(null);

  // Track other tabs taking or dropping the lock so the button can say so.
  useEffect(() => {
    const sync = () => setBusyElsewhere(heldByOther(name));
    sync();

    const onStorage = (e) => {
      if (e.key === keyFor(name) || e.key === null) sync();
    };
    window.addEventListener('storage', onStorage);

    // A lease can also lapse with no event at all, when the holder disappears.
    const poll = setInterval(sync, HEARTBEAT_MS);

    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(poll);
    };
  }, [name]);

  // A tab closed mid-job must not hold the lease for the full stale window.
  useEffect(() => {
    const drop = () => {
      if (timer.current) release(name);
    };
    window.addEventListener('pagehide', drop);
    return () => {
      window.removeEventListener('pagehide', drop);
      drop();
    };
  }, [name]);

  const runExclusive = useCallback(
    async (job, onBusy) => {
      if (!(await acquire(name))) {
        setBusyElsewhere(true);
        onBusy?.();
        return false;
      }

      timer.current = setInterval(() => write(name, { owner: TAB_ID, at: Date.now() }), HEARTBEAT_MS);

      try {
        await job();
        return true;
      } finally {
        clearInterval(timer.current);
        timer.current = null;
        release(name);
      }
    },
    [name]
  );

  return { runExclusive, busyElsewhere };
}
