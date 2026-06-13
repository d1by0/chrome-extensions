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

// Note start time tracker
let activeNoteTimestamp = null;

// English Autocorrect Map
const AUTOCORRECT_MAP = {
  "teh": "the",
  "recieve": "receive",
  "seperate": "separate",
  "wich": "which",
  "dont": "don't",
  "cant": "can't",
  "wont": "won't",
  "freind": "friend",
  "beleive": "believe",
  "definately": "definitely",
  "im": "I'm",
  "youre": "you're",
  "its": "it's"
};

// Context-Aware Intent Suggestions Map
const INTENT_SUGGESTIONS = {
  "cinematography": [
    "best cinematography techniques for beginners",
    "solo filmmaking tips & lighting guide",
    "how to make videos look cinematic"
  ],
  "filmmaking": [
    "solo filmmaking tips & lighting guide",
    "how to write a short film script",
    "indie film directing masterclass"
  ],
  "coding": [
    "clean code best practices & architecture",
    "how to start coding as a beginner",
    "data structures and algorithms tutorial"
  ],
  "javascript": [
    "javascript async await explanation",
    "modern javascript features you should know",
    "javascript arrays and objects masterclass"
  ],
  "design": [
    "ux design core principles for beginners",
    "how to design clean web interfaces",
    "color theory and typography rules"
  ],
  "photography": [
    "photography composition rules and shots",
    "how to shoot manual mode photography",
    "lighting basics for portrait photography"
  ]
};

// Trending search topics
const TRENDING_TOPICS = [
  "Next.js 15 App Router Tutorial",
  "Solo Filmmaking Tips",
  "Clean Architecture Coding Guidelines",
  "Cinematic Lighting Setup Guide"
];

