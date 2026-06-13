// State
let settings = {
  intentGate: true,
  cleanTheater: true,
  zenTimer: true,
  timerDuration: 30,
  sessionNotes: []
};

let activeTimerInterval = null;
let secondsRemaining = 0;
let currentVideoUrl = '';

// Initialize
chrome.storage.local.get({
  intentGate: true,
  cleanTheater: true,
  zenTimer: true,
  timerDuration: 30,
  sessionNotes: []
}, (data) => {
  settings = data;
  init();
});

// Listen for updates from settings
chrome.storage.onChanged.addListener((changes) => {
  let changed = false;
  for (let key in changes) {
    settings[key] = changes[key].newValue;
    changed = true;
  }
  if (changed) {
    applySettings();
  }
});

function init() {
  applySettings();
  
  // YouTube is an SPA, check URL changes
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      handlePageChange();
    }
  }, 800);

  // Monitor DOM insertions for player & buttons
  const observer = new MutationObserver(() => {
    ensureUIElements();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Initial check
  ensureUIElements();
}

function applySettings() {
  // 1. Theater mode toggles classes
  if (settings.cleanTheater) {
    document.body.classList.add('it-theater-active');
  } else {
    document.body.classList.remove('it-theater-active');
  }

  // 2. Intent Gate toggles classes
  handleIntentGate();

  // 3. Zen Timer state
  updateZenTimerState();

  // 4. Notes list refresh
  renderNotesList();
}

function handlePageChange() {
  handleIntentGate();
  updateZenTimerState();
  ensureUIElements();
}

// ==========================================
// 1. Intent Gate Overlay
// ==========================================
function handleIntentGate() {
  const isHome = location.pathname === '/' || location.pathname === '/index.html';
  const overlayExists = document.querySelector('.it-gate-overlay');

  if (isHome && settings.intentGate) {
    document.body.classList.add('it-gate-active');
    if (!overlayExists) {
      injectIntentGate();
    }
  } else {
    document.body.classList.remove('it-gate-active');
    if (overlayExists) {
      overlayExists.remove();
    }
  }
}

function injectIntentGate() {
  const overlay = document.createElement('div');
  overlay.className = 'it-gate-overlay';

  overlay.innerHTML = `
    <div class="it-gate-content">
      <img src="${chrome.runtime.getURL('assets/IntentTube_logo.avif')}" class="it-gate-logo" alt="IntentTube">
      <h1 class="it-gate-title"><span>IntentTube</span></h1>
      <p class="it-gate-tagline">Turn passive watching into purposeful viewing.</p>
      <form class="it-gate-search-form">
        <input type="text" class="it-gate-search-input" placeholder="What are you here to watch or learn?" required autofocus>
        <button type="submit" class="it-gate-search-btn">Search</button>
      </form>
    </div>
  `;

  // Prevent default page actions & background scrolling
  overlay.addEventListener('wheel', (e) => e.stopPropagation());

  const form = overlay.querySelector('.it-gate-search-form');
  const input = overlay.querySelector('.it-gate-search-input');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (query) {
      // Navigate to search results
      window.location.href = `/results?search_query=${encodeURIComponent(query)}`;
    }
  });

  // Inject into body (ensure page-manager exists or fallback)
  const manager = document.getElementById('page-manager') || document.body;
  manager.appendChild(overlay);
}

// ==========================================
// 2. Timestamped Notes Sidebar UI
// ==========================================
function ensureUIElements() {
  const isWatch = location.pathname === '/watch';
  
  // Manage notes trigger button & sidebar
  let toggleBtn = document.querySelector('.it-notes-toggle-btn');
  let sidebar = document.querySelector('.it-notes-sidebar');

  if (isWatch) {
    if (!toggleBtn) {
      injectNotesUI();
    }
    // Update active video url for notes grouping
    if (currentVideoUrl !== location.href) {
      currentVideoUrl = location.href;
      renderNotesList();
    }
    // Inject timer badge
    injectTimerBadge();
  } else {
    if (toggleBtn) toggleBtn.remove();
    if (sidebar) sidebar.remove();
    removeTimerBadge();
  }
}

function injectNotesUI() {
  // Toggle Button
  const btn = document.createElement('button');
  btn.className = 'it-notes-toggle-btn';
  btn.innerHTML = '📝';
  btn.title = 'IntentTube Study Notes';
  btn.addEventListener('click', () => {
    const sb = document.querySelector('.it-notes-sidebar');
    if (sb) sb.classList.toggle('open');
  });
  document.body.appendChild(btn);

  // Sidebar
  const sidebar = document.createElement('div');
  sidebar.className = 'it-notes-sidebar';
  sidebar.innerHTML = `
    <div class="it-notes-header">
      <h3>Session Notes</h3>
      <button class="it-notes-close-btn">✕</button>
    </div>
    <div class="it-notes-input-area">
      <textarea class="it-notes-input" placeholder="Type a note and press Enter..."></textarea>
      <div class="it-notes-input-hint">Notes save automatically with current timestamp</div>
    </div>
    <div class="it-notes-list-container">
      <ul class="it-notes-list"></ul>
    </div>
  `;

  sidebar.querySelector('.it-notes-close-btn').addEventListener('click', () => {
    sidebar.classList.remove('open');
  });

  const textarea = sidebar.querySelector('.it-notes-input');
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveCurrentNote(textarea.value.trim());
      textarea.value = '';
    }
  });

  document.body.appendChild(sidebar);
  renderNotesList();
}

