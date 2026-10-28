import { useCallback, useMemo, useState } from 'react';
import { CalendarsTab } from './components/CalendarsTab';
import { Navbar } from './components/Navbar';
import { QuickActionsBar } from './components/QuickActionsBar';
import { ScheduleTab } from './components/ScheduleTab';
import { SettingsTab } from './components/SettingsTab';
import { Toast } from './components/Toast';
import { useCalendarData } from './hooks/useCalendarData';
import { useDiscordAuth } from './hooks/useDiscordAuth';
import { useHealth } from './hooks/useHealth';
import { useNow } from './hooks/useNow';
import { useScheduleFilters } from './hooks/useScheduleFilters';
import { useSettingsForm } from './hooks/useSettingsForm';
import { useToast } from './hooks/useToast';
import type { TabId } from './types';

const CLOCK_TICK_MS = 30_000;

export function App() {
  const [activeTab, setActiveTab] = useState<TabId>('schedule');
  const { toast, notify } = useToast();
  const health = useHealth();
  const now = useNow(CLOCK_TICK_MS);
  const filters = useScheduleFilters();

  const auth = useDiscordAuth(notify);
  const { userId, sessionToken, isDemo, authUser, isInsideDiscord } = auth;

  const calendar = useCalendarData(userId, sessionToken, !auth.authLoading, notify);
  const { data, refresh } = calendar;
  const reload = useCallback(() => refresh(false), [refresh]);
  const settings = useSettingsForm(data, userId, sessionToken, notify, reload);

  const events = useMemo(() => data?.events ?? [], [data]);
  const calendars = useMemo(() => data?.calendars ?? [], [data]);

  const handleConnected = useCallback(async () => {
    await refresh(false);
    setActiveTab('schedule');
  }, [refresh]);

  return (
    <div className="dashboard-container">
      <div className="ambient-glow glow-top" aria-hidden="true" />
      <div className="ambient-glow glow-right" aria-hidden="true" />

      <Navbar
        postgres={health?.postgres}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        eventCount={events.length}
        calendarCount={calendars.length}
        authUser={authUser}
        isDemo={isDemo}
        isInsideDiscord={isInsideDiscord}
        onLogin={auth.loginWithDiscord}
        onToggleDemo={auth.toggleDemo}
        onSignOut={auth.signOut}
      />

      <QuickActionsBar
        isDemo={isDemo}
        username={authUser?.username}
        timezone={settings.timezone}
        userId={userId}
        token={sessionToken}
        syncing={calendar.syncing}
        onSync={() => refresh(true)}
        notify={notify}
      />

      {activeTab === 'schedule' && (
        <ScheduleTab
          events={events}
          calendars={calendars}
          timezone={settings.timezone}
          now={now}
          loading={calendar.loading}
          error={calendar.error}
          hasData={data !== null}
          leadTimeMinutes={settings.leadTimeMinutes}
          dailyDigestEnabled={settings.dailyDigestEnabled}
          dailyDigestTime={settings.dailyDigestTime}
          filters={filters}
          onRetry={reload}
          onNavigate={setActiveTab}
        />
      )}

      {activeTab === 'calendars' && (
        <CalendarsTab
          calendars={calendars}
          events={events}
          userId={userId}
          token={sessionToken}
          isDemo={isDemo}
          isInsideDiscord={isInsideDiscord}
          leadTimeMinutes={settings.leadTimeMinutes}
          notify={notify}
          onLogin={auth.loginWithDiscord}
          onChanged={reload}
          onConnected={handleConnected}
        />
      )}

      {activeTab === 'settings' && <SettingsTab form={settings} />}

      {toast && <Toast toast={toast} />}
    </div>
  );
}
