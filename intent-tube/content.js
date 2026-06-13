// State Management
let settings = {
  intentGate: true,
  cleanTheater: true,
  zenTimer: true,
  timerDuration: 30,
  sessionNotes: []
};

let activeTimerInterval = null;
let secondsRemaining = null;
let currentVideoUrl = '';
let isInitialized = false;

// Load settings from storage before starting anything
chrome.storage.local.get({
  intentGate: true,
  cleanTheater: true,
  zenTimer: true,
  timerDuration: 30,
  sessionNotes: []
}, (data) => {
  settings = data;
  isInitialized = true;
  init();
});

// Listen to storage changes
chrome.storage.onChanged.addListener((changes) => {
  let changed = false;
  for (let key in changes) {
    settings[key] = changes[key].newValue;
    changed = true;
  }
  if (changed && isInitialized) {
    applySettings();
  }
});

function init() {
  applySettings();
  
  // Track SPA navigation
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      handlePageChange();
    }
  }, 1000);

  // Monitor DOM insertions for player & containers
  const observer = new MutationObserver(() => {
    ensureUIElements();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Initial check
  ensureUIElements();
}

function applySettings() {
  // 1. Theater mode
  if (settings.cleanTheater) {
    document.body.classList.add('it-theater-active');
  } else {
    document.body.classList.remove('it-theater-active');
  }

  // 2. Intent Gate (Home Feed)
  handleIntentGate();

  // 3. Zen Timer
  updateZenTimerState();

  // 4. Notes list
  renderNotesList();
}

function handlePageChange() {
  handleIntentGate();
  updateZenTimerState();
  ensureUIElements();
}

// ==========================================
// 1. Intent Gate (Home Page Feed Hiding)
// ==========================================
function handleIntentGate() {
  const isHome = location.pathname === '/' || location.pathname === '/index.html';
  const placeholderExists = document.querySelector('.it-home-placeholder');

  if (isHome && settings.intentGate) {
    document.body.classList.add('it-gate-active');
    
    // Inject clean placeholder inside home container if not present
    if (!placeholderExists) {
      injectIntentPlaceholder();
    }
  } else {
    document.body.classList.remove('it-gate-active');
    if (placeholderExists) {
      placeholderExists.remove();
    }
  }
}

function injectIntentPlaceholder() {
  // Find home container
  const homeContainer = document.querySelector('ytd-browse[page-subtype="home"]');
  if (!homeContainer) return;

  // Check again to prevent double injection
  if (homeContainer.querySelector('.it-home-placeholder')) return;

  const placeholder = document.createElement('div');
  placeholder.className = 'it-home-placeholder';
  placeholder.innerHTML = `
    <h1>IntentTube</h1>
    <p>Turn passive watching into purposeful viewing.</p>
    <form class="it-home-search-box">
      <input type="text" class="it-home-search-input" placeholder="What are you here to watch or learn?" required autofocus>
      <button type="submit" class="it-home-search-btn">Search</button>
    </form>
  `;

  const form = placeholder.querySelector('.it-home-search-box');
  const input = placeholder.querySelector('.it-home-search-input');

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (query) {
      window.location.href = `/results?search_query=${encodeURIComponent(query)}`;
    }
  });

  homeContainer.appendChild(placeholder);
}

// ==========================================
// 2. Notes Sidebar & Dynamic Watch Elements
// ==========================================
function ensureUIElements() {
  const isWatch = location.pathname === '/watch';
  let toggleBtn = document.querySelector('.it-notes-toggle-btn');
  let sidebar = document.querySelector('.it-notes-sidebar');

  if (isWatch) {
    if (!toggleBtn) {
      injectNotesUI();
    }
    
    // Check if video URL changed in watch tab
    if (currentVideoUrl !== location.href) {
      currentVideoUrl = location.href;
      renderNotesList();
      resetTimerForNewVideo();
    }
    
    injectTimerBadge();
  } else {
    if (toggleBtn) toggleBtn.remove();
    if (sidebar) sidebar.remove();
    removeTimerBadge();
  }
}

function injectNotesUI() {
  // Floating trigger button
  const btn = document.createElement('button');
  btn.className = 'it-notes-toggle-btn';
  btn.innerHTML = '📝';
  btn.title = 'IntentTube Study Notes';
  btn.addEventListener('click', () => {
    const sb = document.querySelector('.it-notes-sidebar');
    if (sb) sb.classList.toggle('open');
  });
  document.body.appendChild(btn);

  // Sidebar Panel
  const sidebar = document.createElement('div');
  sidebar.className = 'it-notes-sidebar';
  sidebar.innerHTML = `
    <div class="it-notes-header">
      <h3>Study Notes</h3>
      <button class="it-notes-close-btn">✕</button>
    </div>
    <div class="it-notes-input-area">
      <textarea class="it-notes-input" placeholder="Type a note and press Enter..."></textarea>
      <div class="it-notes-input-hint">Note will save automatically with the video timestamp</div>
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
    videoUrl: location.href.split('&')[0],
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
    list.innerHTML = `<li style="text-align: center; color: var(--yt-spec-text-secondary, #aaa); font-size: 12px; margin-top: 24px;">No notes for this video yet.</li>`;
    return;
  }

  currentVideoNotes.forEach(item => {
    const li = document.createElement('li');
    li.className = 'it-note-item';
    li.innerHTML = `
      <div class="it-note-header">
        <span class="it-note-timestamp">${item.timestamp}</span>
        <button class="it-note-delete" data-id="${item.id}">Delete</button>
      </div>
      <div class="it-note-text">${escapeHtml(item.noteText)}</div>
    `;

    // Seek on timestamp click
    li.querySelector('.it-note-timestamp').addEventListener('click', () => {
      const video = document.querySelector('video');
      if (video) {
        video.currentTime = parseTime(item.timestamp);
        video.play();
      }
    });

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

  // Set the timer duration if not already set
  if (secondsRemaining === null || secondsRemaining < 0) {
    secondsRemaining = settings.timerDuration * 60;
  }
  
  injectTimerBadge();

  // Watch video playback
  activeTimerInterval = setInterval(() => {
    const video = document.querySelector('video');
    
    // Only tick down if the video is actively playing
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

function resetTimerForNewVideo() {
  if (settings.zenTimer) {
    secondsRemaining = settings.timerDuration * 60;
    updateTimerBadge();
  }
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
  if (!badge || secondsRemaining === null) return;

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

  player.classList.add('it-blur-active');

  let modal = player.querySelector('.it-break-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'it-break-modal';
    modal.innerHTML = `
      <div class="it-break-title">Mindful Break</div>
      <div class="it-break-subtitle">Focus session completed (${settings.timerDuration}m). Take a break!</div>
      <button class="it-break-btn">Continue</button>
    `;

    modal.querySelector('.it-break-btn').addEventListener('click', () => {
      removeBreakModal();
      secondsRemaining = settings.timerDuration * 60;
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
// Helper Utilities
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
