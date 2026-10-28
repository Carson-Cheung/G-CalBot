import { Bell, CheckCircle2, Clock, Globe, Save, Sliders, Zap } from 'lucide-react';
import { LEAD_TIME_OPTIONS, TIMEZONE_OPTIONS } from '../constants';
import { useLiveClock } from '../hooks/useLiveClock';
import type { useSettingsForm } from '../hooks/useSettingsForm';

interface SettingsTabProps {
  form: ReturnType<typeof useSettingsForm>;
}

export function SettingsTab({ form }: SettingsTabProps) {
  const {
    leadTimeMinutes,
    setLeadTimeMinutes,
    timezone,
    setTimezone,
    dailyDigestEnabled,
    setDailyDigestEnabled,
    dailyDigestTime,
    setDailyDigestTime,
    saving,
    save,
  } = form;
  const liveTime = useLiveClock(timezone);
  const isPreset = TIMEZONE_OPTIONS.some(option => option.value === timezone);

  return (
    <main className="tab-content settings-view">
      <div className="settings-max-width">
        <div className="card-glass settings-card">
          <div className="card-header-row">
            <div className="card-header-title">
              <Sliders size={20} />
              <h2>Notification &amp; Timezone Preferences</h2>
            </div>
          </div>

          <div className="settings-section-block">
            <div className="settings-sub-header">
              <Bell size={16} />
              <h3 id="leadTimeHeading">Reminder Alert Lead Time</h3>
            </div>
            <p className="settings-sub-desc">
              Choose how far in advance G-CalBot sends direct message alerts to your Discord inbox before an event begins.
            </p>

            <div className="lead-time-cards-grid" role="radiogroup" aria-labelledby="leadTimeHeading">
              {LEAD_TIME_OPTIONS.map(option => {
                const isSelected = leadTimeMinutes === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    className={`lead-option-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setLeadTimeMinutes(option.value)}
                  >
                    <span className="option-top-row">
                      <span className="option-title">{option.label}</span>
                      {isSelected && <CheckCircle2 size={16} />}
                    </span>
                    <span className="option-sub">{option.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="settings-section-block">
            <div className="settings-sub-header">
              <Globe size={16} />
              <h3>Timezone &amp; Clock</h3>
            </div>
            <p className="settings-sub-desc">Event times and notifications will be calculated in this timezone.</p>

            <div className="timezone-selector-row">
              <div className="timezone-dropdown-wrap">
                <select
                  className="form-select"
                  aria-label="Timezone"
                  value={timezone}
                  onChange={e => setTimezone(e.target.value)}
                >
                  {TIMEZONE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                  {!isPreset && <option value={timezone}>{timezone} (Custom IANA)</option>}
                </select>
              </div>

              <div className="live-clock-card">
                <Clock size={16} />
                <div className="clock-content">
                  <span className="clock-label">Current Time ({timezone})</span>
                  <span className="clock-display">{liveTime || 'Calculating...'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="settings-section-block">
            <div className="settings-sub-header">
              <Zap size={16} />
              <h3>Daily Morning Briefing (Digest)</h3>
            </div>
            <p className="settings-sub-desc">
              Receive an automated Discord DM overview summarizing today's complete schedule every morning.
            </p>

            <div className="daily-digest-control-card">
              <div className="digest-toggle-col">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-labelledby="digestToggleTitle"
                    checked={dailyDigestEnabled}
                    onChange={e => setDailyDigestEnabled(e.target.checked)}
                  />
                  <span className="toggle-slider" />
                </label>
                <div className="toggle-label-wrap">
                  <span className="toggle-title" id="digestToggleTitle">Enable Daily Morning Briefing</span>
                  <span className="toggle-sub">Sends a consolidated schedule digest to your Discord DMs</span>
                </div>
              </div>

              {dailyDigestEnabled && (
                <div className="digest-time-picker-col">
                  <label htmlFor="digestTimeInput" className="time-picker-label">
                    Delivery Time (24h)
                  </label>
                  <input
                    id="digestTimeInput"
                    type="time"
                    className="form-input time-input"
                    value={dailyDigestTime}
                    onChange={e => setDailyDigestTime(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="settings-save-row">
            <button type="button" className="action-btn btn-primary-gradient" onClick={save} disabled={saving}>
              <Save size={16} className={saving ? 'animate-spin' : ''} />
              <span>{saving ? 'Saving Preferences...' : 'Save Preferences'}</span>
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
