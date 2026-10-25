import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import {
  Calendar,
  Layers,
  Sliders,
  Bell,
  Clock,
  MapPin,
  RefreshCw,
  Trash2,
  Plus,
  ExternalLink,
  Info,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Search,
  X,
  ShieldCheck,
  User,
  LogOut,
  Sparkles,
  Save,
  Check,
  CheckCircle2,
  CalendarDays,
  CalendarCheck2,
  Globe,
  HelpCircle,
  Zap
} from 'lucide-react';

/* ==========================================================================
   Types & Models
   ========================================================================== */

interface DiscordUser {
  id?: string;
  userId?: string;
  username: string;
  global_name?: string;
  avatar?: string;
  avatarUrl?: string;
  discriminator?: string;
}

interface CalendarFeed {
  id: string;
  name: string;
  url: string;
  addedAt?: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  isAllDay: boolean;
  calendarName?: string;
}

interface UserCalendarData {
  linked: boolean;
  reminderMinutes: number;
  enabled: boolean;
  userId: string;
  timezone: string;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
  calendars: CalendarFeed[];
  events: CalendarEvent[];
}

interface ToastInfo {
  message: string;
  type: 'success' | 'error' | 'info';
}

/* ==========================================================================
   Color Palette & Deterministic Hash
   ========================================================================== */