// SVG Assets
const SVG_SEARCH = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="it-autocomplete-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
const SVG_PENCIL = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`;
const SVG_TIMER = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
const SVG_BULB = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: #ffcc00;" class="it-autocomplete-icon"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .5 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"></path><line x1="9" y1="18" x2="15" y2="18"></line><line x1="10" y1="22" x2="14" y2="22"></line></svg>`;
const SVG_FIRE = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#ff4500" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="it-autocomplete-icon"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>`;

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

  const placeholder = document.createElement('div');
  placeholder.className = 'it-home-placeholder';
  placeholder.innerHTML = `
    <h1>IntentTube</h1>
    <p>Turn passive watching into purposeful viewing.</p>
    <form class="it-home-search-box">
      <input type="text" class="it-home-search-input" placeholder="What are you here to watch or learn?" required autofocus autocomplete="off">
      <button type="submit" class="it-home-search-btn">Search</button>
    </form>
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

  // Listen to search autocomplete fetch
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    if (!query) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      currentSuggestions = [];
      activeIndex = -1;
      return;
    }

    // Check for context-aware focus suggestions
    let contextualList = [];
    for (const key in INTENT_SUGGESTIONS) {
      if (query.includes(key) || key.includes(query)) {
        contextualList = INTENT_SUGGESTIONS[key];
        break;
      }
    }

    // Check for trending topics
    let trendingList = [];
    TRENDING_TOPICS.forEach(topic => {
      if (topic.toLowerCase().includes(query)) {
        trendingList.push(topic);
      }
    });

    fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(data => {
        const standardSuggestions = data[1] || [];
        
        // Build hybrid suggestion items (Prioritize smart contextual guides, then trending fire items, then standard suggestions)
        const combined = [];
        contextualList.forEach(item => {
          combined.push({ text: item, type: 'contextual' });
        });

        trendingList.forEach(item => {
          if (!combined.some(c => c.text.toLowerCase() === item.toLowerCase())) {
            combined.push({ text: item, type: 'trending' });
          }
        });
        
        // Deduplicate and append standard suggestions
        standardSuggestions.forEach(item => {
          if (!combined.some(c => c.text.toLowerCase() === item.toLowerCase())) {
            combined.push({ text: item, type: 'standard' });
          }
        });

        currentSuggestions = combined.slice(0, 7); // Keep top 7 total items
        activeIndex = -1;

        if (currentSuggestions.length === 0) {
          dropdown.style.display = 'none';
          dropdown.innerHTML = '';
          return;
        }

        dropdown.innerHTML = currentSuggestions.map((item, idx) => {
          let icon = SVG_SEARCH;
          if (item.type === 'contextual') icon = SVG_BULB;
          else if (item.type === 'trending') icon = SVG_FIRE;

          return `
            <li class="it-autocomplete-item ${item.type === 'contextual' ? 'contextual-suggest' : ''}" data-index="${idx}">
              ${icon}
              <span class="it-autocomplete-text" style="${item.type !== 'standard' ? 'font-weight: 500;' : ''}">${escapeHtml(item.text)}</span>
            </li>
          `;
        }).join('');
        dropdown.style.display = 'block';

        // Click selection
        dropdown.querySelectorAll('.it-autocomplete-item').forEach(itemEl => {
          itemEl.addEventListener('click', () => {
            const index = parseInt(itemEl.dataset.index, 10);
            const selectedText = currentSuggestions[index].text;
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
        const selectedText = currentSuggestions[activeIndex].text;
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
        input.value = currentSuggestions[idx].text;
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

  // Re-display suggestions when focusing back in
  input.addEventListener('focus', () => {
    if (input.value.trim() && currentSuggestions.length > 0) {
      dropdown.style.display = 'block';
    }
  });

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
  if (document.querySelector('.it-notes-sidebar')) return;

  // 1. Draggable Floating Pencil Toggle Button
  const btn = document.createElement('button');
  btn.className = 'it-notes-toggle-btn';
  btn.innerHTML = SVG_PENCIL;
  btn.title = 'IntentTube Study Notes';

  // Draggable support
  let isDragging = false;
  let startX, startY;
  let offsetX, offsetY;

  btn.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    offsetX = e.clientX - btn.getBoundingClientRect().left;
    offsetY = e.clientY - btn.getBoundingClientRect().top;
    btn.style.transition = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    btn.style.left = `${e.clientX - offsetX}px`;
    btn.style.top = `${e.clientY - offsetY}px`;
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
  });

  document.addEventListener('mouseup', (e) => {
    if (isDragging) {
      isDragging = false;
      btn.style.transition = 'transform 0.2s, background 0.2s';
      
      // If moved less than 5px, trigger standard click toggle
      const deltaX = Math.abs(e.clientX - startX);
      const deltaY = Math.abs(e.clientY - startY);
      if (deltaX < 5 && deltaY < 5) {
        const sb = document.querySelector('.it-notes-sidebar');
        if (sb) sb.classList.toggle('open');
      }
    }
  });

  document.body.appendChild(btn);

  // 2. Sidebar Panel
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
      <div class="it-notes-summary-container"></div>
    </div>
  `;

  sidebar.querySelector('.it-notes-close-btn').addEventListener('click', () => {
    sidebar.classList.remove('open');
  });

  const textarea = sidebar.querySelector('.it-notes-input');

  // Input listener to capture start timestamp when typing begins
  textarea.addEventListener('input', () => {
    const video = document.querySelector('video');
    if (video && activeNoteTimestamp === null && textarea.value.trim().length > 0) {
      activeNoteTimestamp = formatTime(video.currentTime);
      sidebar.querySelector('.it-notes-input-hint').textContent = `Capturing note starting at [${activeNoteTimestamp}]...`;
    }
    if (textarea.value.trim().length === 0) {
      activeNoteTimestamp = null;
      sidebar.querySelector('.it-notes-input-hint').textContent = `Note will save automatically with the video timestamp`;
    }
  });

  // Autocorrect spelling mistakes on space
  textarea.addEventListener('keydown', (e) => {
    if (e.key === ' ') {
      const text = textarea.value;
      const cursor = textarea.selectionStart;
      const beforeCursor = text.slice(0, cursor);
      const words = beforeCursor.split(/\s+/);
      const lastWord = words[words.length - 1];

      if (AUTOCORRECT_MAP[lastWord.toLowerCase()]) {
        const corrected = AUTOCORRECT_MAP[lastWord.toLowerCase()];
        const finalWord = lastWord[0] === lastWord[0].toUpperCase() ? corrected[0].toUpperCase() + corrected.slice(1) : corrected;
        const newBeforeCursor = beforeCursor.slice(0, -lastWord.length) + finalWord;
        
        textarea.value = newBeforeCursor + text.slice(cursor);
        textarea.selectionStart = textarea.selectionEnd = newBeforeCursor.length;
      }
    }

    // Submit note
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveCurrentNote(textarea.value.trim());
      textarea.value = '';
      activeNoteTimestamp = null;
      sidebar.querySelector('.it-notes-input-hint').textContent = `Note will save automatically with the video timestamp`;
    }
  });

  document.body.appendChild(sidebar);
  renderNotesList();
}

