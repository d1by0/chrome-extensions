// State Management
let settings = {
  extensionEnabled: true,
  intentGate: true,
  cleanTheater: true,
  zenTimer: true,
  timerDuration: 30,
  sessionNotes: [],
  geminiApiKey: ''
};

let activeTimerInterval = null;
let secondsRemaining = null;
let currentVideoUrl = '';
let isInitialized = false;

// Note start time tracker
let activeNoteTimestamp = null;
let activeScreenshotDataUrl = null;
let playbackSecondsThisSession = 0;

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

// Context-Aware Intent Suggestions Map (Triggers on word boundaries)
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
  sessionNotes: [],
  geminiApiKey: ''
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
    
    // Track focus minutes (active educational watch page time)
    const video = document.querySelector('video');
    const player = document.querySelector('.html5-video-player');
    const isPlaying = player && player.classList.contains('playing-mode');
    if (video && isPlaying && !video.paused && !video.ended && location.pathname === '/watch') {
      playbackSecondsThisSession++;
      if (playbackSecondsThisSession >= 60) {
        playbackSecondsThisSession = 0;
        incrementAnalytics('dailyMinutes', 1);
      }
    }

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

function incrementAnalytics(key, amount = 1) {
  const today = new Date().toISOString().slice(0, 10);
  chrome.storage.local.get({ analyticsData: { dailyMinutes: {}, dailyNotes: {}, blocksPrevented: {} } }, (data) => {
    const analytics = data.analyticsData;
    if (!analytics[key]) analytics[key] = {};
    analytics[key][today] = (analytics[key][today] || 0) + amount;
    chrome.storage.local.set({ analyticsData: analytics });
  });
}

