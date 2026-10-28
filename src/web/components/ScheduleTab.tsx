import { useMemo } from 'react';
import type { CalendarEvent, CalendarFeed, TabId } from '../types';
import type { ScheduleFilters } from '../hooks/useScheduleFilters';
import { getDayKey, getNextEventCountdown } from '../utils/dates';
import { DAY_MS } from '../constants';
import { FeedFilters } from './FeedFilters';
import { KpiGrid } from './KpiGrid';
import { Timeline } from './Timeline';
import { WeekStrip, type WeekDay } from './WeekStrip';

interface ScheduleTabProps {
  events: CalendarEvent[];
  calendars: CalendarFeed[];
  timezone: string;
  now: Date;
  loading: boolean;
  error: string | null;
  hasData: boolean;
  leadTimeMinutes: number;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
  filters: ScheduleFilters;
  onRetry: () => void;
  onNavigate: (tab: TabId) => void;
}

export function ScheduleTab({
  events,
  calendars,
  timezone,
  now,
  loading,
  error,
  hasData,
  leadTimeMinutes,
  dailyDigestEnabled,
  dailyDigestTime,
  filters,
  onRetry,
  onNavigate,
}: ScheduleTabProps) {
  const { selectedFeed, searchQuery, selectedDayKey } = filters;

  const weekStrip = useMemo<WeekDay[]>(() => {
    const days: WeekDay[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * DAY_MS);
      const key = getDayKey(d.toISOString(), timezone, false);
      const [y, m, dayNum] = key.split('-').map(Number);
      const dayName = new Date(y, m - 1, dayNum).toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase();
      const count = events.filter(e => getDayKey(e.start, timezone, e.isAllDay) === key).length;
      days.push({ key, dayName, dayNum, count, isToday: i === 0 });
    }
    return days;
  }, [events, timezone, now]);

  const filteredEvents = useMemo(() => {
    const feed = selectedFeed.trim().toLowerCase();
    const query = searchQuery.trim().toLowerCase();
    return events.filter(event => {
      if (selectedFeed !== 'all' && (event.calendarName || '').trim().toLowerCase() !== feed) return false;
      if (selectedDayKey && getDayKey(event.start, timezone, event.isAllDay) !== selectedDayKey) return false;
      if (query) {
        const haystack = [event.title, event.location, event.description].map(v => (v || '').toLowerCase());
        if (!haystack.some(v => v.includes(query))) return false;
      }
      return true;
    });
  }, [events, selectedFeed, selectedDayKey, searchQuery, timezone]);

  const nextEvent = useMemo(() => getNextEventCountdown(events, now.getTime()), [events, now]);

  return (
    <main className="tab-content schedule-view">
      <KpiGrid
        calendarCount={calendars.length}
        eventCount={events.length}
        nextEvent={nextEvent}
        leadTimeMinutes={leadTimeMinutes}
        dailyDigestEnabled={dailyDigestEnabled}
        dailyDigestTime={dailyDigestTime}
        onOpenCalendars={() => onNavigate('calendars')}
        onOpenSettings={() => onNavigate('settings')}
      />

      <section className="controls-panel">
        <WeekStrip
          days={weekStrip}
          totalEvents={events.length}
          selectedDayKey={selectedDayKey}
          onSelect={filters.setSelectedDayKey}
        />
        <FeedFilters
          calendars={calendars}
          events={events}
          selectedFeed={selectedFeed}
          onSelectFeed={filters.setSelectedFeed}
          searchQuery={searchQuery}
          onSearchChange={filters.setSearchQuery}
        />
      </section>

      <Timeline
        events={filteredEvents}
        calendars={calendars}
        timezone={timezone}
        now={now}
        loading={loading}
        error={error}
        hasData={hasData}
        isFiltered={filters.isFiltered}
        onRetry={onRetry}
        onClearFilters={filters.clearAll}
        onConnect={() => onNavigate('calendars')}
      />
    </main>
  );
}
