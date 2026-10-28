export interface WeekDay {
  key: string;
  dayName: string;
  dayNum: number;
  count: number;
  isToday: boolean;
}

interface WeekStripProps {
  days: WeekDay[];
  totalEvents: number;
  selectedDayKey: string | null;
  onSelect: (key: string | null) => void;
}

export function WeekStrip({ days, totalEvents, selectedDayKey, onSelect }: WeekStripProps) {
  return (
    <div className="week-strip-wrapper">
      <div className="strip-title-row">
        <span className="strip-title">7-Day Week Strip</span>
        {selectedDayKey && (
          <button type="button" className="strip-reset-btn" onClick={() => onSelect(null)}>
            View All 7 Days
          </button>
        )}
      </div>
      <div className="week-strip-list">
        <button
          type="button"
          className={`strip-day-card ${selectedDayKey === null ? 'active' : ''}`}
          aria-pressed={selectedDayKey === null}
          onClick={() => onSelect(null)}
        >
          <span className="day-name">ALL</span>
          <span className="day-number">{totalEvents}</span>
          <span className="day-label">Days</span>
        </button>
        {days.map(day => (
          <button
            key={day.key}
            type="button"
            className={`strip-day-card ${selectedDayKey === day.key ? 'active' : ''} ${day.isToday ? 'is-today' : ''}`}
            aria-pressed={selectedDayKey === day.key}
            onClick={() => onSelect(selectedDayKey === day.key ? null : day.key)}
          >
            <span className="day-name">{day.dayName}</span>
            <span className="day-number">{day.dayNum}</span>
            <span className="day-count-dot">{day.count > 0 ? `${day.count} ev` : '—'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
