import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { ToastInfo } from '../types';

export function Toast({ toast }: { toast: ToastInfo }) {
  return (
    <div className={`toast-popup ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}>
      {toast.type === 'success' && <CheckCircle2 />}
      {toast.type === 'error' && <AlertCircle />}
      {toast.type === 'info' && <Info />}
      <span className="toast-msg">{toast.message}</span>
    </div>
  );
}
