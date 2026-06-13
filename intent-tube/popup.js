document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const toggleIntentGate = document.getElementById('toggle-intent-gate');
  const toggleCleanTheater = document.getElementById('toggle-clean-theater');
  const toggleZenTimer = document.getElementById('toggle-zen-timer');
  const timerConfigPanel = document.getElementById('timer-config-panel');
  const customMinutes = document.getElementById('custom-minutes');
  const presetBtns = document.querySelectorAll('.preset-btn');
  const notesEmptyState = document.getElementById('notes-empty-state');
  const notesList = document.getElementById('notes-list');
  const btnExportNotes = document.getElementById('btn-export-notes');

  // Default settings
  const defaults = {
    intentGate: true,
    cleanTheater: true,
    zenTimer: true,
    timerDuration: 30, // in minutes
    sessionNotes: []
  };

  // Load settings
  chrome.storage.local.get(defaults, (settings) => {
    toggleIntentGate.checked = settings.intentGate;
    toggleCleanTheater.checked = settings.cleanTheater;
    toggleZenTimer.checked = settings.zenTimer;
    
    if (!settings.zenTimer) {
      timerConfigPanel.classList.add('disabled');
    }

    // Load active timer selection
    setActivePreset(settings.timerDuration);
    
    // Load notes
    renderNotes(settings.sessionNotes);
  });

  // Toggles Event Listeners
  toggleIntentGate.addEventListener('change', (e) => {
    chrome.storage.local.set({ intentGate: e.target.checked });
  });

  toggleCleanTheater.addEventListener('change', (e) => {
    chrome.storage.local.set({ cleanTheater: e.target.checked });
  });

  toggleZenTimer.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ zenTimer: isEnabled });
    if (isEnabled) {
      timerConfigPanel.classList.remove('disabled');
    } else {
      timerConfigPanel.classList.add('disabled');
    }
  });

  // Preset buttons logic
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mins = parseInt(btn.dataset.minutes, 10);
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      customMinutes.value = '';
      chrome.storage.local.set({ timerDuration: mins });
    });
  });

  // Custom minutes input
  customMinutes.addEventListener('input', (e) => {
    const value = parseInt(e.target.value, 10);
    if (value && value > 0 && value <= 180) {
      presetBtns.forEach(b => b.classList.remove('active'));
      chrome.storage.local.set({ timerDuration: value });
    }
  });

  // Helper: Set active preset button based on duration
  function setActivePreset(duration) {
    let matched = false;
    presetBtns.forEach(btn => {
      const mins = parseInt(btn.dataset.minutes, 10);
      if (mins === duration) {
        btn.classList.add('active');
        matched = true;
      } else {
        btn.classList.remove('active');
      }
    });

    if (!matched && duration) {
      customMinutes.value = duration;
    }
  }

  // Helper: Render session notes
  function renderNotes(notes) {
    if (!notes || notes.length === 0) {
      notesEmptyState.style.display = 'flex';
      notesList.style.display = 'none';
      return;
    }

    notesEmptyState.style.display = 'none';
    notesList.style.display = 'flex';
    notesList.innerHTML = '';

    // Render last 10 notes in popup preview
    const recentNotes = notes.slice(-10).reverse();
    recentNotes.forEach(item => {
      const li = document.createElement('li');
      li.className = 'note-item';
      
      const timeSpan = document.createElement('span');
      timeSpan.className = 'note-time';
      timeSpan.textContent = `[${item.timestamp}]`;
      
      const textSpan = document.createElement('span');
      textSpan.textContent = ` ${item.noteText}`;
      
      li.appendChild(timeSpan);
      li.appendChild(textSpan);
      notesList.appendChild(li);
    });
  }

  // Export Notes to Markdown
  btnExportNotes.addEventListener('click', () => {
    chrome.storage.local.get({ sessionNotes: [] }, (data) => {
      const notes = data.sessionNotes;
      if (!notes || notes.length === 0) {
        alert('No notes available to export.');
        return;
      }

      // Group notes by video title/URL
      const grouped = {};
      notes.forEach(note => {
        const key = note.videoTitle || 'Untitled Video';
        if (!grouped[key]) {
          grouped[key] = {
            url: note.videoUrl,
            items: []
          };
        }
        grouped[key].items.push(note);
      });

      // Generate markdown string
      let md = `# IntentTube - Focus Study Notes\n\n`;
      md += `*Generated on ${new Date().toLocaleDateString()}*\n\n---\n\n`;

      for (const title in grouped) {
        const info = grouped[title];
        md += `## 🎬 [${title}](${info.url})\n\n`;
        info.items.forEach(item => {
          // Calculate seconds to build timestamp link if video page
          const seconds = timestampToSeconds(item.timestamp);
          const link = seconds !== null ? `${info.url}&t=${seconds}s` : info.url;
          md += `- [**${item.timestamp}**](${link}) - ${item.noteText}\n`;
        });
        md += `\n---\n\n`;
      }

      // Trigger download
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IntentTube-Notes-${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  });

  // Helper: convert HH:MM:SS or MM:SS to seconds
  function timestampToSeconds(ts) {
    const parts = ts.split(':').map(Number);
    if (parts.some(isNaN)) return null;
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return null;
  }
});
