import { ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import type { CalendarEvent, CalendarFeed } from '../types';
import { getCalendarTheme } from '../utils/calendarTheme';
import { formatEventTime, getRelativeBadge } from '../utils/dates';

interface EventCardProps {
  event: CalendarEvent;
  descriptionId: string;
  calendars: CalendarFeed[];
  timezone: string;
  now: Date;
  expanded: boolean;
  onToggle: () => void;
}

export function EventCard({ event, descriptionId, calendars, timezone, now, expanded, onToggle }: EventCardProps) {
  const theme = getCalendarTheme(event.calendarName, calendars);
  const relBadge = getRelativeBadge(event.start, event.end, event.isAllDay, timezone, now);

  return (
    <div className="event-card" style={{ borderLeftColor: theme.dot, background: theme.bg }}>
      <div className="event-time-col">
        <span className="event-time-display">{formatEventTime(event.start, event.end, event.isAllDay, timezone)}</span>
        {event.isAllDay && <span className="all-day-tag">ALL DAY</span>}
      </div>

      <div className="event-body-col">
        <div className="event-header-row">
          <h3 className="event-title">{event.title || 'Untitled Event'}</h3>
          <div className="event-badges-group">
            {event.calendarName && (
              <span
                className="event-cal-tag"
                style={{ backgroundColor: theme.badgeBg, color: theme.text, borderColor: theme.border }}
              >
                <span className="tag-dot" style={{ backgroundColor: theme.dot }} aria-hidden="true" />
                {event.calendarName}
              </span>
            )}
            <span className={`event-rel-tag ${relBadge.urgent ? 'urgent' : ''}`}>
              {relBadge.urgent && <span className="urgent-pulse-dot" aria-hidden="true" />}
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
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={descriptionId}
            >
              {expanded ? (
                <>
                  <ChevronUp size={14} /> Hide details
                </>
              ) : (
                <>
                  <ChevronDown size={14} /> View description
                </>
              )}
            </button>
            {expanded && (
              <div className="event-description-box" id={descriptionId}>
                <p>{event.description}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
