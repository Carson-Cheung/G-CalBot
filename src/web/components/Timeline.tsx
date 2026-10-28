import { useId, useMemo, useState } from 'react';
import { AlertCircle, CalendarCheck2, CalendarDays, Plus, RefreshCw } from 'lucide-react';
import type { CalendarEvent, CalendarFeed } from '../types';
import { formatGroupDateHeader, getDayKey } from '../utils/dates';
import { EventCard } from './EventCard';

interface TimelineProps {
  events: CalendarEvent[];
  calendars: CalendarFeed[];
  timezone: string;
  now: Date;
  loading: boolean;
  error: string | null;
  hasData: boolean;
  isFiltered: boolean;
  onRetry: () => void;
  onClearFilters: () => void;
  onConnect: () => void;
}

const eventKey = (event: CalendarEvent) => `${event.id}|${event.start}|${event.calendarName ?? ''}`;

export function Timeline({
  events,
  calendars,
  timezone,
  now,
  loading,
  error,
  hasData,
  isFiltered,
  onRetry,
  onClearFilters,
  onConnect,
}: TimelineProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const idPrefix = useId();

  const groups = useMemo(() => {
    const byDay = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = getDayKey(event.start, timezone, event.isAllDay);
      const list = byDay.get(key);
      if (list) list.push(event);
      else byDay.set(key, [event]);
    }
    return [...byDay.keys()].sort().map(key => ({
      key,
      header: formatGroupDateHeader(key, timezone, now),
      events: byDay.get(key)!.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    }));
  }, [events, timezone, now]);

  if (loading) {
    return (
      <section className="timeline-section">
        <div className="loading-card" role="status">
          <RefreshCw className="loading-spinner" />
          <p>Loading schedule feeds and calendar events...</p>
        </div>
      </section>
    );
  }

  if (error && !hasData) {
    return (
      <section className="timeline-section">
        <div className="empty-timeline-card" role="alert">
          <div className="empty-icon-wrap">
            <AlertCircle size={40} />
          </div>
          <h3>Could Not Load Schedule</h3>
          <p>{error}</p>
          <button type="button" className="action-btn btn-secondary-glass" onClick={onRetry}>
            <RefreshCw size={16} />
            <span>Try Again</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="timeline-section">
      {groups.length > 0 ? (
        groups.map((group, groupIdx) => (
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
              {group.events.map((event, eventIdx) => {
                const key = eventKey(event);
                return (
                  <EventCard
                    key={key}
                    event={event}
                    descriptionId={`${idPrefix}-${groupIdx}-${eventIdx}`}
                    calendars={calendars}
                    timezone={timezone}
                    now={now}
                    expanded={expandedKey === key}
                    onToggle={() => setExpandedKey(expandedKey === key ? null : key)}
                  />
                );
              })}
            </div>
          </div>
        ))
      ) : (
        <div className="empty-timeline-card">
          <div className="empty-icon-wrap">
            <CalendarDays size={40} />
          </div>
          <h3>No Events Found</h3>
          <p>
            {isFiltered
              ? 'No events match your current filter criteria. Try clearing search or day filters.'
              : 'No calendar feeds are linked yet, or there are no events in the next 7 days.'}
          </p>
          {isFiltered && (
            <button type="button" className="action-btn btn-secondary-glass" onClick={onClearFilters}>
              Clear All Filters
            </button>
          )}
          {calendars.length === 0 && (
            <button type="button" className="action-btn btn-primary-gradient mt-3" onClick={onConnect}>
              <Plus size={16} />
              <span>Connect Google Calendar</span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