function saveCurrentNote(noteText) {
  if (!noteText) return;

  const video = document.querySelector('video');
  const timestamp = video ? formatTime(video.currentTime) : '0:00';
  const videoTitleEl = document.querySelector('ytd-watch-metadata h1 yt-formatted-string') || document.querySelector('h1.title');
  const videoTitle = videoTitleEl ? videoTitleEl.textContent.trim() : document.title;

  const newNote = {
    id: Date.now(),
    videoUrl: location.href.split('&')[0], // Base watch link
    videoTitle: videoTitle,
    timestamp: timestamp,
    noteText: noteText
  };

  chrome.storage.local.get({ sessionNotes: [] }, (data) => {
    const updatedNotes = data.sessionNotes || [];
    updatedNotes.push(newNote);
    chrome.storage.local.set({ sessionNotes: updatedNotes }, () => {
      settings.sessionNotes = updatedNotes;
      renderNotesList();
    });
  });
}

function renderNotesList() {
  const list = document.querySelector('.it-notes-list');
  if (!list) return;

  list.innerHTML = '';
  
  const currentBaseUrl = location.href.split('&')[0];
  const currentVideoNotes = settings.sessionNotes.filter(n => n.videoUrl === currentBaseUrl);

  if (currentVideoNotes.length === 0) {
    list.innerHTML = `<li style="text-align: center; color: var(--it-text-secondary); font-size: 0.8rem; margin-top: 20px;">No notes for this video yet.</li>`;
    return;
  }

  currentVideoNotes.forEach(item => {
    const li = document.createElement('li');
    li.className = 'it-note-item';
    
    li.innerHTML = `
      <div class="it-note-header">
        <span class="it-note-timestamp" data-time="${item.timestamp}">${item.timestamp}</span>
        <button class="it-note-delete" data-id="${item.id}">Delete</button>
      </div>
      <div class="it-note-text">${escapeHtml(item.noteText)}</div>
    `;

    // Click timestamp to seek video
    li.querySelector('.it-note-timestamp').addEventListener('click', () => {
      const video = document.querySelector('video');
      if (video) {
        video.currentTime = parseTime(item.timestamp);
        video.play();
      }
    });

    // Delete note
    li.querySelector('.it-note-delete').addEventListener('click', () => {
      deleteNote(item.id);
    });

    list.appendChild(li);
  });
}

function deleteNote(id) {
  chrome.storage.local.get({ sessionNotes: [] }, (data) => {
    const updated = data.sessionNotes.filter(n => n.id !== id);
    chrome.storage.local.set({ sessionNotes: updated }, () => {
      settings.sessionNotes = updated;
      renderNotesList();
    });
  });
}

// ==========================================
// 3. Zen Timer Logic
// ==========================================
function updateZenTimerState() {
  clearInterval(activeTimerInterval);
  activeTimerInterval = null;
  removeBreakModal();

  if (!settings.zenTimer) {
    removeTimerBadge();
    return;
  }

  // Set initial countdown
  secondsRemaining = settings.timerDuration * 60;
  injectTimerBadge();

  // Watch player status
  activeTimerInterval = setInterval(() => {
    const video = document.querySelector('video');
    
    // Only countdown if video is active and playing
    if (video && !video.paused && !video.ended) {
      if (secondsRemaining > 0) {
        secondsRemaining--;
        updateTimerBadge();
      } else {
        triggerFocusBreak();
      }
    }
  }, 1000);
}

function injectTimerBadge() {
  if (!settings.zenTimer) return;
  
  const player = document.querySelector('.html5-video-player');
  if (!player) return;

  let badge = player.querySelector('.it-timer-badge');
  if (!badge) {
    badge = document.createElement('div');
    badge.className = 'it-timer-badge';
    player.appendChild(badge);
  }
  updateTimerBadge();
}

function removeTimerBadge() {
  const badge = document.querySelector('.it-timer-badge');
  if (badge) badge.remove();
}

function updateTimerBadge() {
  const badge = document.querySelector('.it-timer-badge');
  if (!badge) return;

  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  badge.textContent = `⏱️ ${mins}:${secs.toString().padStart(2, '0')}`;
}

function triggerFocusBreak() {
  clearInterval(activeTimerInterval);
  activeTimerInterval = null;

  const video = document.querySelector('video');
  if (video) {
    video.pause();
  }

  const player = document.querySelector('.html5-video-player');
  if (!player) return;

  // Add blur class
  player.classList.add('it-blur-active');

  // Inject modal overlay
  let modal = player.querySelector('.it-break-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'it-break-modal';
    modal.innerHTML = `
      <div class="it-break-logo">🧘</div>
      <div class="it-break-title">Mindful Break Time</div>
      <div class="it-break-subtitle">You set a limit of ${settings.timerDuration} minutes. Time to stretch!</div>
      <button class="it-break-btn">Resume Session</button>
    `;

    modal.querySelector('.it-break-btn').addEventListener('click', () => {
      removeBreakModal();
      // Restart timer for another session
      updateZenTimerState();
      if (video) video.play();
    });

    player.appendChild(modal);
  }
}

function removeBreakModal() {
  const player = document.querySelector('.html5-video-player');
  if (player) {
    player.classList.remove('it-blur-active');
    const modal = player.querySelector('.it-break-modal');
    if (modal) modal.remove();
  }
}

// ==========================================
// Utility Helpers
// ==========================================
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseTime(timestamp) {
  const parts = timestamp.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
