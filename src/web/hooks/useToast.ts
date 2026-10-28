import { useCallback, useEffect, useState } from 'react';
import type { ToastInfo, ToastType } from '../types';

const TOAST_DURATION_MS = 4500;

export function useToast() {
  const [toast, setToast] = useState<ToastInfo | null>(null);

  const notify = useCallback((message: string, type: ToastType = 'success') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  return { toast, notify };
}

export type Notify = ReturnType<typeof useToast>['notify'];
