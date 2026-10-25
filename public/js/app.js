/* ==========================================================================
   State & Configuration
   ========================================================================== */

let currentUserId = 'demo-user';
let unlinkConfirmActive = false;
let unlinkConfirmTimer = null;
let toastTimer = null;

/* ==========================================================================
   Toast & UI Helpers
   ========================================================================== */

function showToast(msg, isSuccess = true) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.borderColor = isSuccess ? 'var(--success)' : 'var(--danger)';
  toast.style.color = isSuccess ? 'var(--text-header)' : '#ff7b72';
  toast.style.display = 'block';
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.display = 'none';
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

    if (data.userId) {
      currentUserId = data.userId;
      const userField = document.getElementById('customUserId');
      if (userField) userField.value = data.userId;
    }

    const badge = document.getElementById('statusBadge');
    const unlinkBtn = document.getElementById('unlinkBtn');
    const saveBtn = document.getElementById('saveBtn');
    const calBox = document.getElementById('calendarsContainer');
    const calList = document.getElementById('connectedList');

    if (data.linked) {
      const calCount = (data.calendars && data.calendars.length) || 1;
      badge.className = 'badge badge-success';
      badge.textContent = `${calCount} Active Calendar(s)`;
      unlinkBtn.style.display = 'inline-flex';
      unlinkBtn.textContent = 'Unlink All';
      unlinkConfirmActive = false;
      saveBtn.textContent = '➕ Add Calendar';

      if (data.reminderMinutes !== undefined) {
        document.getElementById('leadMinutes').value = String(data.reminderMinutes);
      }

      if (data.calendars && data.calendars.length > 0) {
        calBox.style.display = 'block';
        calList.innerHTML = data.calendars.map((c) => `
          <div style="display: flex; align-items: center; justify-content: space-between; background: var(--bg-card); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border);">
            <span style="font-size: 0.88rem; font-weight: 500;">📅 ${escapeHtml(c.name)}</span>
            <button type="button" class="btn btn-danger btn-remove-cal" data-cal-id="${escapeHtml(c.id)}" style="padding: 4px 10px; font-size: 0.75rem; cursor: pointer;">Remove</button>
          </div>
        `).join('');
      } else {
        calBox.style.display = 'none';
        calList.innerHTML = '';
      }

      renderEvents(data.events || []);
      if (showFeedback) {
        showToast(`Refreshed! Found ${(data.events || []).length} upcoming events.`, true);
      }
    } else {
      badge.className = 'badge badge-unlinked';
      badge.textContent = 'Not Linked';
      calBox.style.display = 'none';
      calList.innerHTML = '';
      unlinkBtn.style.display = 'none';
      saveBtn.textContent = '🔗 Connect Calendar';
      renderEvents([]);
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

function renderEvents(events) {
  const container = document.getElementById('eventsList');
  if (!events || events.length === 0) {
    container.innerHTML = `
      <div style="color: var(--text-muted); font-size: 0.85rem; padding: 12px 0;">
        No upcoming events found in the next 7 days.
      </div>`;
    return;
  }

  container.innerHTML = events.slice(0, 10).map((ev) => {
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    const timeStr = ev.isAllDay
      ? start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + ' (All Day)'
      : `${start.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}, ${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

    const calBadge = ev.calendarName
      ? `<span style="font-size: 0.72rem; background: rgba(88,101,242,0.15); color: var(--primary); padding: 2px 6px; border-radius: 4px; font-weight: 600; margin-left: 8px;">${escapeHtml(ev.calendarName)}</span>`
      : '';

    return `
      <div class="event-item">
        <div class="event-title">${escapeHtml(ev.title)}${calBadge}</div>
        <div class="event-meta">
          <span>⏰ ${timeStr}</span>
          ${ev.location ? `<span>📍 ${escapeHtml(ev.location)}</span>` : ''}
        </div>
        ${ev.description ? `<div style="font-size: 0.8rem; color: var(--text-normal); margin-top: 6px; line-height: 1.4;">${escapeHtml(ev.description)}</div>` : ''}
      </div>
    `;
  }).join('');
}

/* ==========================================================================
   Calendar Management Operations
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
    loadCalendar(true);
  }
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

  // Lead time dropdown change listener
  document.getElementById('leadMinutes')?.addEventListener('change', async (e) => {
    const reminderMinutes = parseInt(e.target.value, 10);
    try {
      const res = await fetch(`/api/user/${encodeURIComponent(currentUserId)}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminderMinutes })
      });
      if (res.ok) {
        showToast(`Alert timing updated to ${reminderMinutes} minutes before start!`, true);
      } else {
        showToast('Failed to update alert timing.', false);
      }
    } catch (err) {
      showToast('Failed to update alert timing.', false);
    }
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
    if (devBar) devBar.style.display = 'none';

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
      const userField = document.getElementById('customUserId');
      if (userField) userField.value = authenticatedUserId;
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

// Initialize immediately
initEvents();
loadCalendar();
initDiscord();
