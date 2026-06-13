// State Management
let settings = {
  extensionEnabled: true,
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

// Rotating Focus Quotes
const FOCUS_QUOTES = [
  "Focus is a muscle, and you are building it right now.",
  "Your attention is your most valuable asset. Guard it carefully.",
  "Deep work is the superpower of the 21st century.",
  "Don't count the minutes; make the minutes count.",
  "The difference between average and exceptional is focus."
];

// Clickable Search Suggestions
const SEARCH_SUGGESTIONS = [
  "Next.js 15 Deep Dive",
  "CSS Flexbox & Grid Guide",
  "TypeScript Tutorial",
  "Mindful Breathing Meditation",
  "History of Web Development"
];

// Load settings from storage before starting anything
chrome.storage.local.get({
  extensionEnabled: true,
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
  
  // Track SPA navigation and periodically verify elements
  let lastUrl = location.href;
  setInterval(() => {
    if (!settings.extensionEnabled) return;
    
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      handlePageChange();
    } else {
      // Safe periodic check (no MutationObserver loops)
      ensureUIElements();
      handleIntentGate();
    }
  }, 1000);

  // Initial check
  ensureUIElements();
}

function applySettings() {
  // If master toggle is disabled, clean up everything immediately and return
  if (!settings.extensionEnabled) {
    document.body.classList.remove('it-theater-active');
    document.body.classList.remove('it-gate-active');
    
    const placeholder = document.querySelector('.it-home-placeholder');
    if (placeholder) placeholder.remove();
    
    const toggleBtn = document.querySelector('.it-notes-toggle-btn');
    if (toggleBtn) toggleBtn.remove();
    
    const sidebar = document.querySelector('.it-notes-sidebar');
    if (sidebar) sidebar.remove();
    
    removeTimerBadge();
    removeBreakModal();
    clearInterval(activeTimerInterval);
    activeTimerInterval = null;
    return;
  }

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
  if (!settings.extensionEnabled) return;
  handleIntentGate();
  updateZenTimerState();
  ensureUIElements();
}

// ==========================================
// 1. Intent Gate (Home Page Feed Hiding)
// ==========================================
function handleIntentGate() {
  if (!settings.extensionEnabled) return;

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

  // Select a random quote
  const randomQuote = FOCUS_QUOTES[Math.floor(Math.random() * FOCUS_QUOTES.length)];

  // Create suggestions HTML
  const suggestionsHtml = SEARCH_SUGGESTIONS.map(term => 
    `<span class="it-home-suggestion-chip" data-query="${term}">${term}</span>`
  ).join('');

  const placeholder = document.createElement('div');
  placeholder.className = 'it-home-placeholder';
  placeholder.innerHTML = `
    <h1>IntentTube</h1>
    <p>Turn passive watching into purposeful viewing.</p>
    <form class="it-home-search-box">
      <input type="text" class="it-home-search-input" placeholder="What are you here to watch or learn?" required autofocus autocomplete="off">
      <button type="submit" class="it-home-search-btn">Search</button>
    </form>
    <div class="it-home-suggestions">
      ${suggestionsHtml}
    </div>
    <div class="it-home-quote">
      "${randomQuote}"
    </div>
  `;

  // Bind form search
  const form = placeholder.querySelector('.it-home-search-box');
  const input = placeholder.querySelector('.it-home-search-input');

  // Create dropdown container
  const dropdown = document.createElement('ul');
  dropdown.className = 'it-autocomplete-dropdown';
  form.appendChild(dropdown);

  let activeIndex = -1;
  let currentSuggestions = [];

  // Listen to search autocomplete fetch (client=firefox yields clean JSON)
  input.addEventListener('input', () => {
    const query = input.value.trim();
    if (!query) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      currentSuggestions = [];
      activeIndex = -1;
      return;
    }

    fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(data => {
        const suggestions = data[1] || [];
        currentSuggestions = suggestions.slice(0, 6); // Keep top 6 items
        activeIndex = -1;

        if (currentSuggestions.length === 0) {
          dropdown.style.display = 'none';
          dropdown.innerHTML = '';
          return;
        }

        dropdown.innerHTML = currentSuggestions.map((item, idx) => `
          <li class="it-autocomplete-item" data-index="${idx}">
            <span class="it-autocomplete-icon">🔍</span>
            <span class="it-autocomplete-text">${escapeHtml(item)}</span>
          </li>
        `).join('');
        dropdown.style.display = 'block';

        // Click selection
        dropdown.querySelectorAll('.it-autocomplete-item').forEach(itemEl => {
          itemEl.addEventListener('click', () => {
            const index = parseInt(itemEl.dataset.index, 10);
            const selectedText = currentSuggestions[index];
            input.value = selectedText;
            window.location.href = `/results?search_query=${encodeURIComponent(selectedText)}`;
          });
        });
      })
      .catch(err => {
        console.error("IntentTube Autocomplete Error:", err);
      });
  });

  // Keyboard navigation
  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll('.it-autocomplete-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      updateActiveItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      updateActiveItem(items);
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < currentSuggestions.length) {
        e.preventDefault();
        const selectedText = currentSuggestions[activeIndex];
        input.value = selectedText;
        window.location.href = `/results?search_query=${encodeURIComponent(selectedText)}`;
      }
    } else if (e.key === 'Escape') {
      dropdown.style.display = 'none';
      activeIndex = -1;
    }
  });

  function updateActiveItem(items) {
    items.forEach((item, idx) => {
      if (idx === activeIndex) {
        item.classList.add('active');
        input.value = currentSuggestions[idx];
      } else {
        item.classList.remove('active');
      }
    });
  }

  // Close dropdown on click outside search box
  document.addEventListener('click', (e) => {
    if (!form.contains(e.target)) {
      dropdown.style.display = 'none';
      activeIndex = -1;
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = input.value.trim();
    if (query) {
      window.location.href = `/results?search_query=${encodeURIComponent(query)}`;
    }
  });

  // Bind search suggestions click
  placeholder.querySelectorAll('.it-home-suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const query = chip.dataset.query;
      window.location.href = `/results?search_query=${encodeURIComponent(query)}`;
    });
  });

  homeContainer.appendChild(placeholder);
}

// ==========================================
// 2. Notes Sidebar & Dynamic Watch Elements
// ==========================================
function ensureUIElements() {
  if (!settings.extensionEnabled) return;

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
  if (!settings.extensionEnabled) return;
  // Prevent double injection
  if (document.querySelector('.it-notes-sidebar')) return;

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

  if (!settings.extensionEnabled) return;

  const isWatch = location.pathname === '/watch';
  if (!settings.zenTimer || !isWatch) {
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
    const isWatchPage = location.pathname === '/watch';
    
    if (!isWatchPage || !settings.extensionEnabled) {
      clearInterval(activeTimerInterval);
      activeTimerInterval = null;
      removeTimerBadge();
      return;
    }

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
  if (settings.zenTimer && settings.extensionEnabled) {
    secondsRemaining = settings.timerDuration * 60;
    updateTimerBadge();
  }
}

function injectTimerBadge() {
  if (!settings.zenTimer || !settings.extensionEnabled) return;
  
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

// Ensure secondsRemaining is numeric and valid before rendering
function updateTimerBadge() {
  const badge = document.querySelector('.it-timer-badge');
  if (!badge) return;

  if (secondsRemaining === null || isNaN(secondsRemaining)) {
    secondsRemaining = settings.timerDuration * 60;
  }

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

// HTML Escaper
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
