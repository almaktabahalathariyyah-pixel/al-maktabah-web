'use client';

import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { ConfirmProvider } from '../context/ConfirmContext';
import Toast from './Toast';
import ConfirmDialog from './ConfirmDialog';

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          {children}
          <ConfirmDialog />
          <Toast />
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
