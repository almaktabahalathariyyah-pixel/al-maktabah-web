'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

const AdminContext = createContext();

export function AdminProvider({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFieldsOpen, setIsFieldsOpen] = useState(false);

  // On mount, auto-collapse sidebar on mobile
  useEffect(() => {
    if (window.innerWidth <= 900) {
      setIsSidebarOpen(false);
    }
  }, []);

  const toggleSidebar = () => setIsSidebarOpen(prev => !prev);
  const openSettings = () => { setIsSettingsOpen(true); if(window.innerWidth <= 900) setIsSidebarOpen(false); };
  const closeSettings = () => setIsSettingsOpen(false);
  const openFields = () => { setIsFieldsOpen(true); if(window.innerWidth <= 900) setIsSidebarOpen(false); };
  const closeFields = () => setIsFieldsOpen(false);

  return (
    <AdminContext.Provider
      value={{
        isSidebarOpen,
        setIsSidebarOpen,
        toggleSidebar,
        isSettingsOpen,
        openSettings,
        closeSettings,
        isFieldsOpen,
        openFields,
        closeFields,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  return useContext(AdminContext);
}