function applySettings() {
  // If master toggle is disabled, clean up everything immediately and return
  if (!settings.extensionEnabled) {
    document.body.classList.remove('it-theater-active');
    document.body.classList.remove('it-gate-active');
    document.body.classList.remove('it-sidebar-open');
    
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

  // Increment blocked count
  incrementAnalytics('blocksPrevented', 1);

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

    // Check for context-aware focus suggestions (Strict Word Boundary check)
    let contextualList = [];
    for (const key in INTENT_SUGGESTIONS) {
      const regex = new RegExp(`\\b${key}\\b`, 'i');
      if (regex.test(query)) {
        contextualList = INTENT_SUGGESTIONS[key];
        break;
      }
    }

    fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(data => {
        const standardSuggestions = data[1] || [];
        
        // Build hybrid suggestions:
        // 1. Contextual guides (if triggered by word boundaries)
        // 2. Dynamic top 1-2 standard suggestions decorated as "trending"
        // 3. Normal search queries
        const combined = [];
        
        contextualList.forEach(item => {
          combined.push({ text: item, type: 'contextual' });
        });

        standardSuggestions.forEach((item, idx) => {
          if (!combined.some(c => c.text.toLowerCase() === item.toLowerCase())) {
            // Decorate top 2 elements from YouTube's own suggestions as trending
            const itemType = (idx < 2) ? 'trending' : 'standard';
            combined.push({ text: item, type: itemType });
          }
        });

        currentSuggestions = combined.slice(0, 6); // Keep top 6 total items
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
    } else {
      // Periodically update the video title link in case it was loading during first render
      updateSidebarVideoTitle();
    }
    
    injectTimerBadge();
  } else {
    if (toggleBtn) toggleBtn.remove();
    if (sidebar) sidebar.remove();
    removeTimerBadge();
    document.body.classList.remove('it-sidebar-open');
  }
}

function updateSidebarVideoTitle() {
  const videoLinkEl = document.querySelector('.it-current-video-link');
  if (videoLinkEl) {
    const currentBaseUrl = location.href.split('&')[0];
    const videoTitleEl = document.querySelector('ytd-watch-metadata h1 yt-formatted-string') || document.querySelector('h1.title');
    const videoTitle = videoTitleEl ? videoTitleEl.textContent.trim() : '';
    
    // Fallback to document title if DOM element not ready, but exclude generic "YouTube"
    let displayTitle = videoTitle;
    if (!displayTitle && document.title && document.title !== 'YouTube') {
      displayTitle = document.title;
    }
    if (!displayTitle) {
      displayTitle = 'Loading video title...';
    }

    if (videoLinkEl.textContent !== displayTitle || videoLinkEl.href !== currentBaseUrl) {
      videoLinkEl.href = currentBaseUrl;
      videoLinkEl.textContent = displayTitle;
      videoLinkEl.title = `Watch: ${displayTitle} (${currentBaseUrl})`;
      
      // Also update in notes summary if it exists
      const summaryLink = document.querySelector('.it-notes-summary-box a');
      if (summaryLink) {
        summaryLink.href = currentBaseUrl;
        summaryLink.textContent = displayTitle;
        summaryLink.title = currentBaseUrl;
      }
    }
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
        if (sb) {
          sb.classList.toggle('open');
          document.body.classList.toggle('it-sidebar-open', sb.classList.contains('open'));
        }
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
    <div class="it-sidebar-tabs">
      <button class="it-tab-btn active" data-tab="notes">📝 Notes</button>
      <button class="it-tab-btn" data-tab="summary">✨ AI Summary</button>
    </div>
    
    <!-- Tab 1: Notes Panel -->
    <div class="it-tab-content-notes">
      <div class="it-notes-video-info" style="padding: 8px 14px; font-size: 11px; border-bottom: 1px solid var(--yt-spec-10-percent-layer, rgba(255, 255, 255, 0.1)); display: flex; flex-direction: column; gap: 2px;">
        <span style="color: var(--yt-spec-text-secondary, #aaa); font-weight: 500;">CURRENT VIDEO:</span>
        <a class="it-current-video-link" href="" target="_blank" style="color: var(--yt-spec-themed-blue, #3ea6ff); text-decoration: none; display: block; word-break: break-word; line-height: 1.4; margin-top: 2px;" title="Click to open video link"></a>
      </div>
      <div class="it-notes-input-area">
        <textarea class="it-notes-input" placeholder="Type a note and press Enter..."></textarea>
        <div class="it-notes-input-hint">Note will save automatically with the video timestamp</div>
        
        <div class="it-input-toolbar">
          <button type="button" class="it-tool-btn it-camera-btn" title="Capture Video Screenshot">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
          </button>
          <button type="button" class="it-tool-btn it-mic-btn" title="Voice Typing (Speech to Text)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
          </button>
          <div class="it-screenshot-preview-container" style="display: none;">
            <img class="it-screenshot-preview" src="" />
            <button type="button" class="it-screenshot-remove" title="Remove Screenshot">✕</button>
          </div>
        </div>
      </div>
      <div class="it-notes-list-container">
        <ul class="it-notes-list"></ul>
        <div class="it-notes-summary-container"></div>
      </div>
    </div>
    
    <!-- Tab 2: AI Summary Panel -->
    <div class="it-tab-content-summary" style="display: none;">
      <div class="it-summary-panel">
        <div class="it-summary-options">
          <label for="it-summary-format">Summary Focus</label>
          <select id="it-summary-format" class="it-select">
            <option value="detailed">Detailed Study Guide</option>
            <option value="timeline">Timeline & Milestones</option>
            <option value="actions">Actionable Key Takeaways</option>
            <option value="custom">Custom Focus Prompt...</option>
          </select>
          <input type="text" id="it-summary-custom-prompt" class="it-input" placeholder="e.g. Focus on coding examples or math equations" style="display: none; margin-top: 6px;" />
        </div>
        <button type="button" class="it-generate-summary-btn">✨ Generate AI Summary</button>
        <div class="it-summary-quota" style="font-size: 11px; text-align: center; color: var(--yt-spec-text-secondary, #aaa); margin-top: 6px; font-weight: 500;">Free summaries remaining today: 10/10</div>
        <div class="it-summary-status" style="display: none;">Extracting transcript...</div>
        <div class="it-summary-result" style="display: none;"></div>
      </div>
    </div>
  `;

  sidebar.querySelector('.it-notes-close-btn').addEventListener('click', () => {
    sidebar.classList.remove('open');
    document.body.classList.remove('it-sidebar-open');
  });

  // Tab switching logic
  const tabs = sidebar.querySelectorAll('.it-tab-btn');
  const notesPanel = sidebar.querySelector('.it-tab-content-notes');
  const summaryPanel = sidebar.querySelector('.it-tab-content-summary');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.tab === 'notes') {
        notesPanel.style.display = 'flex';
        summaryPanel.style.display = 'none';
      } else {
        notesPanel.style.display = 'none';
        summaryPanel.style.display = 'flex';
        updateQuotaUI();
      }
    });
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
      const cleanWord = lastWord.toLowerCase().replace(/[^a-z']/g, '');

      if (cleanWord.length > 2) {
        // 1. Check local abbreviation map first
        if (AUTOCORRECT_MAP[cleanWord]) {
          const corrected = AUTOCORRECT_MAP[cleanWord];
          const finalWord = lastWord[0] === lastWord[0].toUpperCase() ? corrected[0].toUpperCase() + corrected.slice(1) : corrected;
          const newBeforeCursor = beforeCursor.slice(0, -lastWord.length) + finalWord;
          
          textarea.value = newBeforeCursor + text.slice(cursor);
          textarea.selectionStart = textarea.selectionEnd = newBeforeCursor.length;
          return;
        }

        // 2. Query spelling API for dynamic corrections
        fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(cleanWord)}&max=3`)
          .then(r => r.json())
          .then(data => {
            if (data && data.length > 0) {
              const topSuggestion = data[0].word;
              
              if (topSuggestion.toLowerCase() !== cleanWord) {
                // Verify lengths are close (edit distance 1 or 2 check fallback)
                if (Math.abs(topSuggestion.length - cleanWord.length) <= 2) {
                  const finalWord = lastWord[0] === lastWord[0].toUpperCase() ? topSuggestion[0].toUpperCase() + topSuggestion.slice(1) : topSuggestion;
                  
                  const currentText = textarea.value;
                  const targetPattern = lastWord + ' ';
                  const lastIdx = currentText.lastIndexOf(targetPattern);
                  
                  // Only replace if the target misspelled word is at/near the current typing end
                  if (lastIdx !== -1 && lastIdx + targetPattern.length >= currentText.length - 5) {
                    const updatedText = currentText.substring(0, lastIdx) + finalWord + ' ' + currentText.substring(lastIdx + targetPattern.length);
                    const oldCursor = textarea.selectionStart;
                    textarea.value = updatedText;
                    textarea.selectionStart = textarea.selectionEnd = oldCursor + (finalWord.length - lastWord.length);
                  }
                }
              }
            }
          })
          .catch(err => console.error("IntentTube Spelling API Error:", err));
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

  // Advanced Note Toolbar: Camera Screenshot
  const cameraBtn = sidebar.querySelector('.it-camera-btn');
  const previewContainer = sidebar.querySelector('.it-screenshot-preview-container');
  const previewImg = sidebar.querySelector('.it-screenshot-preview');
  const removeScreenshotBtn = sidebar.querySelector('.it-screenshot-remove');

  cameraBtn.addEventListener('click', () => {
    const video = document.querySelector('video');
    if (video) {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      activeScreenshotDataUrl = canvas.toDataURL('image/webp', 0.5);
      previewImg.src = activeScreenshotDataUrl;
      previewContainer.style.display = 'flex';
      textarea.focus();
    } else {
      alert("No active video element found.");
    }
  });

  removeScreenshotBtn.addEventListener('click', () => {
    activeScreenshotDataUrl = null;
    previewContainer.style.display = 'none';
    textarea.focus();
  });

  // Advanced Note Toolbar: Microphone Voice Typing
  const micBtn = sidebar.querySelector('.it-mic-btn');
  let recognition = null;
  let isListening = false;
  let finalTranscript = '';
  let initialVal = '';

  micBtn.addEventListener('click', () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    if (!recognition) {
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.lang = 'en-US';
      recognition.interimResults = true;

      recognition.onstart = () => {
        isListening = true;
        finalTranscript = '';
        initialVal = textarea.value;
        micBtn.classList.add('recording');
        micBtn.title = "Listening... Click to stop";
      };

      recognition.onend = () => {
        isListening = false;
        micBtn.classList.remove('recording');
        micBtn.title = "Voice Typing (Speech to Text)";
        
        // Trigger AI Restructuring if transcript is gathered
        if (finalTranscript.trim().length > 0) {
          restructureVoiceText(finalTranscript.trim(), (cleanedText) => {
            textarea.value = initialVal + (initialVal ? ' ' : '') + cleanedText;
            textarea.dispatchEvent(new Event('input'));
            textarea.focus();
          });
        }
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let tempFinal = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            tempFinal += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        finalTranscript += tempFinal;
        textarea.value = initialVal + (initialVal && finalTranscript ? ' ' : '') + finalTranscript + (interimTranscript ? ' ' + interimTranscript : '');
        textarea.dispatchEvent(new Event('input'));
      };

      recognition.onerror = (e) => {
        console.error("Speech Recognition Error:", e);
        isListening = false;
        micBtn.classList.remove('recording');
      };
    }

    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
    }
  });

  async function restructureVoiceText(rawText, callback) {
    const hintEl = sidebar.querySelector('.it-notes-input-hint');
    const originalHint = hintEl ? hintEl.textContent : '';
    if (hintEl) {
      hintEl.textContent = "✨ AI is restructuring your speech...";
      hintEl.style.color = "#ffcc00";
    }

    try {
      let cleanedText = '';
      let localAiAvailable = false;
      try {
        if (window.ai && window.ai.languageModel) {
          const capabilities = await window.ai.languageModel.capabilities();
          if (capabilities && capabilities.available !== 'no') {
            localAiAvailable = true;
          }
        }
      } catch (e) {
        console.warn("Chrome local AI languageModel check failed:", e);
      }

      const prompt = `Clean up and restructure this voice transcription. 
Remove verbal self-corrections, fillers (like 'um', 'ah'), repetitions, and false starts. 
Keep it concise and clear. Preserve the original meaning and tone.
Example: "i love what she said... no no i only like what she said" -> "I only like what she said."
Example: "we need to build this... wait actually let's build that" -> "We need to build that."

Text: "${rawText}"
Output ONLY the clean, polished final text. Do not include quotes, explanations, or commentary.`;

      if (localAiAvailable) {
        const session = await window.ai.languageModel.create();
        cleanedText = await session.prompt(prompt);
        cleanedText = cleanedText.trim();
      } else if (settings.geminiApiKey) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${settings.geminiApiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });
        if (response.ok) {
          const data = await response.json();
          if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            cleanedText = data.candidates[0].content.parts[0].text.trim();
          }
        }
      }

      if (cleanedText) {
        callback(cleanedText);
      } else {
        callback(rawText);
      }
    } catch (err) {
      console.error("Restructuring Error:", err);
      callback(rawText);
    } finally {
      if (hintEl) {
        hintEl.textContent = "Note will save automatically with the video timestamp";
        hintEl.style.color = "";
      }
    }
  }

  // AI Summarizer logic
  const formatSelect = sidebar.querySelector('#it-summary-format');
  const customPromptInput = sidebar.querySelector('#it-summary-custom-prompt');
  const generateBtn = sidebar.querySelector('.it-generate-summary-btn');
  const statusDiv = sidebar.querySelector('.it-summary-status');
  const resultDiv = sidebar.querySelector('.it-summary-result');

  formatSelect.addEventListener('change', () => {
    if (formatSelect.value === 'custom') {
      customPromptInput.style.display = 'block';
    } else {
      customPromptInput.style.display = 'none';
    }
  });

  generateBtn.addEventListener('click', async () => {
    statusDiv.style.display = 'block';
    resultDiv.style.display = 'none';
    statusDiv.textContent = 'Extracting transcript...';
    
    try {
      const transcriptSegments = await getYouTubeTranscript();
      statusDiv.textContent = 'Analyzing transcript with AI...';

      // Reconstruct transcript with timestamps
      const transcriptText = transcriptSegments.map(s => {
        const timeStr = formatTime(s.start);
        return `[${timeStr}] ${s.text}`;
      }).join('\n');

      let summaryFocus = '';
      if (formatSelect.value === 'timeline') {
        summaryFocus = 'Create a timeline of key milestones and events with their matching timestamps.';
      } else if (formatSelect.value === 'actions') {
        summaryFocus = 'Extract key actionable items, instructions, or steps to take.';
      } else if (formatSelect.value === 'detailed') {
        summaryFocus = 'Provide a structured, detailed study guide mapping out the core concepts.';
      } else {
        summaryFocus = customPromptInput.value.trim() || 'Provide a high-quality summary.';
      }

      let summaryResultText = '';
      
      // Try window.ai first
      let localAiAvailable = false;
      try {
        if (window.ai && window.ai.summarizer) {
          const capabilities = await window.ai.summarizer.capabilities();
          if (capabilities && capabilities.available !== 'no') {
            localAiAvailable = true;
          }
        }
      } catch (e) {
        console.warn("Chrome local AI check failed:", e);
      }

      if (localAiAvailable) {
        const summarizer = await window.ai.summarizer.create({
          type: 'tl;dr',
          format: 'markdown',
          length: 'medium',
          sharedContext: `The user wants to focus on: ${summaryFocus}`
        });
        summaryResultText = await summarizer.summarize(transcriptText);
      } else {
        // Delegate to background script (free keyless DuckDuckGo tier)
        const urlParams = new URLSearchParams(window.location.search);
        const currentVideoId = urlParams.get('v');
        
        const response = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: 'SUMMARIZE_VIDEO',
            transcriptText,
            focusText: summaryFocus,
            videoId: currentVideoId
          }, (res) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (!res) {
              reject(new Error("No response from background server. Try reloading YouTube."));
            } else if (!res.success) {
              reject(new Error(res.error));
            } else {
              resolve(res.text);
            }
          });
        });
        summaryResultText = response;
      }

      renderSummaryText(summaryResultText, resultDiv);
      statusDiv.style.display = 'none';
      updateQuotaUI();
    } catch (err) {
      statusDiv.style.display = 'none';
      resultDiv.style.display = 'block';
      resultDiv.innerHTML = `<div style="color: #ff4e4e; font-weight: 500; border: 1px solid rgba(255, 78, 78, 0.3); background: rgba(255, 78, 78, 0.08); padding: 10px; border-radius: 6px; line-height: 1.4;">Error: ${err.message}</div>`;
      console.error(err);
    }
  });

  document.body.appendChild(sidebar);
  renderNotesList();
}

