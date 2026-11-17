import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import type { UserCalendarData } from '../types';
import type { Notify } from './useToast';

export function useSettingsForm(
  data: UserCalendarData | null,
  userId: string,
  token: string | null,
  notify: Notify,
  refresh: () => Promise<void>
) {
  const [leadTimeMinutes, setLeadTimeMinutes] = useState(10);
  const [timezone, setTimezone] = useState('America/New_York');
  const [dailyDigestEnabled, setDailyDigestEnabled] = useState(false);
  const [dailyDigestTime, setDailyDigestTime] = useState('08:00');
  const [saving, setSaving] = useState(false);

  // The form is refilled only when the saved settings themselves change, so a background
  // refresh keeps unsaved edits while a change made elsewhere (e.g. /cal settings) still shows.
  const seeded = useRef<string | null>(null);

  useEffect(() => {
    if (!data) {
      seeded.current = null;
      return;
    }
    const saved = {
      reminderMinutes: data.reminderMinutes ?? 10,
      timezone: data.timezone || 'America/New_York',
      dailyDigestEnabled: Boolean(data.dailyDigestEnabled),
      dailyDigestTime: data.dailyDigestTime || '08:00',
    };
    const signature = JSON.stringify([userId, saved]);
    if (seeded.current === signature) return;
    seeded.current = signature;
    setLeadTimeMinutes(saved.reminderMinutes);
    setTimezone(saved.timezone);
    setDailyDigestEnabled(saved.dailyDigestEnabled);
    setDailyDigestTime(saved.dailyDigestTime);
  }, [data, userId]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await api.saveSettings(userId, token, {
        reminderMinutes: leadTimeMinutes,
        timezone,
        dailyDigestEnabled,
        dailyDigestTime,
      });
      notify('Notification preferences and timezone saved successfully!', 'success');
      await refresh();
    } catch (err) {
      notify('Error saving settings: ' + (err instanceof Error ? err.message : 'unknown error'), 'error');
    } finally {
      setSaving(false);
    }
  }, [userId, token, leadTimeMinutes, timezone, dailyDigestEnabled, dailyDigestTime, notify, refresh]);

  return {
    leadTimeMinutes,
    setLeadTimeMinutes,
    timezone,
    setTimezone,
    dailyDigestEnabled,
    setDailyDigestEnabled,
    dailyDigestTime,
    setDailyDigestTime,
    saving,
    save,
  };
}
