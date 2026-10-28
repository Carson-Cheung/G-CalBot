import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { UserCalendarData } from '../types';
import type { Notify } from './useToast';

export function useCalendarData(userId: string, token: string | null, ready: boolean, notify: Notify) {
  const [data, setData] = useState<UserCalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(
    async (sync = false) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      if (sync) setSyncing(true);

      try {
        const next = await api.getCalendar(userId, token, sync, controller.signal);
        if (controller.signal.aborted) return;
        setData(next);
        setError(null);
        if (sync) notify('Schedule synced successfully with Google Calendar', 'success');
      } catch (err) {
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : 'Failed to load schedule data';
        console.error('Error fetching calendar data:', err);
        setError(message);
        if (sync) notify('Failed to refresh schedule: ' + message, 'error');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setSyncing(false);
        }
      }
    },
    [userId, token, notify]
  );

  useEffect(() => {
    if (!ready) return;
    setLoading(true);
    refresh(false);
    return () => controllerRef.current?.abort();
  }, [ready, refresh]);

  return { data, loading, syncing, error, refresh };
}
