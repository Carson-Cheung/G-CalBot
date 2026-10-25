/* ==========================================================================
   State & Configuration
   ========================================================================== */

let currentUserId = 'demo-user';
let unlinkConfirmActive = false;
let unlinkConfirmTimer = null;
let toastTimer = null;
let lastCalendarData = null;

const CALENDAR_COLORS = [
  '#4285f4', // Google Blue
  '#5865f2', // Discord Blurple
  '#23a55a', // Success Green
  '#f0b232', // Amber Yellow
  '#eb459e'  // Fuchsia Pink
];

/* ==========================================================================
   Toast & Formatting Helpers
   ========================================================================== */

function showToast(msg, isSuccess = true) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = msg;
  toast.className = `toast toast-visible ${isSuccess ? 'toast-success' : 'toast-error'}`;

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.className = 'toast';
  }, 4500);
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

function getCalendarColorClass(calName, knownCalendars = []) {
  if (!calName) return 'cal-color-0';

  if (Array.isArray(knownCalendars) && knownCalendars.length > 0) {
    const idx = knownCalendars.findIndex(
      (c) => (c.name || '').trim().toLowerCase() === calName.trim().toLowerCase()
    );
    if (idx !== -1) {
      return `cal-color-${idx % CALENDAR_COLORS.length}`;
    }
  }

  // Fallback deterministic string hash
  let hash = 0;
  for (let i = 0; i < calName.length; i++) {
    hash = (hash << 5) - hash + calName.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % CALENDAR_COLORS.length;
  return `cal-color-${idx}`;
}

function getRelativeTimeInfo(startDate, endDate, isAllDay) {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = start.getTime() - now.getTime();

  if (now >= start && now <= end) {
    return { text: 'Now', className: 'badge-rel-urgent' };
  }

  const todayStr = now.toDateString();
  const startStr = start.toDateString();

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowStr = tomorrow.toDateString();

  if (isAllDay && startStr === todayStr) {
    return { text: 'Today', className: 'badge-rel-today' };
  }

  if (startStr === todayStr) {
    if (diffMs > 0 && diffMs < 3600000) {
      const mins = Math.max(1, Math.round(diffMs / 60000));
      return { text: `In ${mins}m`, className: 'badge-rel-urgent' };
    }
    if (diffMs > 0 && diffMs < 12 * 3600000) {
      const hours = Math.round(diffMs / 3600000);
      return { text: `In ${hours}h`, className: 'badge-rel-today' };
    }
    return { text: 'Today', className: 'badge-rel-today' };
  }

  if (startStr === tomorrowStr) {
    return { text: 'Tomorrow', className: 'badge-rel-tomorrow' };
  }

  if (diffMs > 0) {
    const diffDays = Math.ceil(diffMs / (24 * 3600000));
    return { text: `In ${diffDays}d`, className: 'badge-rel-future' };
  }

  return { text: isAllDay ? 'All Day' : 'Passed', className: 'badge-rel-muted' };
}

/* ==========================================================================
   UI Updates: KPIs & Account Switcher
   ========================================================================== */

function updateAccountSwitcherUI() {
  const userField = document.getElementById('customUserId');
  if (userField && userField.value !== currentUserId) {
    userField.value = currentUserId;
  }

  const demoPill = document.getElementById('demoPill');
  const resetDemoBtn = document.getElementById('resetDemoBtn');

  if (demoPill) {
    if (currentUserId === 'demo-user') {
      demoPill.textContent = 'DEMO PREVIEW';
      demoPill.className = 'pill pill-demo';
    } else {
      demoPill.textContent = 'CUSTOM USER';
      demoPill.className = 'pill pill-custom';
    }
  }

  if (resetDemoBtn) {
    if (currentUserId === 'demo-user') {
      resetDemoBtn.classList.add('hidden');
    } else {
      resetDemoBtn.classList.remove('hidden');
    }
  }
}

function updateKpis(data) {
  const statCalendars = document.getElementById('statCalendars');
  const statEvents = document.getElementById('statEvents');
  const statAlerts = document.getElementById('statAlerts');

  if (statCalendars) {
    if (data && data.linked) {
      const count = (data.calendars && data.calendars.length) || 1;
      statCalendars.textContent = `${count} ${count === 1 ? 'Feed' : 'Feeds'}`;
    } else {
      statCalendars.textContent = '0 Feeds';
    }
  }

  if (statEvents) {
    const count = (data && data.events && data.events.length) || 0;
    statEvents.textContent = `${count} ${count === 1 ? 'Event' : 'Events'}`;
  }

  if (statAlerts) {
    const lead = (data && data.reminderMinutes !== undefined) ? Number(data.reminderMinutes) : 10;
    const leadStr = lead === 0 ? '0m prior' : `${lead}m prior`;
    const digestStr = (data && data.dailyDigestEnabled) ? (data.dailyDigestTime || '08:00') : 'Daily Off';
    statAlerts.textContent = `${leadStr} • ${digestStr}`;
  }
}

/* ==========================================================================
   Calendar Data & Rendering
   ========================================================================== */

async function loadCalendar(showFeedback = false) {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn && showFeedback) {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '🔄 Syncing...';
  }

  try {
    const res = await fetch(`/api/user/${encodeURIComponent(currentUserId)}/calendar`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    lastCalendarData = data;

    if (data.userId) {
      currentUserId = data.userId;
    }
    updateAccountSwitcherUI();
    updateKpis(data);

    const badge = document.getElementById('statusBadge');
    const unlinkBtn = document.getElementById('unlinkBtn');
    const saveBtn = document.getElementById('saveBtn');
    const calBox = document.getElementById('calendarsContainer');
    const calList = document.getElementById('connectedList');

    if (data.linked) {
      const calCount = (data.calendars && data.calendars.length) || 1;
      badge.className = 'badge badge-success';
      badge.textContent = `${calCount} Connected`;

      if (unlinkBtn) {
        unlinkBtn.classList.remove('hidden');
        unlinkBtn.textContent = 'Unlink All';
      }
      unlinkConfirmActive = false;

      if (saveBtn) {
        saveBtn.textContent = '➕ Add Calendar';
      }

      if (data.reminderMinutes !== undefined) {
        const leadSelect = document.getElementById('leadMinutes');
        if (leadSelect) leadSelect.value = String(data.reminderMinutes);
      }

      if (data.timezone) {
        const tzSelect = document.getElementById('timezoneSelect');
        if (tzSelect) {
          const exists = Array.from(tzSelect.options).some((opt) => opt.value === data.timezone);
          if (!exists) {
            const customOpt = document.createElement('option');
            customOpt.value = data.timezone;
            customOpt.textContent = `${data.timezone} (Custom)`;
            tzSelect.appendChild(customOpt);
          }
          tzSelect.value = data.timezone;
        }
      }

      if (data.dailyDigestEnabled !== undefined) {
        const digestToggle = document.getElementById('dailyDigestToggle');
        if (digestToggle) digestToggle.checked = Boolean(data.dailyDigestEnabled);
      }

      if (data.dailyDigestTime) {
        const digestTimeInput = document.getElementById('dailyDigestTime');
        if (digestTimeInput) digestTimeInput.value = data.dailyDigestTime;
      }

      if (data.calendars && data.calendars.length > 0) {
        calBox.classList.remove('hidden');
        calList.innerHTML = data.calendars.map((c) => {
          const colorClass = getCalendarColorClass(c.name, data.calendars);
          return `
            <div class="cal-item ${colorClass}">
              <div class="cal-item-info">
                <div class="cal-dot"></div>
                <span class="cal-name">${escapeHtml(c.name)}</span>
              </div>
              <button type="button" class="btn btn-danger btn-remove-cal" data-cal-id="${escapeHtml(c.id)}">Remove</button>
            </div>
          `;
        }).join('');
      } else {
        calBox.classList.add('hidden');
        calList.innerHTML = '';
      }

      renderEvents(data.events || [], data.calendars || []);
      if (showFeedback) {
        showToast(`Refreshed! Found ${(data.events || []).length} upcoming events.`, true);
      }
    } else {
      badge.className = 'badge badge-unlinked';
      badge.textContent = 'Not Linked';
      calBox.classList.add('hidden');
      calList.innerHTML = '';
      if (unlinkBtn) unlinkBtn.classList.add('hidden');
      if (saveBtn) saveBtn.textContent = '🔗 Connect Calendar';

      if (data.reminderMinutes !== undefined) {
        const leadSelect = document.getElementById('leadMinutes');
        if (leadSelect) leadSelect.value = String(data.reminderMinutes);
      }

      renderEvents([], []);
      if (showFeedback) {
        showToast('No active calendar linked.', false);
      }
    }
  } catch (err) {
    console.error('Failed to load user calendar:', err);
    if (showFeedback) {
      showToast('Could not load calendar data from server.', false);
    }
  } finally {
    if (refreshBtn) {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '🔄 Refresh';
    }
  }
}

function renderEvents(events, knownCalendars = []) {
  const container = document.getElementById('eventsList');
  if (!events || events.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🗓️</div>
        <div>No upcoming events found in the next 7 days.</div>
      </div>`;
    return;
  }

  container.innerHTML = events.slice(0, 10).map((ev) => {
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    const colorClass = getCalendarColorClass(ev.calendarName, knownCalendars);
    const rel = getRelativeTimeInfo(ev.start, ev.end, ev.isAllDay);

    const monthStr = start.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const dayNum = start.getDate();
    const weekdayStr = start.toLocaleDateString('en-US', { weekday: 'short' });

    const timeStr = ev.isAllDay
      ? `${weekdayStr}, ${monthStr} ${dayNum} • All Day`
      : `${weekdayStr}, ${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

    const calBadge = ev.calendarName
      ? `<span class="badge-cal">${escapeHtml(ev.calendarName)}</span>`
      : '';

    return `
      <div class="event-item ${colorClass}">
        <div class="event-date-box">
          <div class="date-month">${monthStr}</div>
          <div class="date-day">${dayNum}</div>
          <div class="date-weekday">${weekdayStr}</div>
        </div>
        <div class="event-body">
          <div class="event-top-row">
            <span class="event-title">${escapeHtml(ev.title)}</span>
            ${calBadge}
            <span class="badge-rel ${rel.className}">${rel.text}</span>
          </div>
          <div class="event-meta">
            <span>⏰ ${timeStr}</span>
            ${ev.location ? `<span>📍 ${escapeHtml(ev.location)}</span>` : ''}
          </div>
          ${ev.description ? `<div class="event-desc">${escapeHtml(ev.description)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

/* ==========================================================================
   Calendar & Preferences Management
   ========================================================================== */

async function unlinkSingleCalendar(calendarId, btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Removing...';
  }

  try {
    const res = await fetch(`/api/user/${encodeURIComponent(currentUserId)}/calendar?calendarId=${encodeURIComponent(calendarId)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Calendar removed successfully.', true);
      await loadCalendar();
    } else {
      showToast('Could not remove calendar: ' + (data.error || 'Server error'), false);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Remove';
      }
    }
  } catch (err) {
    console.error('Failed to remove calendar:', err);
    showToast('Network error while removing calendar.', false);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Remove';
    }
  }
}

async function saveCalendar() {
  const icalInput = document.getElementById('icalInput');
  const calNameInput = document.getElementById('calNameInput');
  const icalUrl = icalInput.value.trim();
  const name = calNameInput.value.trim();
  const reminderMinutes = parseInt(document.getElementById('leadMinutes').value, 10);

  if (!icalUrl) {
    showToast('Please paste your Google Calendar secret iCal URL', false);
    icalInput.focus();
    return;
  }

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Connecting...';

  try {
    const res = await fetch(`/api/user/${encodeURIComponent(currentUserId)}/calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ icalUrl, name, reminderMinutes })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      showToast(`Linked ${name || 'Calendar'} successfully! Found ${data.eventCount} upcoming event(s).`, true);
      icalInput.value = '';
      calNameInput.value = '';
      await loadCalendar();
    } else {
      showToast(`Error: ${data.error || 'Failed to connect calendar'}`, false);
    }
  } catch (err) {
    console.error('Save calendar error:', err);
    showToast('Network error while connecting calendar.', false);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '➕ Add Calendar';
  }
}

async function unlinkCalendar() {
  const unlinkBtn = document.getElementById('unlinkBtn');

  // Iframe-safe two-step confirmation (never blocks on window.confirm)
  if (!unlinkConfirmActive) {
    unlinkConfirmActive = true;
    unlinkBtn.textContent = '⚠️ Click Again to Confirm';
    if (unlinkConfirmTimer) clearTimeout(unlinkConfirmTimer);
    unlinkConfirmTimer = setTimeout(() => {
      unlinkConfirmActive = false;
      unlinkBtn.textContent = 'Unlink All';
    }, 4000);
    return;
  }

  unlinkConfirmActive = false;
  if (unlinkConfirmTimer) clearTimeout(unlinkConfirmTimer);
  unlinkBtn.disabled = true;
  unlinkBtn.textContent = 'Unlinking...';

  try {
    const res = await fetch(`/api/user/${encodeURIComponent(currentUserId)}/calendar`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('All calendars unlinked successfully.', true);
      await loadCalendar();
    } else {
      showToast('Failed to unlink calendars.', false);
    }
  } catch (err) {
    console.error('Unlink error:', err);
    showToast('Network error while unlinking calendars.', false);
  } finally {
    unlinkBtn.disabled = false;
    unlinkBtn.textContent = 'Unlink All';
  }
}

async function savePreferences() {
  const saveBtn = document.getElementById('saveSettingsBtn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }

  const reminderMinutes = parseInt(document.getElementById('leadMinutes').value, 10);
  const timezone = document.getElementById('timezoneSelect').value;
  const dailyDigestEnabled = document.getElementById('dailyDigestToggle').checked;
  const dailyDigestTime = document.getElementById('dailyDigestTime').value || '08:00';

  try {
    const res = await fetch(`/api/user/${encodeURIComponent(currentUserId)}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reminderMinutes,
        timezone,
        dailyDigestEnabled,
        dailyDigestTime
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Preferences saved successfully!', true);
      if (lastCalendarData) {
        lastCalendarData.reminderMinutes = reminderMinutes;
        lastCalendarData.timezone = timezone;
        lastCalendarData.dailyDigestEnabled = dailyDigestEnabled;
        lastCalendarData.dailyDigestTime = dailyDigestTime;
        updateKpis(lastCalendarData);
      }
    } else {
      showToast(`Failed to save preferences: ${data.error || 'Server error'}`, false);
    }
  } catch (err) {
    console.error('Save preferences error:', err);
    showToast('Network error while saving preferences.', false);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Save Preferences';
    }
  }
}

/* ==========================================================================
   Test Reminders & Dev Account Switcher
   ========================================================================== */

async function testReminder() {
  const testBtn = document.getElementById('testBtn');
  if (testBtn) {
    testBtn.disabled = true;
    testBtn.textContent = '🔔 Sending...';
  }
  showToast('Sending test DM notification...', true);

  try {
    const res = await fetch(`/api/user/${encodeURIComponent(currentUserId)}/test`, { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.success) {
      if (data.isDemo) {
        showToast('✅ Demo test triggered! A notification DM was sent to the bot owner.', true);
      } else {
        showToast('✅ DM sent! Check your Discord direct messages.', true);
      }
    } else {
      showToast('⚠️ DM failed. Make sure your Discord user privacy allows DMs.', false);
    }
  } catch (err) {
    console.error('Test notification error:', err);
    showToast('Error sending test notification.', false);
  } finally {
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.textContent = '🔔 Test DM';
    }
  }
}

function reloadForUser() {
  const input = document.getElementById('customUserId');
  const val = input.value.trim();
  if (val) {
    currentUserId = val;
    updateAccountSwitcherUI();
    loadCalendar(true);
  }
}

function resetToDemo() {
  currentUserId = 'demo-user';
  const input = document.getElementById('customUserId');
  if (input) input.value = 'demo-user';
  updateAccountSwitcherUI();
  loadCalendar(true);
  showToast('Switched to Demo User preview.', true);
}

/* ==========================================================================
   Event Listeners & Form Bindings
   ========================================================================== */

function initEvents() {
  // Buttons
  document.getElementById('saveBtn')?.addEventListener('click', saveCalendar);
  document.getElementById('unlinkBtn')?.addEventListener('click', unlinkCalendar);
  document.getElementById('testBtn')?.addEventListener('click', testReminder);
  document.getElementById('refreshBtn')?.addEventListener('click', () => loadCalendar(true));
  document.getElementById('switchUserBtn')?.addEventListener('click', reloadForUser);
  document.getElementById('resetDemoBtn')?.addEventListener('click', resetToDemo);
  document.getElementById('saveSettingsBtn')?.addEventListener('click', savePreferences);

  // Delegated click listener for dynamic Remove buttons
  const connectedList = document.getElementById('connectedList');
  if (connectedList) {
    connectedList.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-remove-cal');
      if (btn) {
        const calId = btn.getAttribute('data-cal-id');
        if (calId) {
          unlinkSingleCalendar(calId, btn);
        }
      }
    });
  }

  // Enter key shortcuts
  document.getElementById('customUserId')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') reloadForUser();
  });
  document.getElementById('icalInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveCalendar();
  });
}

/* ==========================================================================
   Discord Embedded App SDK Initialization
   ========================================================================== */

async function initDiscord() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const frameId = urlParams.get('frame_id');
    const isInsideDiscord = Boolean(frameId || (window.parent && window.parent !== window));

    if (!isInsideDiscord) {
      return;
    }

    // Hide dev switcher when running inside Discord Activity
    const devBar = document.getElementById('devBar');
    if (devBar) devBar.classList.add('hidden');

    // Resolve Client ID
    let clientId = urlParams.get('client_id');
    if (!clientId) {
      try {
        const cfgRes = await fetch('/api/config');
        const cfgData = await cfgRes.json();
        clientId = cfgData.clientId;
      } catch (e) {}
    }
    clientId = clientId || '1562608613770403991';

    // Try auth with a 4s timeout so UI never hangs
    const authTask = (async () => {
      const { DiscordSDK } = await import('https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@1.1.0/+esm');
      const discordSdk = new DiscordSDK(clientId);
      await discordSdk.ready();

      let code;
      try {
        const resAuth = await discordSdk.commands.authorize({
          client_id: clientId,
          response_type: 'code',
          state: '',
          prompt: 'none',
          scope: ['identify']
        });
        code = resAuth.code;
      } catch {
        const resAuth = await discordSdk.commands.authorize({
          client_id: clientId,
          response_type: 'code',
          state: '',
          scope: ['identify']
        });
        code = resAuth.code;
      }

      const res = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const data = await res.json();
      return data.user?.id || null;
    })();

    const timeoutTask = new Promise((resolve) => setTimeout(() => resolve(null), 4000));
    const authenticatedUserId = await Promise.race([authTask, timeoutTask]);

    if (authenticatedUserId && authenticatedUserId !== currentUserId) {
      currentUserId = authenticatedUserId;
      updateAccountSwitcherUI();
      await loadCalendar();
    }
  } catch (err) {
    console.log('Discord SDK auth fallback:', err);
  }
}

/* ==========================================================================
   Initialization & Global Exposure
   ========================================================================== */

window.loadCalendar = loadCalendar;
window.unlinkSingleCalendar = unlinkSingleCalendar;
window.saveCalendar = saveCalendar;
window.unlinkCalendar = unlinkCalendar;
window.testReminder = testReminder;
window.reloadForUser = reloadForUser;
window.resetToDemo = resetToDemo;
window.savePreferences = savePreferences;

// Initialize immediately
initEvents();
updateAccountSwitcherUI();
loadCalendar();
initDiscord();
