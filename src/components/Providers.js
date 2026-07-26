'use client';

import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import Toast from './Toast';

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <ToastProvider>
        {children}
        <Toast />
      </ToastProvider>
    </AuthProvider>
  );
}
