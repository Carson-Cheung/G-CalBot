import { useCallback, useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!data) return;
    setLeadTimeMinutes(data.reminderMinutes ?? 10);
    setTimezone(data.timezone || 'America/New_York');
    setDailyDigestEnabled(Boolean(data.dailyDigestEnabled));
    setDailyDigestTime(data.dailyDigestTime || '08:00');
  }, [data]);

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
