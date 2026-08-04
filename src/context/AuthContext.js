'use client';

import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  indexedDBLocalPersistence,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { getFirebaseAuth, db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useToast } from './ToastContext';

const AuthContext = createContext({});
const PENDING_LOGIN_KEY = 'pendingGoogleLogin';

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  // Signing in is not the same as being approved: restricted titles are
  // released per reader by the owner.
  const [approved, setApproved] = useState(false);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Save user to Firestore to ensure we have a record
        try {
          const userRef = doc(db, 'users', currentUser.uid);
          const userSnap = await getDoc(userRef);

          if (!userSnap.exists()) {
            const fresh = {
              email: currentUser.email,
              displayName: currentUser.displayName,
              photoURL: currentUser.photoURL,
              createdAt: new Date(),
              savedBooks: [],
              role: 'user', // Default role
              approved: false,
              accessStatus: 'none', // none | pending | approved | rejected
            };
            await setDoc(userRef, fresh);
            setProfile(fresh);
            setIsAdmin(false);
            setApproved(false);
          } else {
            const userData = userSnap.data();
            setProfile(userData);
            const admin = userData.role === 'admin';
            setIsAdmin(admin);
            // The owner always sees everything.
            setApproved(admin || userData.approved === true);
          }
        } catch (error) {
          console.error("Error saving user:", error);
          setIsAdmin(false);
          setApproved(false);
          setProfile(null);
        }
      } else {
        setIsAdmin(false);
        setApproved(false);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  /**
   * A popup on mobile is two nested browser contexts (this page, then Google,
   * then a jump back through Firebase's own handler) sharing state through
   * sessionStorage — Chrome for Android's storage partitioning drops that
   * state often enough to be a real, recurring login failure, not an edge
   * case. A redirect is one hop instead of two and needs the browser to do
   * far less to keep the state around, so it fails far less often. The one
   * cost is a full page reload, which is a fine trade for "login works".
   *
   * That storage can still vanish on the trip through firebaseapp.com — some
   * browsers treat "our site → a different site → our site" as bounce-tracking
   * and quietly drop storage set right before the bounce, Firebase's own
   * pending-redirect flag included. When that happens Google confirms the
   * sign-in successfully but getRedirectResult() comes back with nothing, no
   * error thrown — the reader just lands back here still signed out with no
   * clue why. PENDING_LOGIN_KEY is our own marker, checked here, to tell that
   * silent case apart from "nobody tried to log in" so it can say something.
   */
  useEffect(() => {
    getRedirectResult(getFirebaseAuth())
      .then((result) => {
        const attempted = localStorage.getItem(PENDING_LOGIN_KEY);
        localStorage.removeItem(PENDING_LOGIN_KEY);
        if (!result && attempted) {
          toast.error('เข้าสู่ระบบไม่สำเร็จ — เบราว์เซอร์บล็อกเซสชันระหว่างล็อกอิน กรุณาลองใหม่อีกครั้ง');
        }
      })
      .catch((error) => {
        localStorage.removeItem(PENDING_LOGIN_KEY);
        console.error('Redirect login error:', error);
        toast.error('เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      });
  }, [toast]);

  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    try {
      const auth = getFirebaseAuth();
      // The IndexedDB-backed store survives the storage restrictions above
      // more often than the older localStorage-backed default.
      await setPersistence(auth, indexedDBLocalPersistence);
      localStorage.setItem(PENDING_LOGIN_KEY, '1');
      await signInWithRedirect(auth, provider);
    } catch (error) {
      localStorage.removeItem(PENDING_LOGIN_KEY);
      console.error('Login error:', error);
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(getFirebaseAuth());
    } catch (error) {
      console.error('Logout error:', error);
    }
  }, []);

  const value = useMemo(
    () => ({ user, profile, loading, isAdmin, approved, loginWithGoogle, logout }),
    [user, profile, loading, isAdmin, approved, loginWithGoogle, logout]
  );

  /**
   * Children render immediately, even while the session resolves. Gating the
   * whole tree on `loading` meant every visitor — including search engines —
   * stared at a blank document until Firebase answered. Pages that care about
   * the session read `loading` and show their own skeleton.
   */
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
