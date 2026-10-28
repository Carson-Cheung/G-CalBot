import { useState, type FormEvent } from 'react';
import { AlertCircle, Plus, RefreshCw } from 'lucide-react';
import { api } from '../api';
import type { Notify } from '../hooks/useToast';

interface ConnectFormProps {
  userId: string;
  token: string | null;
  leadTimeMinutes: number;
  notify: Notify;
  onConnected: () => Promise<void>;
}

export function ConnectForm({ userId, token, leadTimeMinutes, notify, onConnected }: ConnectFormProps) {
  const [name, setName] = useState('');
  const [icalUrl, setIcalUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!icalUrl.trim()) {
      setError('Please provide a Google Calendar iCal URL, Public Embed link, or Calendar ID');
      return;
    }
    setError(null);
    setSubmitting(true);

    try {
      const data = await api.addCalendar(userId, token, {
        icalUrl: icalUrl.trim(),
        name: name.trim() || undefined,
        reminderMinutes: leadTimeMinutes,
      });
      setIcalUrl('');
      setName('');
      notify(`Connected "${data.calendar?.name || 'New Feed'}" with ${data.eventCount ?? 0} events!`, 'success');
      await onConnected();
    } catch (err) {
      setError(
        (err instanceof Error && err.message) ||
          'Could not validate calendar URL or ID. Check the link or ID and try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="card-header-row">
        <div className="card-header-title">
          <Plus size={20} />
          <h2>Connect New Calendar</h2>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="connect-feed-form">
        <div className="form-field-group">
          <label htmlFor="calNameInput" className="form-label">
            Calendar Name (Optional)
          </label>
          <input
            id="calNameInput"
            type="text"
            className="form-input"
            placeholder="e.g. Work, University, Gaming"
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <span className="field-hint">A friendly label to distinguish events on your schedule.</span>
        </div>

        <div className="form-field-group">
          <label htmlFor="calUrlInput" className="form-label">
            Secret iCal URL or Calendar ID <span className="text-danger" aria-hidden="true">*</span>
          </label>
          <input
            id="calUrlInput"
            type="text"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'calUrlError' : undefined}
            className={`form-input ${error ? 'input-error' : ''}`}
            placeholder="Secret iCal URL, Public URL, or Google Calendar ID"
            value={icalUrl}
            onChange={e => setIcalUrl(e.target.value)}
          />
          <span className="field-hint">Accepts Secret iCal URLs, Google Calendar IDs, Public URLs, and Embed codes</span>
        </div>

        {error && (
          <div className="form-error-alert" id="calUrlError" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" className="action-btn btn-primary-gradient w-full" disabled={submitting}>
          {submitting ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              <span>Validating &amp; Connecting...</span>
            </>
          ) : (
            <>
              <Plus size={16} />
              <span>Connect Calendar</span>
            </>
          )}
        </button>
      </form>
    </>
  );
}