const CALENDAR_THEMES = [
  { border: '#4285f4', bg: 'rgba(66, 133, 244, 0.12)', text: '#93c5fd', badgeBg: 'rgba(66, 133, 244, 0.2)', dot: '#3b82f6' },
  { border: '#5865f2', bg: 'rgba(88, 101, 242, 0.12)', text: '#c7d2fe', badgeBg: 'rgba(88, 101, 242, 0.2)', dot: '#6366f1' },
  { border: '#10b981', bg: 'rgba(16, 185, 129, 0.12)', text: '#a7f3d0', badgeBg: 'rgba(16, 185, 129, 0.2)', dot: '#10b981' },
  { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', text: '#fde68a', badgeBg: 'rgba(245, 158, 11, 0.2)', dot: '#f59e0b' },
  { border: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)', text: '#fbcfe8', badgeBg: 'rgba(236, 72, 153, 0.2)', dot: '#ec4899' },
  { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)', text: '#ddd6fe', badgeBg: 'rgba(139, 92, 246, 0.2)', dot: '#8b5cf6' },
];

function getCalendarTheme(name?: string, calendars?: CalendarFeed[]) {
  if (!name) return CALENDAR_THEMES[0];
  if (calendars && calendars.length > 0) {
    const idx = calendars.findIndex(c => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (idx !== -1) return CALENDAR_THEMES[idx % CALENDAR_THEMES.length];
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  return CALENDAR_THEMES[Math.abs(hash) % CALENDAR_THEMES.length];
}

/* ==========================================================================
   Date / Time & Privacy Utilities
   ========================================================================== */

const PRESET_TIMEZONES = [
  'America/Toronto',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Vancouver',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC',
];

function getUserAvatarUrl(user: DiscordUser): string {
  if (user.avatarUrl) return user.avatarUrl;
  const uid = user.id || user.userId || '';
  if (user.avatar && uid) {
    return `https://cdn.discordapp.com/avatars/${uid}/${user.avatar}.png?size=64`;
  }
  try {
    const defaultIndex = (BigInt(uid) >> 22n) % 6n;
    return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
  } catch {
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
  }
}

function maskFeedUrl(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/private-[a-zA-Z0-9]+/g, 'private-••••••••')
    .replace(/token=[a-zA-Z0-9]+/g, 'token=••••••••')
    .slice(0, 56);
}

function getDayKey(isoString: string, tz?: string, isAllDay?: boolean): string {
  const d = new Date(isoString);
  if (isAllDay) {
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  if (tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      const y = parts.find(p => p.type === 'year')?.value;
      const m = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      if (y && m && day) return `${y}-${m}-${day}`;
    } catch {}
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatGroupDateHeader(dayKey: string, tz?: string): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  const now = new Date();
  const todayKey = getDayKey(now.toISOString(), tz, false);

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowKey = getDayKey(tomorrow.toISOString(), tz, false);

  const dayOfWeek = date.toLocaleDateString(undefined, { weekday: 'long' });
  const monthName = date.toLocaleDateString(undefined, { month: 'short' });
  const dayNum = date.getDate();

  if (dayKey === todayKey) {
    return `Today — ${dayOfWeek}, ${monthName} ${dayNum}`;
  }
  if (dayKey === tomorrowKey) {
    return `Tomorrow — ${dayOfWeek}, ${monthName} ${dayNum}`;
  }
  return `${dayOfWeek} — ${monthName} ${dayNum}`;
}

function formatEventTime(startIso: string, endIso: string, isAllDay: boolean, tz?: string): string {
  if (isAllDay) return 'All Day';
  try {
    const start = new Date(startIso);
    const end = new Date(endIso);
    const timeOptions: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...(tz ? { timeZone: tz } : {}),
    };
    const startFormatted = start.toLocaleTimeString(undefined, timeOptions);
    const endFormatted = end.toLocaleTimeString(undefined, timeOptions);
    return `${startFormatted} – ${endFormatted}`;
  } catch (_e) {
    return 'Timed';
  }
}

function getRelativeBadge(startIso: string, endIso: string, isAllDay: boolean, tz?: string): { text: string; urgent: boolean } {
  const now = new Date();
  const start = new Date(startIso);
  const end = new Date(endIso);

  const todayKey = getDayKey(now.toISOString(), tz, false);
  const startKey = getDayKey(startIso, tz, isAllDay);

  if (isAllDay) {
    if (startKey === todayKey) {
      return { text: 'Today', urgent: true };
    }
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    if (startKey === getDayKey(tomorrow.toISOString(), tz, false)) {
      return { text: 'Tomorrow', urgent: false };
    }
    const [sy, sm, sd] = startKey.split('-').map(Number);
    const [ty, tm, td] = todayKey.split('-').map(Number);
    const diffDays = Math.round((Date.UTC(sy, sm - 1, sd) - Date.UTC(ty, tm - 1, td)) / (24 * 3600000));
    if (diffDays > 1 && diffDays <= 7) {
      return { text: `In ${diffDays}d`, urgent: false };
    }
    return { text: 'Upcoming', urgent: false };
  }

  if (now >= start && now <= end) {
    return { text: 'Happening Now', urgent: true };
  }

  const diffMs = start.getTime() - now.getTime();
  if (diffMs > 0 && diffMs <= 60 * 60 * 1000) {
    const mins = Math.max(1, Math.round(diffMs / 60000));
    return { text: `In ${mins}m`, urgent: true };
  }

  if (startKey === todayKey) {
    if (diffMs > 0) {
      const hours = Math.round(diffMs / 3600000);
      return { text: `In ${hours}h`, urgent: false };
    }
    return { text: 'Today', urgent: false };
  }

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (startKey === getDayKey(tomorrow.toISOString(), tz, false)) {
    return { text: 'Tomorrow', urgent: false };
  }

  const days = Math.ceil(diffMs / (24 * 3600000));
  if (days > 1 && days <= 7) {
    return { text: `In ${days}d`, urgent: false };
  }

  return { text: 'Upcoming', urgent: false };
}

function getNextEventCountdown(events: CalendarEvent[]): { countdown: string; title: string } {
  if (!events || events.length === 0) {
    return { countdown: 'No events', title: 'Schedule is clear' };
  }
  const now = new Date().getTime();
  // Filter for future or currently ongoing events
  const future = events
    .map(e => ({ event: e, startMs: new Date(e.start).getTime(), endMs: new Date(e.end).getTime() }))
    .filter(item => item.endMs >= now)
    .sort((a, b) => a.startMs - b.startMs);

  if (future.length === 0) {
    return { countdown: 'All caught up', title: 'No more events this week' };
  }

  const next = future[0];
  if (now >= next.startMs && now <= next.endMs) {
    return { countdown: 'Now active', title: next.event.title };
  }

  const diffMs = next.startMs - now;
  if (diffMs < 60 * 60 * 1000) {
    const mins = Math.max(1, Math.floor(diffMs / 60000));
    return { countdown: `In ${mins}m`, title: next.event.title };
  }
  if (diffMs < 24 * 3600000) {
    const hrs = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    return { countdown: `In ${hrs}h ${mins}m`, title: next.event.title };
  }
  const days = Math.floor(diffMs / (24 * 3600000));
  return { countdown: `In ${days} day${days === 1 ? '' : 's'}`, title: next.event.title };
}

/* ==========================================================================
   Main React App Component
   ========================================================================== */

export const App: React.FC = () => {
  // Navigation
  const [activeTab, setActiveTab] = useState<'schedule' | 'calendars' | 'settings'>('schedule');

  // Multi-Layer Authentication State
  const [userId, setUserId] = useState<string>('demo-user');
  const [isDemo, setIsDemo] = useState<boolean>(true);
  const [authUser, setAuthUser] = useState<DiscordUser | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // Calendar & Settings State
  const [calendarData, setCalendarData] = useState<UserCalendarData | null>(null);
  const [dataLoading, setDataLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isTestingAlert, setIsTestingAlert] = useState<boolean>(false);
  const [healthInfo, setHealthInfo] = useState<{ postgres: boolean; time: string } | null>(null);

  // Toast Notification
  const [toast, setToast] = useState<ToastInfo | null>(null);

  // Filtering & Search
  const [selectedFeed, setSelectedFeed] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  // Add Calendar Form
  const [newCalName, setNewCalName] = useState<string>('');
  const [newIcalUrl, setNewIcalUrl] = useState<string>('');
  const [isAddingCal, setIsAddingCal] = useState<boolean>(false);
  const [addCalError, setAddCalError] = useState<string | null>(null);

  // Unlink All Confirmation State
  const [unlinkConfirming, setUnlinkConfirming] = useState<boolean>(false);

  // Settings Form State
  const [leadTimeMinutes, setLeadTimeMinutes] = useState<number>(10);
  const [timezone, setTimezone] = useState<string>('America/New_York');
  const [dailyDigestEnabled, setDailyDigestEnabled] = useState<boolean>(false);
  const [dailyDigestTime, setDailyDigestTime] = useState<string>('08:00');
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [liveLocalTime, setLiveLocalTime] = useState<string>('');

  // Toast Trigger Helper
  const triggerToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Live Local Time Updater for Selected Timezone
  useEffect(() => {
    const updateTime = () => {
      try {
        const now = new Date();
        const formatted = new Intl.DateTimeFormat(undefined, {
          timeZone: timezone,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
          timeZoneName: 'short',
        }).format(now);
        setLiveLocalTime(formatted);
      } catch (_e) {
        setLiveLocalTime(new Date().toLocaleTimeString());
      }
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, [timezone]);

  // Health Check Fetch
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setHealthInfo({
          postgres: data.storage === 'neon-postgresql',
          time: data.time || new Date().toISOString(),
        });
      })
      .catch(() => {
        setHealthInfo({ postgres: false, time: new Date().toISOString() });
      });
  }, []);

  /* ==========================================================================
     Multi-Layer Authentication Sequence
     ========================================================================== */
  useEffect(() => {
    let isCancelled = false;

    const performAuth = async () => {
      setAuthLoading(true);

      const urlParams = new URLSearchParams(window.location.search);

      // Step 1: Check ?session= param
      const sessionParam = urlParams.get('session');
      if (sessionParam) {
        localStorage.setItem('gcalbot_session', sessionParam);
        const cleanSearch = window.location.search
          .replace(/([?&])session=[^&]+(&|$)/, '$1')
          .replace(/[?&]$/, '');
        window.history.replaceState({}, '', window.location.pathname + cleanSearch);
      }

      // Step 2: Check if running inside Discord Activity iframe
      const isInsideDiscord = Boolean(urlParams.get('frame_id')) || (window.parent !== window);

      if (isInsideDiscord && !sessionParam) {
        // Fast-path: Check Activity Handoff first (resolves in <50ms when launched via /act or /dash)
        try {
          const handoffRes = await fetch('/api/auth/activity-handoff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              frameId: urlParams.get('frame_id'),
              isInsideDiscord: true,
            }),
          });
          if (handoffRes.ok) {
            const handoffData = await handoffRes.json();
            if (handoffData.authenticated && handoffData.user && !isCancelled) {
              if (handoffData.sessionToken) {
                localStorage.setItem('gcalbot_session', handoffData.sessionToken);
                setSessionToken(handoffData.sessionToken);
              }
              setAuthUser(handoffData.user);
              setUserId(handoffData.user.id || handoffData.user.userId || 'demo-user');
              setIsDemo(false);
              setAuthLoading(false);
              return;
            }
          }
        } catch (handoffErr) {
          console.warn('Activity handoff check skipped:', handoffErr);
        }

        // Secondary path: Native Discord Embedded App SDK OAuth2
        try {
          const cfgRes = await fetch('/api/config');
          const cfg = await cfgRes.json();
          const clientId = cfg.clientId;

          if (clientId) {
            const sdk = new DiscordSDK(clientId);
            const readyPromise = sdk.ready();
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('DiscordSDK ready timeout')), 3000)
            );
            await Promise.race([readyPromise, timeoutPromise]);

            const requestCode = async (promptMode?: 'none') => {
              const authCall = sdk.commands.authorize({
                client_id: clientId,
                response_type: 'code',
                state: '',
                ...(promptMode ? { prompt: promptMode } : {}),
                scope: ['identify'],
              });
              const authTimeout = new Promise<{ code: string }>((_, reject) =>
                setTimeout(() => reject(new Error('DiscordSDK authorize timeout')), 3000)
              );
              return Promise.race([authCall, authTimeout]);
            };

            let code: string | null = null;
            try {
              const resSilent = await requestCode('none');
              code = resSilent.code;
            } catch {
              const resInteractive = await requestCode();
              code = resInteractive.code;
            }

            if (code) {
              const tokenRes = await fetch('/api/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code }),
              });

              if (tokenRes.ok) {
                const data = await tokenRes.json();
                if (data.user && !isCancelled) {
                  const token = data.sessionToken || data.access_token;
                  if (token) {
                    localStorage.setItem('gcalbot_session', token);
                    setSessionToken(token);
                  }
                  setAuthUser(data.user);
                  setUserId(data.user.id || data.user.userId || 'demo-user');
                  setIsDemo(false);
                  setAuthLoading(false);
                  return;
                }
              }
            }
          }
        } catch (sdkErr) {
          console.warn('DiscordSDK authorization fallback:', sdkErr);
        }
      }

      // Step 3: Check stored session token in localStorage
      const storedToken = localStorage.getItem('gcalbot_session');
      if (storedToken) {
        try {
          const verifyRes = await fetch('/api/auth/session', {
            headers: { Authorization: `Bearer ${storedToken}` },
          });
          if (verifyRes.ok) {
            const sessData = await verifyRes.json();
            if (sessData.authenticated && sessData.user && !isCancelled) {
              setAuthUser(sessData.user);
              setUserId(sessData.user.id || sessData.user.userId || 'demo-user');
              setSessionToken(storedToken);
              setIsDemo(false);
              setAuthLoading(false);
              return;
            }
          }
          localStorage.removeItem('gcalbot_session');
        } catch (_err) {
          localStorage.removeItem('gcalbot_session');
        }
      }

      // Step 4: Default to Public Demo Showcase Mode
      if (!isCancelled) {
        setUserId('demo-user');
        setIsDemo(true);
        setAuthUser(null);
        setSessionToken(null);
        setAuthLoading(false);
      }
    };

    performAuth();

    return () => {
      isCancelled = true;
    };
  }, []);

  /* ==========================================================================
     Data Fetching
     ========================================================================== */
  const fetchCalendarData = useCallback(async (showToastNotification = false) => {
    if (!userId) return;
    try {
      const headers: Record<string, string> = {};
      if (sessionToken) {
        headers['Authorization'] = `Bearer ${sessionToken}`;
      }

      const res = await fetch(`/api/user/${encodeURIComponent(userId)}/calendar`, { headers });
      if (!res.ok) throw new Error('Failed to load schedule data');
      const data: UserCalendarData = await res.json();
      setCalendarData(data);

      // Synchronize form settings
      setLeadTimeMinutes(data.reminderMinutes ?? 10);
      setTimezone(data.timezone || 'America/New_York');
      setDailyDigestEnabled(Boolean(data.dailyDigestEnabled));
      setDailyDigestTime(data.dailyDigestTime || '08:00');

      if (showToastNotification) {
        triggerToast('Schedule synced successfully with Google Calendar', 'success');
      }
    } catch (err: any) {
      console.error('Error fetching calendar data:', err);
      if (showToastNotification) {
        triggerToast('Failed to refresh schedule: ' + err.message, 'error');
      }
    } finally {
      setDataLoading(false);
      setIsSyncing(false);
    }
  }, [userId, sessionToken, triggerToast]);

  useEffect(() => {
    if (!authLoading) {
      fetchCalendarData(false);
    }
  }, [authLoading, fetchCalendarData]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    await fetchCalendarData(true);
  };

  /* ==========================================================================
     Actions: Test DM, Add Feed, Remove Feed, Unlink All, Save Settings
     ========================================================================== */
  const handleTestAlert = async () => {
    setIsTestingAlert(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

      const res = await fetch(`/api/user/${encodeURIComponent(userId)}/test`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (data.success) {
        triggerToast(
          isDemo
            ? 'Demo DM alert triggered successfully! DMed demo reminder to bot owner (I will be very happy to see that someone is checking my demo out!)'
            : 'Test DM reminder sent directly to your Discord inbox!',
          'success'
        );
      } else {
        triggerToast('Test DM could not be sent. Make sure direct messages are enabled.', 'error');
      }
    } catch (err: any) {
      triggerToast('Error sending test alert: ' + err.message, 'error');
    } finally {
      setIsTestingAlert(false);
    }
  };

  const handleAddCalendar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIcalUrl.trim()) {
      setAddCalError('Please provide your secret Google Calendar iCal link');
      return;
    }
    setAddCalError(null);
    setIsAddingCal(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

      const res = await fetch(`/api/user/${encodeURIComponent(userId)}/calendar`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          icalUrl: newIcalUrl.trim(),
          name: newCalName.trim() || undefined,
          reminderMinutes: leadTimeMinutes,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to connect calendar');
      }

      setNewIcalUrl('');
      setNewCalName('');
      triggerToast(`Connected "${data.calendar?.name || 'New Feed'}" with ${data.eventCount ?? 0} events!`, 'success');
      await fetchCalendarData(false);
      setActiveTab('schedule');
    } catch (err: any) {
      setAddCalError(err.message || 'Could not validate calendar URL. Make sure it is the secret address.');
    } finally {
      setIsAddingCal(false);
    }
  };

  const handleRemoveCalendar = async (calendarId: string, calName: string) => {
    try {
      const headers: Record<string, string> = {};
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

      const res = await fetch(`/api/user/${encodeURIComponent(userId)}/calendar/${encodeURIComponent(calendarId)}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (data.success) {
        triggerToast(`Removed "${calName}" successfully`, 'info');
        await fetchCalendarData(false);
      } else {
        triggerToast('Could not remove calendar', 'error');
      }
    } catch (err: any) {
      triggerToast('Error removing feed: ' + err.message, 'error');
    }
  };

  const handleUnlinkAll = async () => {
    if (!unlinkConfirming) {
      setUnlinkConfirming(true);
      setTimeout(() => setUnlinkConfirming(false), 5000);
      return;
    }

    try {
      const headers: Record<string, string> = {};
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

      const res = await fetch(`/api/user/${encodeURIComponent(userId)}/calendar`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (data.success) {
        triggerToast('All connected calendar feeds have been unlinked', 'info');
        setUnlinkConfirming(false);
        await fetchCalendarData(false);
      }
    } catch (err: any) {
      triggerToast('Error unlinking calendars: ' + err.message, 'error');
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;

      const res = await fetch(`/api/user/${encodeURIComponent(userId)}/settings`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          reminderMinutes: leadTimeMinutes,
          timezone,
          dailyDigestEnabled,
          dailyDigestTime,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to save preferences');
      }

      triggerToast('Notification preferences and timezone saved successfully!', 'success');
      await fetchCalendarData(false);
    } catch (err: any) {
      triggerToast('Error saving settings: ' + err.message, 'error');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSignOut = () => {
    localStorage.removeItem('gcalbot_session');
    setAuthUser(null);
    setSessionToken(null);
    setUserId('demo-user');
    setIsDemo(true);
    triggerToast('Signed out of personal session. Switched to Public Demo Showcase.', 'info');
  };

  const handleSwitchToDemo = () => {
    if (isDemo && authUser) {
      // Switch back to authenticated user
      setUserId(authUser.id || authUser.userId || 'demo-user');
      setIsDemo(false);
      triggerToast(`Welcome back, ${authUser.global_name || authUser.username}!`, 'success');
    } else {
      // Switch to demo mode
      setUserId('demo-user');
      setIsDemo(true);
      triggerToast('Viewing Public Demo Showcase mode', 'info');
    }
  };

  /* ==========================================================================
     Filtering, Grouping & Mini 7-Day Calendar Strip
     ========================================================================== */
  const allEvents = calendarData?.events || [];
  const calendars = calendarData?.calendars || [];

  // 7-Day Mini Calendar Strip Dates
  const weekStrip = useMemo(() => {
    const days: { key: string; dayName: string; dayNum: number; count: number; isToday: boolean }[] = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const key = getDayKey(d.toISOString(), timezone, false);
      const [y, m, dayNum] = key.split('-').map(Number);
      const displayDate = new Date(y, m - 1, dayNum);
      const dayName = displayDate.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
      const count = allEvents.filter(e => getDayKey(e.start, timezone, e.isAllDay) === key).length;
      days.push({ key, dayName, dayNum, count, isToday: i === 0 });
    }
    return days;
  }, [allEvents, timezone]);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return allEvents.filter(event => {
      // Feed filter
      if (selectedFeed !== 'all') {
        const calMatch = (event.calendarName || '').trim().toLowerCase() === selectedFeed.trim().toLowerCase();
        if (!calMatch) return false;
      }
      // Mini calendar day filter
      if (selectedDayKey) {
        if (getDayKey(event.start, timezone, event.isAllDay) !== selectedDayKey) return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inTitle = (event.title || '').toLowerCase().includes(q);
        const inLoc = (event.location || '').toLowerCase().includes(q);
        const inDesc = (event.description || '').toLowerCase().includes(q);
        if (!inTitle && !inLoc && !inDesc) return false;
      }
      return true;
    });
  }, [allEvents, selectedFeed, selectedDayKey, searchQuery, timezone]);

  // Group events by Day Key
  const groupedEvents = useMemo(() => {
    const groups: { [key: string]: CalendarEvent[] } = {};
    for (const event of filteredEvents) {
      const key = getDayKey(event.start, timezone, event.isAllDay);
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    }
    // Sort each group by start time
    Object.keys(groups).forEach(key => {
      groups[key].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    });
    // Return sorted keys
    const sortedKeys = Object.keys(groups).sort();
    return sortedKeys.map(key => ({
      key,
      header: formatGroupDateHeader(key, timezone),
      events: groups[key],
    }));
  }, [filteredEvents, timezone]);

  // Next upcoming event calculation
  const nextEventInfo = useMemo(() => getNextEventCountdown(allEvents), [allEvents]);

  /* ==========================================================================
     Render
     ========================================================================== */
  return (
    <div className="dashboard-container">
      {/* Ambient background blur elements */}
      <div className="ambient-glow glow-top" />
      <div className="ambient-glow glow-right" />

      {/* ==========================================================================
         TOP NAVIGATION BAR
         ========================================================================== */}
      <header className="navbar">
        <div className="nav-left">
          <div className="logo-wrapper">
            <img src="/logo.svg" alt="G-CalBot" className="brand-logo" />
            <div className="logo-glow" />
          </div>
          <div className="brand-info">
            <div className="brand-title-row">
              <span className="brand-title">G-CalBot</span>
              <span className="brand-badge-live">
                <span className="live-indicator-dot" />
                {healthInfo?.postgres ? 'Neon Postgres • 24/7 Sync' : 'Local JSON • 24/7 Sync'}
              </span>
            </div>
            <span className="brand-subtitle">Google Calendar Discord Hub</span>
          </div>
        </div>

        {/* Center Navigation Tabs */}
        <nav className="nav-center-tabs">
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
            onClick={() => setActiveTab('schedule')}
          >
            <Calendar className="tab-icon" />
            <span>Schedule</span>
            {allEvents.length > 0 && <span className="tab-counter-pill">{allEvents.length}</span>}
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'calendars' ? 'active' : ''}`}
            onClick={() => setActiveTab('calendars')}
          >
            <Layers className="tab-icon" />
            <span>Calendars</span>
            {calendars.length > 0 && <span className="tab-counter-pill">{calendars.length}</span>}
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Sliders className="tab-icon" />
            <span>Alerts &amp; Digest</span>
          </button>
        </nav>

        {/* Top-Right Authenticated User Pill / Demo Showcase */}
        <div className="nav-right">
          {authUser ? (
            <div className="auth-user-pill">
              <div className="user-avatar-wrap">
                <img
                  src={getUserAvatarUrl(authUser)}
                  alt={authUser.username}
                  className="user-avatar-img"
                />
                <span className="avatar-status-dot" />
              </div>
              <div className="user-details">
                <div className="user-name-line">
                  <span className="user-name">{authUser.global_name || authUser.username}</span>
                  <span className="verified-chip" title="Discord Activity Authenticated">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" />
                    Verified
                  </span>
                </div>
                <div className="user-actions-row">
                  <button
                    type="button"
                    className="user-link-btn"
                    onClick={handleSwitchToDemo}
                  >
                    {isDemo ? 'Back to My Feeds' : 'Switch to Demo'}
                  </button>
                  <span className="user-action-sep">•</span>
                  <button
                    type="button"
                    className="user-link-btn text-danger"
                    onClick={handleSignOut}
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="demo-showcase-pill">
              <div className="demo-pill-icon">
                <Sparkles className="w-4 h-4 text-amber-300" />
              </div>
              <div className="demo-pill-text">
                <span className="demo-title">Public Demo Showcase</span>
                <span className="demo-sub">Read-Only Preview</span>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Global Quick Action Bar */}
      <div className="quick-actions-bar">
        <div className="quick-info">
          <span className="quick-tag">
            {isDemo ? 'Demo Mode Active' : `Connected as @${authUser?.username || 'user'}`}
          </span>
          <span className="quick-sep">|</span>
          <span className="quick-tz">Timezone: <strong>{timezone}</strong></span>
        </div>
        <div className="quick-buttons">
          <button
            type="button"
            className="action-btn btn-secondary-glass"
            onClick={handleTestAlert}
            disabled={isTestingAlert}
            title="Send an immediate test alert to your Discord DM"
          >
            <Bell className={`btn-icon text-amber-400 ${isTestingAlert ? 'animate-bounce' : ''}`} />
            <span>{isTestingAlert ? 'Sending DM...' : 'Test DM Alert'}</span>
          </button>
          <button
            type="button"
            className="action-btn btn-secondary-glass"
            onClick={handleManualSync}
            disabled={isSyncing}
            title="Fetch the newest changes from your Google Calendar iCal feeds"
          >
            <RefreshCw className={`btn-icon text-blue-400 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
          </button>
        </div>
      </div>

      {/* ==========================================================================
         TAB 1: SCHEDULE VIEW
         ========================================================================== */}
      {activeTab === 'schedule' && (
        <main className="tab-content schedule-view">
          {/* KPI Stat Cards Row */}
          <section className="kpi-grid">
            <div className="kpi-card" onClick={() => setActiveTab('calendars')} role="button" tabIndex={0}>
              <div className="kpi-header">
                <span className="kpi-label">Connected Feeds</span>
                <div className="kpi-icon-wrap icon-blue">
                  <Layers className="kpi-icon" />
                </div>
              </div>
              <div className="kpi-value">{calendars.length} Feed{calendars.length === 1 ? '' : 's'}</div>
              <div className="kpi-sub">
                {calendars.length > 0 ? 'Active Google iCal sync' : 'Connect your first feed'}
              </div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-label">Upcoming (7 Days)</span>
                <div className="kpi-icon-wrap icon-emerald">
                  <CalendarDays className="kpi-icon" />
                </div>
              </div>
              <div className="kpi-value">{allEvents.length} Event{allEvents.length === 1 ? '' : 's'}</div>
              <div className="kpi-sub">Across all connected calendars</div>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-label">Next Event</span>
                <div className="kpi-icon-wrap icon-purple">
                  <Clock className="kpi-icon" />
                </div>
              </div>
              <div className="kpi-value truncate" title={nextEventInfo.countdown}>
                {nextEventInfo.countdown}
              </div>
              <div className="kpi-sub truncate" title={nextEventInfo.title}>
                {nextEventInfo.title}
              </div>
            </div>

            <div className="kpi-card" onClick={() => setActiveTab('settings')} role="button" tabIndex={0}>
              <div className="kpi-header">
                <span className="kpi-label">Alert &amp; Digest</span>
                <div className="kpi-icon-wrap icon-amber">
                  <Bell className="kpi-icon" />
                </div>
              </div>
              <div className="kpi-value">{leadTimeMinutes}m prior</div>
              <div className="kpi-sub">
                {dailyDigestEnabled ? `Daily Briefing @ ${dailyDigestTime}` : 'Daily Briefing Off'}
              </div>
            </div>
          </section>

          {/* Interactive Controls & Filters */}
          <section className="controls-panel">
            {/* 7-Day Mini Calendar Strip */}
            <div className="week-strip-wrapper">
              <div className="strip-title-row">
                <span className="strip-title">7-Day Week Strip</span>
                {selectedDayKey && (
                  <button
                    type="button"
                    className="strip-reset-btn"
                    onClick={() => setSelectedDayKey(null)}
                  >
                    View All 7 Days
                  </button>
                )}
              </div>
              <div className="week-strip-list">
                <button
                  type="button"
                  className={`strip-day-card ${selectedDayKey === null ? 'active' : ''}`}
                  onClick={() => setSelectedDayKey(null)}
                >
                  <span className="day-name">ALL</span>
                  <span className="day-number">{allEvents.length}</span>
                  <span className="day-label">Days</span>
                </button>
                {weekStrip.map(day => (
                  <button
                    key={day.key}
                    type="button"
                    className={`strip-day-card ${selectedDayKey === day.key ? 'active' : ''} ${day.isToday ? 'is-today' : ''}`}
                    onClick={() => setSelectedDayKey(selectedDayKey === day.key ? null : day.key)}
                  >
                    <span className="day-name">{day.dayName}</span>
                    <span className="day-number">{day.dayNum}</span>
                    <span className="day-count-dot">
                      {day.count > 0 ? `${day.count} ev` : '—'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Filter Pills & Search Input Row */}
            <div className="filters-search-row">
              <div className="feed-filter-pills">
                <button
                  type="button"
                  className={`feed-pill ${selectedFeed === 'all' ? 'active' : ''}`}
                  onClick={() => setSelectedFeed('all')}
                >
                  All Feeds ({allEvents.length})
                </button>
                {calendars.map(cal => {
                  const theme = getCalendarTheme(cal.name, calendars);
                  const count = allEvents.filter(
                    e => (e.calendarName || '').toLowerCase() === cal.name.toLowerCase()
                  ).length;
                  return (
                    <button
                      key={cal.id}
                      type="button"
                      className={`feed-pill ${selectedFeed === cal.name ? 'active' : ''}`}
                      onClick={() => setSelectedFeed(selectedFeed === cal.name ? 'all' : cal.name)}
                    >
                      <span className="pill-color-dot" style={{ backgroundColor: theme.dot }} />
                      <span>{cal.name}</span>
                      <span className="pill-event-count">({count})</span>
                    </button>
                  );
                })}
              </div>

              <div className="search-box-wrap">
                <Search className="search-icon" />
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search events, locations, or notes..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Grouped Day-by-Day Timeline */}
          <section className="timeline-section">
            {dataLoading ? (
              <div className="loading-card">
                <RefreshCw className="loading-spinner" />
                <p>Loading schedule feeds and calendar events...</p>
              </div>
            ) : groupedEvents.length > 0 ? (
              groupedEvents.map(group => (
                <div key={group.key} className="timeline-day-group">
                  <div className="day-group-header">
                    <div className="day-group-title">
                      <CalendarCheck2 className="day-group-icon" />
                      <span>{group.header}</span>
                    </div>
                    <span className="day-group-count">
                      {group.events.length} event{group.events.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="events-timeline-list">
                    {group.events.map(event => {
                      const theme = getCalendarTheme(event.calendarName, calendars);
                      const relBadge = getRelativeBadge(event.start, event.end, event.isAllDay, timezone);
                      const isExpanded = expandedEventId === event.id;

                      return (
                        <div
                          key={event.id}
                          className="event-card"
                          style={{
                            borderLeftColor: theme.dot,
                            background: theme.bg,
                          }}
                        >
                          {/* Left Time Column */}
                          <div className="event-time-col">
                            <span className="event-time-display">
                              {formatEventTime(event.start, event.end, event.isAllDay, timezone)}
                            </span>
                            {event.isAllDay && (
                              <span className="all-day-tag">ALL DAY</span>
                            )}
                          </div>

                          {/* Center Event Content */}
                          <div className="event-body-col">
                            <div className="event-header-row">
                              <h3 className="event-title">{event.title || 'Untitled Event'}</h3>
                              <div className="event-badges-group">
                                {event.calendarName && (
                                  <span
                                    className="event-cal-tag"
                                    style={{
                                      backgroundColor: theme.badgeBg,
                                      color: theme.text,
                                      borderColor: theme.border,
                                    }}
                                  >
                                    <span
                                      className="tag-dot"
                                      style={{ backgroundColor: theme.dot }}
                                    />
                                    {event.calendarName}
                                  </span>
                                )}
                                <span className={`event-rel-tag ${relBadge.urgent ? 'urgent' : ''}`}>
                                  {relBadge.urgent && <span className="urgent-pulse-dot" />}
                                  {relBadge.text}
                                </span>
                              </div>
                            </div>

                            {event.location && (
                              <div className="event-location-row">
                                <MapPin className="event-loc-icon" />
                                <span className="event-location-text">{event.location}</span>
                              </div>
                            )}

                            {event.description && (
                              <div className="event-description-toggle">
                                <button
                                  type="button"
                                  className="toggle-desc-btn"
                                  onClick={() =>
                                    setExpandedEventId(isExpanded ? null : event.id)
                                  }
                                >
                                  {isExpanded ? (
                                    <>
                                      <ChevronUp className="w-3.5 h-3.5" /> Hide details
                                    </>
                                  ) : (
                                    <>
                                      <ChevronDown className="w-3.5 h-3.5" /> View description
                                    </>
                                  )}
                                </button>
                                {isExpanded && (
                                  <div className="event-description-box">
                                    <p>{event.description}</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-timeline-card">
                <div className="empty-icon-wrap">
                  <CalendarDays className="w-10 h-10 text-muted" />
                </div>
                <h3>No Events Found</h3>
                <p>
                  {searchQuery || selectedDayKey || selectedFeed !== 'all'
                    ? 'No events match your current filter criteria. Try clearing search or day filters.'
                    : 'No calendar feeds are linked yet, or there are no events in the next 7 days.'}
                </p>
                {(searchQuery || selectedDayKey || selectedFeed !== 'all') && (
                  <button
                    type="button"
                    className="action-btn btn-secondary-glass"
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedDayKey(null);
                      setSelectedFeed('all');
                    }}
                  >
                    Clear All Filters
                  </button>
                )}
                {calendars.length === 0 && (
                  <button
                    type="button"
                    className="action-btn btn-primary-gradient mt-3"
                    onClick={() => setActiveTab('calendars')}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Connect Google Calendar</span>
                  </button>
                )}
              </div>
            )}
          </section>
        </main>
      )}

      {/* ==========================================================================
         TAB 2: CALENDARS MANAGEMENT
         ========================================================================== */}
      {activeTab === 'calendars' && (
        <main className="tab-content calendars-view">
          {/* Demo Mode Notice Banner */}
          {isDemo && (
            <div className="demo-notice-banner">
              <div className="banner-left">
                <Info className="banner-icon text-amber-400" />
                <div>
                  <h4 className="banner-title">Public Demo Showcase Mode</h4>
                  <p className="banner-desc">
                    You are previewing sample calendar feeds. To connect your personal Google Calendar and configure Discord alerts, launch this app via <strong>/dash</strong> or <strong>/act</strong> inside Discord!
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="banner-cta-btn"
                onClick={() => {
                  window.open('https://discord.com/app', '_blank');
                }}
              >
                Launch in Discord <ExternalLink className="w-3.5 h-3.5 ml-1 inline" />
              </button>
            </div>
          )}

          <div className="calendars-grid-layout">
            {/* Left Column: Active Feeds List */}
            <section className="card-glass active-feeds-section">
              <div className="card-header-row">
                <div className="card-header-title">
                  <Layers className="w-5 h-5 text-blue-400" />
                  <h2>Active Calendar Feeds</h2>
                  <span className="badge-count">{calendars.length}</span>
                </div>
                {calendars.length > 0 && (
                  <button
                    type="button"
                    className={`btn-danger-glass ${unlinkConfirming ? 'confirm-pulse' : ''}`}
                    onClick={handleUnlinkAll}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{unlinkConfirming ? 'Click to Confirm Unlink All' : 'Unlink All'}</span>
                  </button>
                )}
              </div>

              {calendars.length > 0 ? (
                <div className="feed-cards-list">
                  {calendars.map((cal, idx) => {
                    const theme = getCalendarTheme(cal.name, calendars);
                    const eventCount = allEvents.filter(
                      e => (e.calendarName || '').toLowerCase() === cal.name.toLowerCase()
                    ).length;

                    return (
                      <div key={cal.id || idx} className="feed-item-card">
                        <div className="feed-item-color-bar" style={{ backgroundColor: theme.dot }} />
                        <div className="feed-item-info">
                          <div className="feed-name-row">
                            <h3 className="feed-item-name">{cal.name}</h3>
                            <span
                              className="feed-badge"
                              style={{
                                backgroundColor: theme.badgeBg,
                                color: theme.text,
                                borderColor: theme.border,
                              }}
                            >
                              {eventCount} events
                            </span>
                          </div>
                          <p className="feed-url-preview truncate">
                            {maskFeedUrl(cal.url)}...
                          </p>
                          <span className="feed-connected-date">
                            Connected {cal.addedAt ? new Date(cal.addedAt).toLocaleDateString() : 'Active'}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="feed-remove-btn"
                          title="Remove this calendar"
                          onClick={() => handleRemoveCalendar(cal.id, cal.name)}
                        >
                          <Trash2 className="w-4 h-4 text-muted hover:text-danger" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-feeds-box">
                  <Layers className="w-8 h-8 text-muted mb-2" />
                  <h4>No Calendars Linked Yet</h4>
                  <p>Add your first Google Calendar using the form on the right.</p>
                </div>
              )}

              {/* Step-by-Step Google Calendar Setup Guide */}
              <div className="guide-card mt-6">
                <div className="guide-title-row">
                  <HelpCircle className="w-4 h-4 text-emerald-400" />
                  <h3>Where to find your Secret iCal link</h3>
                </div>
                <ol className="guide-steplist">
                  <li>
                    <span className="step-num">1</span>
                    <span>Open <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="guide-link">calendar.google.com</a> in your web browser.</span>
                  </li>
                  <li>
                    <span className="step-num">2</span>
                    <span>On the left sidebar, locate <strong>"My calendars"</strong>, hover over your target calendar, and click the three vertical dots (<strong>⋮</strong>).</span>
                  </li>
                  <li>
                    <span className="step-num">3</span>
                    <span>Click <strong>"Settings and sharing"</strong> from the dropdown menu.</span>
                  </li>
                  <li>
                    <span className="step-num">4</span>
                    <span>Scroll down to the <strong>"Integrate calendar"</strong> section and find the box labeled <strong>"Secret address in iCal format"</strong>.</span>
                  </li>
                  <li>
                    <span className="step-num">5</span>
                    <span>Click the copy button and paste the URL into the form on the right!</span>
                  </li>
                </ol>

                <div className="privacy-guarantee-note">
                  <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                  <p>
                    <strong>Privacy Guarantee:</strong> We only read your calendar events via Google's read-only iCal stream. Your Google password and credentials are never accessed or stored.
                  </p>
                </div>
              </div>
            </section>

            {/* Right Column: Connect New Calendar Feed Form */}
            <section className="card-glass connect-feed-section">
              <div className="card-header-row">
                <div className="card-header-title">
                  <Plus className="w-5 h-5 text-emerald-400" />
                  <h2>Connect New Calendar</h2>
                </div>
              </div>

              <form onSubmit={handleAddCalendar} className="connect-feed-form">
                <div className="form-field-group">
                  <label htmlFor="calNameInput" className="form-label">
                    Calendar Name (Optional)
                  </label>
                  <input
                    id="calNameInput"
                    type="text"
                    className="form-input"
                    placeholder="e.g. Work, University, Gaming"
                    value={newCalName}
                    onChange={e => setNewCalName(e.target.value)}
                  />
                  <span className="field-hint">A friendly label to distinguish events on your schedule.</span>
                </div>

                <div className="form-field-group">
                  <label htmlFor="calUrlInput" className="form-label">
                    Secret iCal URL <span className="text-danger">*</span>
                  </label>
                  <input
                    id="calUrlInput"
                    type="url"
                    required
                    className={`form-input ${addCalError ? 'input-error' : ''}`}
                    placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                    value={newIcalUrl}
                    onChange={e => setNewIcalUrl(e.target.value)}
                  />
                  <span className="field-hint">Must begin with https:// or webcal://</span>
                </div>

                {addCalError && (
                  <div className="form-error-alert">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{addCalError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="action-btn btn-primary-gradient w-full"
                  disabled={isAddingCal}
                >
                  {isAddingCal ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Validating &amp; Connecting...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Connect Calendar</span>
                    </>
                  )}
                </button>
              </form>
            </section>
          </div>
        </main>
      )}

      {/* ==========================================================================
         TAB 3: ALERTS & DIGEST SETTINGS
         ========================================================================== */}
      {activeTab === 'settings' && (
        <main className="tab-content settings-view">
          <div className="settings-max-width">
            <div className="card-glass settings-card">
              <div className="card-header-row">
                <div className="card-header-title">
                  <Sliders className="w-5 h-5 text-amber-400" />
                  <h2>Notification &amp; Timezone Preferences</h2>
                </div>
              </div>

              {/* 1. Reminder Lead Time Selector Cards */}
              <div className="settings-section-block">
                <div className="settings-sub-header">
                  <Bell className="w-4 h-4 text-blue-400" />
                  <h3>Reminder Alert Lead Time</h3>
                </div>
                <p className="settings-sub-desc">
                  Choose how far in advance G-CalBot sends direct message alerts to your Discord inbox before an event begins.
                </p>

                <div className="lead-time-cards-grid">
                  {[
                    { value: 0, label: 'At Start', sub: '0 minutes prior' },
                    { value: 5, label: '5 Minutes', sub: 'Prior to start' },
                    { value: 10, label: '10 Minutes', sub: 'Standard default' },
                    { value: 15, label: '15 Minutes', sub: 'Prior to start' },
                    { value: 30, label: '30 Minutes', sub: 'Prior to start' },
                    { value: 60, label: '1 Hour', sub: '60 minutes prior' },
                  ].map(option => {
                    const isSelected = leadTimeMinutes === option.value;
                    return (
                      <div
                        key={option.value}
                        className={`lead-option-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => setLeadTimeMinutes(option.value)}
                        role="button"
                        tabIndex={0}
                      >
                        <div className="option-top-row">
                          <span className="option-title">{option.label}</span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />}
                        </div>
                        <span className="option-sub">{option.sub}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Timezone Selector with Live Local Time Preview */}
              <div className="settings-section-block">
                <div className="settings-sub-header">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <h3>Timezone &amp; Clock</h3>
                </div>
                <p className="settings-sub-desc">
                  Event times and notifications will be calculated in this timezone.
                </p>

                <div className="timezone-selector-row">
                  <div className="timezone-dropdown-wrap">
                    <select
                      className="form-select"
                      value={timezone}
                      onChange={e => setTimezone(e.target.value)}
                    >
                      <option value="America/Toronto">America/Toronto (Eastern UTC-4/5)</option>
                      <option value="America/New_York">America/New_York (Eastern UTC-4/5)</option>
                      <option value="America/Chicago">America/Chicago (Central UTC-5/6)</option>
                      <option value="America/Denver">America/Denver (Mountain UTC-6/7)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (Pacific UTC-7/8)</option>
                      <option value="America/Vancouver">America/Vancouver (Pacific UTC-7/8)</option>
                      <option value="Europe/London">Europe/London (GMT/BST)</option>
                      <option value="Europe/Paris">Europe/Paris (CET/CEST)</option>
                      <option value="Europe/Berlin">Europe/Berlin (CET/CEST)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GST +4)</option>
                      <option value="Asia/Kolkata">Asia/Kolkata (IST +5:30)</option>
                      <option value="Asia/Singapore">Asia/Singapore (SGT +8)</option>
                      <option value="Asia/Tokyo">Asia/Tokyo (JST +9)</option>
                      <option value="Australia/Sydney">Australia/Sydney (AEST +10/11)</option>
                      <option value="UTC">UTC (Coordinated Universal Time)</option>
                      {!PRESET_TIMEZONES.includes(timezone) && (
                        <option value={timezone}>{timezone} (Custom IANA)</option>
                      )}
                    </select>
                  </div>

                  <div className="live-clock-card">
                    <Clock className="w-4 h-4 text-blue-400 shrink-0" />
                    <div className="clock-content">
                      <span className="clock-label">Current Time ({timezone})</span>
                      <span className="clock-display">{liveLocalTime || 'Calculating...'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Daily Morning Briefing Card */}
              <div className="settings-section-block">
                <div className="settings-sub-header">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <h3>Daily Morning Briefing (Digest)</h3>
                </div>
                <p className="settings-sub-desc">
                  Receive an automated Discord DM overview summarizing today's complete schedule every morning.
                </p>

                <div className="daily-digest-control-card">
                  <div className="digest-toggle-col">
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={dailyDigestEnabled}
                        onChange={e => setDailyDigestEnabled(e.target.checked)}
                      />
                      <span className="toggle-slider" />
                    </label>
                    <div className="toggle-label-wrap">
                      <span className="toggle-title">Enable Daily Morning Briefing</span>
                      <span className="toggle-sub">Sends a consolidated schedule digest to your Discord DMs</span>
                    </div>
                  </div>

                  {dailyDigestEnabled && (
                    <div className="digest-time-picker-col">
                      <label htmlFor="digestTimeInput" className="time-picker-label">
                        Delivery Time (24h)
                      </label>
                      <input
                        id="digestTimeInput"
                        type="time"
                        className="form-input time-input"
                        value={dailyDigestTime}
                        onChange={e => setDailyDigestTime(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Save Preferences Button */}
              <div className="settings-save-row">
                <button
                  type="button"
                  className="action-btn btn-primary-gradient"
                  onClick={handleSaveSettings}
                  disabled={isSavingSettings}
                >
                  <Save className={`w-4 h-4 ${isSavingSettings ? 'animate-spin' : ''}`} />
                  <span>{isSavingSettings ? 'Saving Preferences...' : 'Save Preferences'}</span>
                </button>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ==========================================================================
         TOAST NOTIFICATION POPUP
         ========================================================================== */}
      {toast && (
        <div className={`toast-popup ${toast.type}`}>
          {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-danger" />}
          {toast.type === 'info' && <Info className="w-4 h-4 text-blue-400" />}
          <span className="toast-msg">{toast.message}</span>
        </div>
      )}
    </div>
  );
};

// Mount to DOM
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

export default App;
