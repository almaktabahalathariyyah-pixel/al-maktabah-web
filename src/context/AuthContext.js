'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import { auth, db } from '../lib/firebase';
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
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
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

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, isAdmin, approved, loginWithGoogle, logout }}
    >
      {!loading && children}
    </AuthContext.Provider>
  );
};
