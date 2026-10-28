import { HelpCircle, ShieldCheck } from 'lucide-react';

const STEPS = [
  <>Open <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" className="guide-link">calendar.google.com</a> in your web browser.</>,
  <>On the left sidebar, locate <strong>"My calendars"</strong>, hover over your target calendar, and click the three vertical dots (<strong>⋮</strong>).</>,
  <>Click <strong>"Settings and sharing"</strong> from the dropdown menu.</>,
  <>Scroll down to the <strong>"Integrate calendar"</strong> section and find the box labeled <strong>"Secret address in iCal format"</strong>.</>,
  <>Click the copy button and paste the URL into the form on the right!</>,
];

export function SetupGuide() {
  return (
    <div className="guide-card mt-6">
      <div className="guide-title-row">
        <HelpCircle size={16} />
        <h3>Where to find your Secret iCal link</h3>
      </div>
      <ol className="guide-steplist">
        {STEPS.map((step, i) => (
          <li key={i}>
            <span className="step-num">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <div className="tip-note-box mt-3">
        <span className="tip-title">💡 Sports &amp; Public Calendars (e.g. Boston Celtics, Formula 1):</span>
        <p>
          If Google only shows <strong>"Calendar ID"</strong> or <strong>"Public URL to this calendar"</strong> without a secret address, you can paste either the <strong>Calendar ID</strong> (e.g. <code>nba_...#sports@group.v.calendar.google.com</code>) or the <strong>Public URL</strong> directly!
        </p>
      </div>

      <div className="privacy-guarantee-note">
        <ShieldCheck size={16} />
        <p>
          <strong>Privacy Guarantee:</strong> We only read your calendar events via Google's read-only iCal stream. Your Google password and credentials are never accessed or stored.
        </p>
      </div>
    </div>
  );
}