function saveCurrentNote(noteText) {
  if (!noteText) return;

  const video = document.querySelector('video');
  const timestamp = activeNoteTimestamp || (video ? formatTime(video.currentTime) : '0:00');
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
    const summaryContainer = document.querySelector('.it-notes-summary-container');
    if (summaryContainer) summaryContainer.innerHTML = '';
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

  // Generate dynamic notes summary block
  renderNotesSummary(currentVideoNotes);
}

function renderNotesSummary(notes) {
  const container = document.querySelector('.it-notes-summary-container');
  if (!container) return;

  // Build key highlights list (TL;DR from first few words of notes)
  const highlights = notes.slice(0, 3).map(n => {
    const cleanText = n.noteText.length > 35 ? n.noteText.slice(0, 35) + '...' : n.noteText;
    return `<li>At ${n.timestamp}: ${escapeHtml(cleanText)}</li>`;
  }).join('');

  container.innerHTML = `
    <div class="it-notes-summary-box">
      <div class="it-notes-summary-title">Study Block Summary</div>
      <div>Notes taken: <strong>${notes.length} key points</strong></div>
      <ul style="margin-top: 6px; padding-left: 12px; list-style-type: disc;">
        ${highlights}
      </ul>
    </div>
  `;
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
    removeTimerBadgeControls();
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
      removeTimerBadgeControls();
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
    badge.title = 'Click to adjust timer duration';
    
    // Toggle adjust panel on click
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const controls = player.querySelector('.it-timer-badge-controls');
      if (controls) {
        controls.classList.toggle('active');
      }
    });

    player.appendChild(badge);
  }

  // Inject adjusting controls overlay
  let controls = player.querySelector('.it-timer-badge-controls');
  if (!controls) {
    controls = document.createElement('div');
    controls.className = 'it-timer-badge-controls';
    controls.innerHTML = `
      <button class="it-timer-adjust-btn btn-plus">+5m</button>
      <button class="it-timer-adjust-btn btn-minus">-5m</button>
    `;

    controls.querySelector('.btn-plus').addEventListener('click', (e) => {
      e.stopPropagation();
      secondsRemaining += 5 * 60;
      updateTimerBadge();
    });

    controls.querySelector('.btn-minus').addEventListener('click', (e) => {
      e.stopPropagation();
      if (secondsRemaining > 5 * 60) {
        secondsRemaining -= 5 * 60;
      } else {
        secondsRemaining = 0;
      }
      updateTimerBadge();
    });

    // Close controls panel clicking anywhere else in player
    player.addEventListener('click', () => {
      controls.classList.remove('active');
    });

    player.appendChild(controls);
  }

  updateTimerBadge();
}

function removeTimerBadge() {
  const badge = document.querySelector('.it-timer-badge');
  if (badge) badge.remove();
}

function removeTimerBadgeControls() {
  const controls = document.querySelector('.it-timer-badge-controls');
  if (controls) controls.remove();
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
  
  // SVG Timer rendering
  badge.innerHTML = `${SVG_TIMER} ${mins}:${secs.toString().padStart(2, '0')}`;
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