function saveCurrentNote(noteText) {
  if (!noteText && !activeScreenshotDataUrl) return;

  const video = document.querySelector('video');
  const timestamp = activeNoteTimestamp || (video ? formatTime(video.currentTime) : '0:00');
  const videoTitleEl = document.querySelector('ytd-watch-metadata h1 yt-formatted-string') || document.querySelector('h1.title');
  const videoTitle = videoTitleEl ? videoTitleEl.textContent.trim() : document.title;

  const newNote = {
    id: Date.now(),
    videoUrl: location.href.split('&')[0],
    videoTitle: videoTitle,
    timestamp: timestamp,
    noteText: noteText || (activeScreenshotDataUrl ? "[Captured Screen]" : ""),
    screenshot: activeScreenshotDataUrl
  };

  chrome.storage.local.get({ sessionNotes: [] }, (data) => {
    const updatedNotes = data.sessionNotes || [];
    updatedNotes.push(newNote);
    chrome.storage.local.set({ sessionNotes: updatedNotes }, () => {
      settings.sessionNotes = updatedNotes;
      renderNotesList();
      
      // Clear screenshot preview
      activeScreenshotDataUrl = null;
      const preview = document.querySelector('.it-screenshot-preview-container');
      if (preview) preview.style.display = 'none';
      
      // Increment notes analytics
      incrementAnalytics('dailyNotes', 1);
    });
  });
}

