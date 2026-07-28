'use client';

import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { getFirebaseAuth, db } from '../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
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

  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(getFirebaseAuth(), provider);
    } catch (error) {
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
