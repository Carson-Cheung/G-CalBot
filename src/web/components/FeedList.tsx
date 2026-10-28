import { useEffect, useState } from 'react';
import { Layers, Trash2 } from 'lucide-react';
import { api } from '../api';
import type { Notify } from '../hooks/useToast';
import type { CalendarEvent, CalendarFeed } from '../types';
import { getCalendarTheme } from '../utils/calendarTheme';
import { countEventsFor, maskFeedUrl } from '../utils/user';

const CONFIRM_WINDOW_MS = 5000;

interface FeedListProps {
  calendars: CalendarFeed[];
  events: CalendarEvent[];
  userId: string;
  token: string | null;
  notify: Notify;
  onChanged: () => Promise<void>;
}

export function FeedList({ calendars, events, userId, token, notify, onChanged }: FeedListProps) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  const handleRemove = async (calendarId: string, name: string) => {
    try {
      const data = await api.removeCalendar(userId, token, calendarId);
      if (data.success) {
        notify(`Removed "${name}" successfully`, 'info');
        await onChanged();
      } else {
        notify('Could not remove calendar', 'error');
      }
    } catch (err) {
      notify('Error removing feed: ' + (err instanceof Error ? err.message : 'unknown error'), 'error');
    }
  };

  const handleUnlinkAll = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      const data = await api.unlinkAll(userId, token);
      setConfirming(false);
      if (data.success) {
        notify('All connected calendar feeds have been unlinked', 'info');
        await onChanged();
      } else {
        notify('Could not unlink calendars', 'error');
      }
    } catch (err) {
      notify('Error unlinking calendars: ' + (err instanceof Error ? err.message : 'unknown error'), 'error');
    }
  };

  return (
    <>
      <div className="card-header-row">
        <div className="card-header-title">
          <Layers size={20} />
          <h2>Active Calendar Feeds</h2>
          <span className="badge-count">{calendars.length}</span>
        </div>
        {calendars.length > 0 && (
          <button
            type="button"
            className={`btn-danger-glass ${confirming ? 'confirm-pulse' : ''}`}
            onClick={handleUnlinkAll}
          >
            <Trash2 size={14} />
            <span>{confirming ? 'Click to Confirm Unlink All' : 'Unlink All'}</span>
          </button>
        )}
      </div>

      {calendars.length > 0 ? (
        <div className="feed-cards-list">
          {calendars.map(cal => {
            const theme = getCalendarTheme(cal.name, calendars);
            return (
              <div key={cal.id} className="feed-item-card">
                <div className="feed-item-color-bar" style={{ backgroundColor: theme.dot }} />
                <div className="feed-item-info">
                  <div className="feed-name-row">
                    <h3 className="feed-item-name">{cal.name}</h3>
                    <span
                      className="feed-badge"
                      style={{ backgroundColor: theme.badgeBg, color: theme.text, borderColor: theme.border }}
                    >
                      {countEventsFor(events, cal.name)} events
                    </span>
                  </div>
                  <p className="feed-url-preview truncate">{maskFeedUrl(cal.url)}...</p>
                  <span className="feed-connected-date">
                    Connected {cal.addedAt ? new Date(cal.addedAt).toLocaleDateString() : 'Active'}
                  </span>
                </div>
                <button
                  type="button"
                  className="feed-remove-btn"
                  title="Remove this calendar"
                  aria-label={`Remove ${cal.name}`}
                  onClick={() => handleRemove(cal.id, cal.name)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-feeds-box">
          <Layers size={32} className="mb-2" />
          <h4>No Calendars Linked Yet</h4>
          <p>Add your first Google Calendar using the form on the right.</p>
        </div>
      )}
    </>
  );
}
