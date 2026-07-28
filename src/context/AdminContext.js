'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const AdminContext = createContext();

const MOBILE = '(max-width: 900px)';
const isMobile = () => typeof window !== 'undefined' && window.matchMedia(MOBILE).matches;

export function AdminProvider({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFieldsOpen, setIsFieldsOpen] = useState(false);

  // Below 900px the sidebar is a full-screen overlay, so it must not be the
  // first thing a phone sees. Read after mount, and keep following the
  // viewport — rotating a tablet used to leave the drawer stuck open.
  useEffect(() => {
    const query = window.matchMedia(MOBILE);
    const apply = (e) => {
      if (e.matches) setIsSidebarOpen(false);
    };
    apply(query);
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  const toggleSidebar = useCallback(() => setIsSidebarOpen((prev) => !prev), []);

  const openSettings = useCallback(() => {
    setIsSettingsOpen(true);
    if (isMobile()) setIsSidebarOpen(false);
  }, []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  const openFields = useCallback(() => {
    setIsFieldsOpen(true);
    if (isMobile()) setIsSidebarOpen(false);
  }, []);
  const closeFields = useCallback(() => setIsFieldsOpen(false), []);

  const value = useMemo(
    () => ({
      isSidebarOpen,
      setIsSidebarOpen,
      toggleSidebar,
      isSettingsOpen,
      openSettings,
      closeSettings,
      isFieldsOpen,
      openFields,
      closeFields,
    }),
    [
      isSidebarOpen,
      toggleSidebar,
      isSettingsOpen,
      openSettings,
      closeSettings,
      isFieldsOpen,
      openFields,
      closeFields,
    ]
  );

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  return useContext(AdminContext);
}
