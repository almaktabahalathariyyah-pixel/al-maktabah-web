import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDynfVM7t9KaQsU1xvQ6YnPQsjOOEqRIUE",
  authDomain: "al-maktabah-al-athariyyah.firebaseapp.com",
  projectId: "al-maktabah-al-athariyyah",
  storageBucket: "al-maktabah-al-athariyyah.firebasestorage.app",
  messagingSenderId: "358716127965",
  appId: "1:358716127965:web:8ad2b9458d08c519f03934",
  measurementId: "G-7H9PHW99DR"
};

// Initialize Firebase only if it hasn't been initialized already
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
