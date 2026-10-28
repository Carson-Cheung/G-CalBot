import { useEffect, useState } from 'react';
import { Calendar, Layers, ShieldCheck, Sliders, Sparkles } from 'lucide-react';
import type { DiscordUser, TabId } from '../types';
import { getUserAvatarUrl } from '../utils/user';

interface NavbarProps {
  postgres: boolean | undefined;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  eventCount: number;
  calendarCount: number;
  authUser: DiscordUser | null;
  isDemo: boolean;
  isInsideDiscord: boolean;
  onLogin: () => void;
  onToggleDemo: () => void;
  onSignOut: () => void;
}

export function Navbar({
  postgres,
  activeTab,
  onTabChange,
  eventCount,
  calendarCount,
  authUser,
  isDemo,
  isInsideDiscord,
  onLogin,
  onToggleDemo,
  onSignOut,
}: NavbarProps) {
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [authUser]);

  const tabClass = (tab: TabId) => `nav-tab-btn ${activeTab === tab ? 'active' : ''}`;
  const tabCurrent = (tab: TabId) => (activeTab === tab ? 'page' : undefined);

  return (
    <header className="navbar">
      <div className="nav-left">
        <div className="logo-wrapper">
          <img src="/logo.svg" alt="G-CalBot" className="brand-logo" />
          <div className="logo-glow" aria-hidden="true" />
        </div>
        <div className="brand-info">
          <div className="brand-title-row">
            <span className="brand-title">G-CalBot</span>
            <span className="brand-badge-live">
              <span className="live-indicator-dot" aria-hidden="true" />
              {postgres ? 'Neon Postgres • 24/7 Sync' : 'Local JSON • 24/7 Sync'}
            </span>
          </div>
          <span className="brand-subtitle">Google Calendar Discord Hub</span>
        </div>
      </div>

      <nav className="nav-center-tabs" aria-label="Sections">
        <button type="button" className={tabClass('schedule')} aria-current={tabCurrent('schedule')} onClick={() => onTabChange('schedule')}>
          <Calendar className="tab-icon" />
          <span>Schedule</span>
          {eventCount > 0 && <span className="tab-counter-pill">{eventCount}</span>}
        </button>
        <button type="button" className={tabClass('calendars')} aria-current={tabCurrent('calendars')} onClick={() => onTabChange('calendars')}>
          <Layers className="tab-icon" />
          <span>Calendars</span>
          {calendarCount > 0 && <span className="tab-counter-pill">{calendarCount}</span>}
        </button>
        <button type="button" className={tabClass('settings')} aria-current={tabCurrent('settings')} onClick={() => onTabChange('settings')}>
          <Sliders className="tab-icon" />
          <span>Alerts &amp; Digest</span>
        </button>
      </nav>

      <div className="nav-right">
        {authUser ? (
          <div className="auth-user-pill">
            <div className="user-avatar-wrap">
              {!avatarFailed ? (
                <img
                  src={getUserAvatarUrl(authUser)}
                  alt={authUser.username}
                  className="user-avatar-img"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <div className="user-avatar-fallback" aria-hidden="true">
                  {((authUser.global_name || authUser.username || 'U')[0] || 'U').toUpperCase()}
                </div>
              )}
              <span className="avatar-status-dot" aria-hidden="true" />
            </div>
            <div className="user-details">
              <div className="user-name-line">
                <span className="user-name">{authUser.global_name || authUser.username}</span>
                <span className="verified-chip" title="Discord Activity Authenticated">
                  <ShieldCheck size={12} />
                  Verified
                </span>
              </div>
              <div className="user-actions-row">
                <button type="button" className="user-link-btn" onClick={onToggleDemo}>
                  {isDemo ? 'Back to My Feeds' : 'Switch to Demo'}
                </button>
                <span className="user-action-sep" aria-hidden="true">•</span>
                <button type="button" className="user-link-btn text-danger" onClick={onSignOut}>
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        ) : isInsideDiscord ? (
          <button
            type="button"
            className="action-btn btn-primary-gradient"
            onClick={onLogin}
            title="Authorize with your Discord account"
          >
            <Sparkles size={16} />
            <span>Sign In with Discord</span>
          </button>
        ) : (
          <div className="demo-showcase-pill">
            <div className="demo-pill-icon">
              <Sparkles size={16} />
            </div>
            <div className="demo-pill-text">
              <span className="demo-title">Public Demo Showcase</span>
              <span className="demo-sub">Read-Only Preview</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
