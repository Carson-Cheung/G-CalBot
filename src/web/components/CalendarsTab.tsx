import { ExternalLink, Info, Sparkles } from 'lucide-react';
import type { Notify } from '../hooks/useToast';
import type { CalendarEvent, CalendarFeed } from '../types';
import { ConnectForm } from './ConnectForm';
import { FeedList } from './FeedList';
import { SetupGuide } from './SetupGuide';

interface CalendarsTabProps {
  calendars: CalendarFeed[];
  events: CalendarEvent[];
  userId: string;
  token: string | null;
  isDemo: boolean;
  isInsideDiscord: boolean;
  leadTimeMinutes: number;
  notify: Notify;
  onLogin: () => void;
  onChanged: () => Promise<void>;
  onConnected: () => Promise<void>;
}

export function CalendarsTab({
  calendars,
  events,
  userId,
  token,
  isDemo,
  isInsideDiscord,
  leadTimeMinutes,
  notify,
  onLogin,
  onChanged,
  onConnected,
}: CalendarsTabProps) {
  return (
    <main className="tab-content calendars-view">
      {isDemo && (
        <div className="demo-notice-banner">
          <div className="banner-left">
            <Info className="banner-icon" />
            <div>
              <h4 className="banner-title">Public Demo Showcase Mode</h4>
              <p className="banner-desc">
                {isInsideDiscord
                  ? 'You are currently viewing sample demo feeds. Click "Sign In with Discord" to connect your personal Google Calendar and configure alerts!'
                  : 'You are previewing sample calendar feeds. To connect your personal Google Calendar and configure Discord alerts, launch this app via /dash or /act inside Discord!'}
              </p>
            </div>
          </div>
          {isInsideDiscord ? (
            <button type="button" className="banner-cta-btn" onClick={onLogin}>
              <Sparkles size={14} className="banner-cta-icon" /> Sign In with Discord
            </button>
          ) : (
            <a
              className="banner-cta-btn"
              href="https://discord.com/app"
              target="_blank"
              rel="noopener noreferrer"
            >
              Launch in Discord <ExternalLink size={14} className="banner-cta-icon" />
            </a>
          )}
        </div>
      )}

      <div className="calendars-grid-layout">
        <section className="card-glass active-feeds-section">
          <FeedList
            calendars={calendars}
            events={events}
            userId={userId}
            token={token}
            notify={notify}
            onChanged={onChanged}
          />
          <SetupGuide />
        </section>

        <section className="card-glass connect-feed-section">
          <ConnectForm
            userId={userId}
            token={token}
            leadTimeMinutes={leadTimeMinutes}
            notify={notify}
            onConnected={onConnected}
          />
        </section>
      </div>
    </main>
  );
}