function renderNotesList() {
  const list = document.querySelector('.it-notes-list');
  if (!list) return;

  list.innerHTML = '';
  
  const currentBaseUrl = location.href.split('&')[0];
  const currentVideoNotes = settings.sessionNotes.filter(n => n.videoUrl === currentBaseUrl);

  // Update video info link in sidebar header
  updateSidebarVideoTitle();

  if (currentVideoNotes.length === 0) {
    list.innerHTML = `<li style="text-align: center; color: var(--yt-spec-text-secondary, #aaa); font-size: 12px; margin-top: 24px;">No notes for this video yet.</li>`;
    const summaryContainer = document.querySelector('.it-notes-summary-container');
    if (summaryContainer) summaryContainer.innerHTML = '';
    return;
  }

  currentVideoNotes.forEach(item => {
    const li = document.createElement('li');
    li.className = 'it-note-item';
    
    let screenshotHtml = '';
    if (item.screenshot) {
      screenshotHtml = `
        <div class="it-note-screenshot-thumb-wrapper">
          <img class="it-note-screenshot-thumb" src="${item.screenshot}" />
        </div>
      `;
    }

    li.innerHTML = `
      <div class="it-note-header">
        <span class="it-note-timestamp">${item.timestamp}</span>
        <button class="it-note-delete" data-id="${item.id}">Delete</button>
      </div>
      <div class="it-note-text">${escapeHtml(item.noteText)}</div>
      ${screenshotHtml}
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

    if (item.screenshot) {
      li.querySelector('.it-note-screenshot-thumb').addEventListener('click', () => {
        openImageModal(item.screenshot);
      });
    }

    list.appendChild(li);
  });

  // Generate dynamic notes summary block
  renderNotesSummary(currentVideoNotes);
}

function openImageModal(src) {
  const modal = document.createElement('div');
  modal.className = 'it-image-modal';
  modal.innerHTML = `
    <div class="it-image-modal-content">
      <img src="${src}" />
      <button class="it-image-modal-close">✕</button>
    </div>
  `;
  modal.querySelector('.it-image-modal-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
}

function renderSummaryText(text, container) {
  container.style.display = 'block';
  // Parse markdown-ish linebreaks and format timestamps [MM:SS] or [HH:MM:SS] into seek links
  const escaped = escapeHtml(text);
  
  // Replace [MM:SS] or [HH:MM:SS] with a link
  const timestampRegex = /\[(\d{1,2}:)?\d{1,2}:\d{2}\]/g;
  const rendered = escaped.replace(timestampRegex, (match) => {
    const rawTime = match.slice(1, -1);
    return `<a class="it-seek-link" data-time="${rawTime}">${match}</a>`;
  });

  // Simple markdown conversion: **bold** and newlines
  const formattedHtml = rendered
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');

  container.innerHTML = formattedHtml;

  // Add click listeners to seek links
  container.querySelectorAll('.it-seek-link').forEach(link => {
    link.addEventListener('click', () => {
      const video = document.querySelector('video');
      if (video) {
        video.currentTime = parseTime(link.dataset.time);
        video.play();
      }
    });
  });
}

async function getYouTubeTranscript() {
  try {
    // Fetch player response by injecting inject.js (bypasses CSP restrictions)
    const playerResponse = await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('inject.js');
      const listener = (event) => {
        if (event.data && event.data.type === 'YT_PLAYER_RESPONSE') {
          window.removeEventListener('message', listener);
          script.remove();
          resolve(event.data.data);
        }
      };
      window.addEventListener('message', listener);
      (document.head || document.documentElement).appendChild(script);
      setTimeout(() => {
        window.removeEventListener('message', listener);
        script.remove();
        reject(new Error('Timeout getting YouTube player configurations'));
      }, 5000);
    });

    if (!playerResponse || !playerResponse.captions || !playerResponse.captions.playerCaptionsTracklistRenderer) {
      throw new Error("Transcripts are disabled or not available for this video.");
    }

    const captionTracks = playerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
    if (!captionTracks || captionTracks.length === 0) {
      throw new Error("No caption tracks found.");
    }

    // Prefer English, then auto-generated English, then first available
    let track = captionTracks.find(t => t.languageCode === 'en' && !t.kind) || 
                captionTracks.find(t => t.languageCode === 'en') || 
                captionTracks[0];

    const response = await fetch(track.baseUrl);
    const xmlText = await response.text();

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const textNodes = xmlDoc.getElementsByTagName('text');

    const transcriptSegments = [];
    for (let i = 0; i < textNodes.length; i++) {
      const node = textNodes[i];
      const start = parseFloat(node.getAttribute('start'));
      const duration = parseFloat(node.getAttribute('dur') || '0');
      const text = node.textContent;
      transcriptSegments.push({ start, duration, text });
    }

    if (transcriptSegments.length === 0) {
      throw new Error("No caption content could be parsed from the video transcript.");
    }

    return transcriptSegments;
  } catch (err) {
    console.error("Transcript Extraction Error:", err);
    throw err;
  }
}


function renderNotesSummary(notes) {
  const container = document.querySelector('.it-notes-summary-container');
  if (!container) return;

  // Build key highlights list (TL;DR from first few words of notes)
  const highlights = notes.slice(0, 3).map(n => {
    const cleanText = n.noteText.length > 35 ? n.noteText.slice(0, 35) + '...' : n.noteText;
    return `<li>At ${n.timestamp}: ${escapeHtml(cleanText)}</li>`;
  }).join('');

  const currentBaseUrl = location.href.split('&')[0];
  const videoTitleEl = document.querySelector('ytd-watch-metadata h1 yt-formatted-string') || document.querySelector('h1.title');
  const videoTitle = videoTitleEl ? videoTitleEl.textContent.trim() : 'YouTube Video';

  container.innerHTML = `
    <div class="it-notes-summary-box">
      <div class="it-notes-summary-title">Study Block Summary</div>
      <div style="margin-bottom: 6px; font-size: 10px; word-break: break-all; color: var(--yt-spec-text-secondary, #aaa);">
        Source: <a href="${currentBaseUrl}" target="_blank" style="color: var(--yt-spec-themed-blue, #3ea6ff); text-decoration: none;" title="${currentBaseUrl}">${escapeHtml(videoTitle)}</a>
      </div>
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
    const player = document.querySelector('.html5-video-player');
    const isWatchPage = location.pathname === '/watch';
    
    if (!isWatchPage || !settings.extensionEnabled) {
      clearInterval(activeTimerInterval);
      activeTimerInterval = null;
      removeTimerBadge();
      removeTimerBadgeControls();
      return;
    }

    // Check if an ad is playing
    const isAd = player && (
      player.classList.contains('ad-showing') || 
      player.classList.contains('ad-interrupting') || 
      !!player.querySelector('.ytp-ad-player-overlay') ||
      !!player.querySelector('.ytp-ad-overlay-container') ||
      !!player.querySelector('.video-ads.ytp-ad-module:not(:empty)')
    );

    // Check if video is actively playing (using player class playing-mode for accuracy)
    const isPlaying = player && player.classList.contains('playing-mode');

    // Only tick down if the video is actively playing and not an ad
    if (video && isPlaying && !video.paused && !video.ended && !isAd) {
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

function updateQuotaUI() {
  const today = new Date().toISOString().slice(0, 10);
  chrome.storage.local.get({ summaryQuota: { date: today, list: [] } }, (data) => {
    let quota = data.summaryQuota;
    if (quota.date !== today) {
      quota = { date: today, list: [] };
    }
    const remaining = Math.max(0, 10 - quota.list.length);
    const quotaEl = document.querySelector('.it-summary-quota');
    if (quotaEl) {
      quotaEl.textContent = `Free summaries remaining today: ${remaining}/10`;
    }
  });
}
