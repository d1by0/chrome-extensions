document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const toggleExtension = document.getElementById('toggle-extension');
  const toggleIntentGate = document.getElementById('toggle-intent-gate');
  const toggleCleanTheater = document.getElementById('toggle-clean-theater');
  const toggleZenTimer = document.getElementById('toggle-zen-timer');
  const timerConfigPanel = document.getElementById('timer-config-panel');
  const customMinutes = document.getElementById('custom-minutes');
  const presetBtns = document.querySelectorAll('.preset-btn');
  const notesEmptyState = document.getElementById('notes-empty-state');
  const notesList = document.getElementById('notes-list');
  const btnExportNotes = document.getElementById('btn-export-notes');

  // New elements
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const inputApiKey = document.getElementById('input-api-key');
  const btnSaveKey = document.getElementById('btn-save-key');
  const saveStatus = document.getElementById('save-status');

  // Tab switching
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.target).classList.add('active');
    });
  });

  // Default settings
  const defaults = {
    extensionEnabled: true,
    intentGate: true,
    cleanTheater: true,
    zenTimer: true,
    timerDuration: 30, // in minutes
    sessionNotes: [],
    geminiApiKey: ''
  };

  // Load settings & API key
  chrome.storage.local.get(defaults, (settings) => {
    toggleExtension.checked = settings.extensionEnabled;
    toggleIntentGate.checked = settings.intentGate;
    toggleCleanTheater.checked = settings.cleanTheater;
    toggleZenTimer.checked = settings.zenTimer;
    inputApiKey.value = settings.geminiApiKey || '';
    
    // Disable inputs if extension is globally disabled
    updateSubControlsState(settings.extensionEnabled);

    if (!settings.zenTimer) {
      timerConfigPanel.classList.add('disabled');
    }

    // Load active timer selection
    setActivePreset(settings.timerDuration);
    
    // Load notes
    renderNotes(settings.sessionNotes);
  });

  // Save Gemini API Key
  btnSaveKey.addEventListener('click', () => {
    const key = inputApiKey.value.trim();
    chrome.storage.local.set({ geminiApiKey: key }, () => {
      saveStatus.style.display = 'block';
      saveStatus.className = 'success';
      saveStatus.textContent = 'Saved successfully!';
      setTimeout(() => { saveStatus.style.display = 'none'; }, 2000);
    });
  });

  // Load & render Analytics Dashboard
  chrome.storage.local.get({
    analyticsData: { dailyMinutes: {}, dailyNotes: {}, blocksPrevented: {} }
  }, (data) => {
    const analytics = data.analyticsData;
    const dailyMinutes = analytics.dailyMinutes || {};
    const dailyNotes = analytics.dailyNotes || {};
    const blocksPrevented = analytics.blocksPrevented || {};

    // Calculate totals
    const totalFocusMinutes = Object.values(dailyMinutes).reduce((a, b) => a + b, 0);
    const totalBypasses = Object.values(blocksPrevented).reduce((a, b) => a + b, 0);
    const totalNotes = Object.values(dailyNotes).reduce((a, b) => a + b, 0);

    document.getElementById('stat-focus-time').textContent = `${totalFocusMinutes}m`;
    document.getElementById('stat-blocks').textContent = totalBypasses;
    document.getElementById('stat-notes').textContent = totalNotes;

    // Render Weekly Focus Chart
    const canvas = document.getElementById('analytics-chart');
    if (canvas) {
      const dates = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
      }
      const values = dates.map(date => dailyMinutes[date] || 0);
      const maxValue = Math.max(...values, 10);
      drawChart(canvas, dates, values, maxValue);
    }
  });

  // Master Toggle Listener
  toggleExtension.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ extensionEnabled: isEnabled });
    updateSubControlsState(isEnabled);
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
    if (isEnabled && toggleExtension.checked) {
      timerConfigPanel.classList.remove('disabled');
    } else {
      timerConfigPanel.classList.add('disabled');
    }
  });

  // Helper: Disable/enable child inputs depending on master state
  function updateSubControlsState(isEnabled) {
    const elementsToToggle = [toggleIntentGate, toggleCleanTheater, toggleZenTimer, customMinutes];
    elementsToToggle.forEach(el => {
      el.disabled = !isEnabled;
    });

    presetBtns.forEach(btn => {
      if (!isEnabled) {
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.5';
      } else {
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
      }
    });

    if (!isEnabled || !toggleZenTimer.checked) {
      timerConfigPanel.classList.add('disabled');
    } else {
      timerConfigPanel.classList.remove('disabled');
    }
  }

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
      li.style.display = 'flex';
      li.style.flexDirection = 'column';
      li.style.gap = '2px';
      
      const metaLink = document.createElement('a');
      metaLink.className = 'note-item-meta';
      metaLink.href = item.videoUrl;
      metaLink.target = '_blank';
      metaLink.style.fontSize = '9px';
      metaLink.style.color = 'var(--text-muted)';
      metaLink.style.textDecoration = 'none';
      metaLink.style.textOverflow = 'ellipsis';
      metaLink.style.overflow = 'hidden';
      metaLink.style.whiteSpace = 'nowrap';
      metaLink.style.display = 'block';
      metaLink.textContent = item.videoTitle || 'YouTube Video';
      metaLink.title = `Watch video: ${item.videoTitle || ''}`;

      const contentDiv = document.createElement('div');
      contentDiv.style.display = 'flex';
      contentDiv.style.alignItems = 'baseline';
      contentDiv.style.gap = '4px';

      const timeSpan = document.createElement('span');
      timeSpan.className = 'note-time';
      timeSpan.textContent = `[${item.timestamp}]`;
      
      const textSpan = document.createElement('span');
      textSpan.textContent = item.noteText;
      
      contentDiv.appendChild(timeSpan);
      contentDiv.appendChild(textSpan);
      
      li.appendChild(metaLink);
      li.appendChild(contentDiv);
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

  // Draw pure HTML5 Canvas bar chart
  function drawChart(canvas, dates, values, maxValue) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const width = canvas.width;
    const height = canvas.height;
    const paddingLeft = 25;
    const paddingRight = 10;
    const paddingTop = 10;
    const paddingBottom = 20;
    
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    
    // Draw horizontal grid lines
    ctx.strokeStyle = '#2f2f2f';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 3; i++) {
      const y = paddingTop + (chartHeight * i) / 3;
      ctx.moveTo(paddingLeft, y);
      ctx.lineTo(width - paddingRight, y);
    }
    ctx.stroke();
    
    // Draw Y-axis labels
    ctx.fillStyle = '#717171';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 3; i++) {
      const val = Math.round(maxValue - (maxValue * i) / 3);
      const y = paddingTop + (chartHeight * i) / 3;
      ctx.fillText(val + 'm', paddingLeft - 4, y);
    }
    
    // Draw bars
    const barWidth = (chartWidth / dates.length) - 6;
    dates.forEach((date, index) => {
      const value = values[index];
      const barHeight = (value / maxValue) * chartHeight;
      const x = paddingLeft + (chartWidth / dates.length) * index + 3;
      const y = height - paddingBottom - barHeight;
      
      // Bar gradient
      const grad = ctx.createLinearGradient(x, y, x, height - paddingBottom);
      grad.addColorStop(0, '#ff3333');
      grad.addColorStop(1, '#990000');
      ctx.fillStyle = grad;
      
      // Draw rounded rectangle
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
      } else {
        ctx.rect(x, y, barWidth, barHeight);
      }
      ctx.fill();
      
      // X-axis day abbreviation
      const d = new Date(date + 'T00:00:00'); // Parse local time to avoid timezone offset shifts
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1);
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '8.5px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(dayLabel, x + barWidth / 2, height - paddingBottom + 4);
    });
  }
});
