import { Search, X } from 'lucide-react';
import type { CalendarEvent, CalendarFeed } from '../types';
import { getCalendarTheme } from '../utils/calendarTheme';
import { countEventsFor } from '../utils/user';

interface FeedFiltersProps {
  calendars: CalendarFeed[];
  events: CalendarEvent[];
  selectedFeed: string;
  onSelectFeed: (name: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export function FeedFilters({ calendars, events, selectedFeed, onSelectFeed, searchQuery, onSearchChange }: FeedFiltersProps) {
  return (
    <div className="filters-search-row">
      <div className="feed-filter-pills">
        <button
          type="button"
          className={`feed-pill ${selectedFeed === 'all' ? 'active' : ''}`}
          aria-pressed={selectedFeed === 'all'}
          onClick={() => onSelectFeed('all')}
        >
          All Feeds ({events.length})
        </button>
        {calendars.map(cal => {
          const theme = getCalendarTheme(cal.name, calendars);
          const isActive = selectedFeed === cal.name;
          return (
            <button
              key={cal.id}
              type="button"
              className={`feed-pill ${isActive ? 'active' : ''}`}
              aria-pressed={isActive}
              onClick={() => onSelectFeed(isActive ? 'all' : cal.name)}
            >
              <span className="pill-color-dot" style={{ backgroundColor: theme.dot }} aria-hidden="true" />
              <span>{cal.name}</span>
              <span className="pill-event-count">({countEventsFor(events, cal.name)})</span>
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
          aria-label="Search events, locations, or notes"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button type="button" className="search-clear-btn" aria-label="Clear search" onClick={() => onSearchChange('')}>
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
