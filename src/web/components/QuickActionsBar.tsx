import { useState } from 'react';
import { Bell, RefreshCw } from 'lucide-react';
import { api } from '../api';
import type { Notify } from '../hooks/useToast';

interface QuickActionsBarProps {
  isDemo: boolean;
  username: string | undefined;
  timezone: string;
  userId: string;
  token: string | null;
  syncing: boolean;
  onSync: () => void;
  notify: Notify;
}

export function QuickActionsBar({ isDemo, username, timezone, userId, token, syncing, onSync, notify }: QuickActionsBarProps) {
  const [testing, setTesting] = useState(false);

  const handleTestAlert = async () => {
    setTesting(true);
    try {
      const data = await api.sendTestAlert(userId, token);
      if (data.success) {
        notify(
          isDemo
            ? 'Demo DM alert triggered successfully! DMed demo reminder to bot owner (I will be very happy to see that someone is checking my demo out!)'
            : 'Test DM reminder sent directly to your Discord inbox!',
          'success'
        );
      } else {
        notify('Test DM could not be sent. Make sure direct messages are enabled.', 'error');
      }
    } catch (err) {
      notify('Error sending test alert: ' + (err instanceof Error ? err.message : 'unknown error'), 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="quick-actions-bar">
      <div className="quick-info">
        <span className="quick-tag">{isDemo ? 'Demo Mode Active' : `Connected as @${username || 'user'}`}</span>
        <span className="quick-sep" aria-hidden="true">|</span>
        <span className="quick-tz">Timezone: <strong>{timezone}</strong></span>
      </div>
      <div className="quick-buttons">
        <button
          type="button"
          className="action-btn btn-secondary-glass"
          onClick={handleTestAlert}
          disabled={testing}
          title="Send an immediate test alert to your Discord DM"
        >
          <Bell className="btn-icon" />
          <span>{testing ? 'Sending DM...' : 'Test DM Alert'}</span>
        </button>
        <button
          type="button"
          className="action-btn btn-secondary-glass"
          onClick={onSync}
          disabled={syncing}
          title="Fetch the newest changes from your Google Calendar iCal feeds"
        >
          <RefreshCw className={`btn-icon ${syncing ? 'animate-spin' : ''}`} />
          <span>{syncing ? 'Syncing...' : 'Sync Now'}</span>
        </button>
      </div>
    </div>
  );
}
