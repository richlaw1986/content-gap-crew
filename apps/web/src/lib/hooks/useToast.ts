'use client';

import { useState, useCallback } from 'react';
import type { ToastType } from '@/components/ui';

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((
    type: ToastType,
    title: string,
    message?: string,
    duration?: number
  ) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setToasts(prev => [...prev, { id, type, title, message, duration }]);
    return id;
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((title: string, message?: string) => {
    return addToast('success', title, message);
  }, [addToast]);

  const error = useCallback((title: string, message?: string) => {
    return addToast('error', title, message, 0); // Errors don't auto-dismiss
  }, [addToast]);

  const warning = useCallback((title: string, message?: string) => {
    return addToast('warning', title, message, 8000);
  }, [addToast]);

  const info = useCallback((title: string, message?: string) => {
    return addToast('info', title, message);
  }, [addToast]);

  return {
    toasts,
    addToast,
    dismissToast,
    success,
    error,
    warning,
    info,
  };
}
