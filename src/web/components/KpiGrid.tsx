import type { ReactNode } from 'react';
import { Bell, CalendarDays, Clock, Layers } from 'lucide-react';

interface KpiCardProps {
  label: string;
  iconClass: string;
  icon: ReactNode;
  value: string;
  sub: string;
  truncate?: boolean;
  onClick?: () => void;
}

function KpiCard({ label, iconClass, icon, value, sub, truncate, onClick }: KpiCardProps) {
  const body = (
    <>
      <span className="kpi-header">
        <span className="kpi-label">{label}</span>
        <span className={`kpi-icon-wrap ${iconClass}`}>{icon}</span>
      </span>
      <span className={`kpi-value ${truncate ? 'truncate' : ''}`} title={truncate ? value : undefined}>
        {value}
      </span>
      <span className={`kpi-sub ${truncate ? 'truncate' : ''}`} title={truncate ? sub : undefined}>
        {sub}
      </span>
    </>
  );

  return onClick ? (
    <button type="button" className="kpi-card" onClick={onClick}>
      {body}
    </button>
  ) : (
    <div className="kpi-card">{body}</div>
  );
}

interface KpiGridProps {
  calendarCount: number;
  eventCount: number;
  nextEvent: { countdown: string; title: string };
  leadTimeMinutes: number;
  dailyDigestEnabled: boolean;
  dailyDigestTime: string;
  onOpenCalendars: () => void;
  onOpenSettings: () => void;
}

export function KpiGrid({
  calendarCount,
  eventCount,
  nextEvent,
  leadTimeMinutes,
  dailyDigestEnabled,
  dailyDigestTime,
  onOpenCalendars,
  onOpenSettings,
}: KpiGridProps) {
  return (
    <section className="kpi-grid">
      <KpiCard
        label="Connected Feeds"
        iconClass="icon-blue"
        icon={<Layers className="kpi-icon" />}
        value={`${calendarCount} Feed${calendarCount === 1 ? '' : 's'}`}
        sub={calendarCount > 0 ? 'Active Google iCal sync' : 'Connect your first feed'}
        onClick={onOpenCalendars}
      />
      <KpiCard
        label="Upcoming (7 Days)"
        iconClass="icon-emerald"
        icon={<CalendarDays className="kpi-icon" />}
        value={`${eventCount} Event${eventCount === 1 ? '' : 's'}`}
        sub="Across all connected calendars"
      />
      <KpiCard
        label="Next Event"
        iconClass="icon-purple"
        icon={<Clock className="kpi-icon" />}
        value={nextEvent.countdown}
        sub={nextEvent.title}
        truncate
      />
      <KpiCard
        label="Alert & Digest"
        iconClass="icon-amber"
        icon={<Bell className="kpi-icon" />}
        value={`${leadTimeMinutes}m prior`}
        sub={dailyDigestEnabled ? `Daily Briefing @ ${dailyDigestTime}` : 'Daily Briefing Off'}
        onClick={onOpenSettings}
      />
    </section>
  );
}
