/**
 * Fix Paste - Extension Interface Controller (Popup Script)
 */

document.addEventListener('DOMContentLoaded', () => {
  let extractedContent = null;
  let activeFormat = 'text';

  // Elements: Navigation
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  // Elements: Tab 1 - Extract
  const btnCopy = document.getElementById('btn-copy');
  const btnPicker = document.getElementById('btn-picker');
  const btnDownload = document.getElementById('btn-download');
  const btnPDF = document.getElementById('btn-pdf');
  const optImages = document.getElementById('opt-images');
  const optLinks = document.getElementById('opt-links');
  const formatPills = document.querySelectorAll('.format-pill');

  // Elements: Tab 2 - History
  const historySearch = document.getElementById('history-search');
  const btnClearSearch = document.getElementById('btn-clear-search');
  const historyExpiry = document.getElementById('history-expiry');
  const historyList = document.getElementById('history-list');
  const btnClearHistory = document.getElementById('btn-clear-history');

  // Elements: Tab 3 - Batch
  const btnBatchSelectAll = document.getElementById('btn-batch-select-all');
  const btnBatchSelectNone = document.getElementById('btn-batch-select-none');
  const batchTabsList = document.getElementById('batch-tabs-list');
  const btnBatchDownload = document.getElementById('btn-batch-download');

  // Common Elements
  const statusText = document.getElementById('status-text');
  const optTelemetry = document.getElementById('opt-telemetry');

  // --- Initial Load & Preferences ---
  chrome.storage.local.get({
    includeImages: true,
    preserveLinks: true,
    format: 'text',
    historyExpiryMinutes: 60,
    telemetryEnabled: true
  }, (items) => {
    optImages.checked = items.includeImages;
    optLinks.checked = items.preserveLinks;
    activeFormat = items.format;
    historyExpiry.value = items.historyExpiryMinutes;
    optTelemetry.checked = items.telemetryEnabled;

    // Highlight initial format pill
    formatPills.forEach(pill => {
      if (pill.dataset.format === activeFormat) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
    updateDownloadButtonLabel();
  });

  // Save extract preference handlers
  optImages.addEventListener('change', () => {
    extractedContent = null;
    chrome.storage.local.set({ includeImages: optImages.checked });
  });

  optLinks.addEventListener('change', () => {
    extractedContent = null;
    chrome.storage.local.set({ preserveLinks: optLinks.checked });
  });

  optTelemetry.addEventListener('change', () => {
    chrome.storage.local.set({ telemetryEnabled: optTelemetry.checked });
    trackEvent('telemetry_toggled', { enabled: optTelemetry.checked });
  });

  formatPills.forEach(pill => {
    pill.addEventListener('click', () => {
      formatPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeFormat = pill.dataset.format;
      chrome.storage.local.set({ format: activeFormat });
      updateDownloadButtonLabel();
      trackEvent('format_selected', { format: activeFormat });
    });
  });

  function updateDownloadButtonLabel() {
    const ext = activeFormat === 'markdown' ? 'MD' : activeFormat.toUpperCase();
    btnDownload.innerHTML = `<i class="bx bx-download"></i> Download ${ext}`;
  }

  // --- Tab Navigation ---
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPanel = document.getElementById(btn.dataset.tab);
      if (targetPanel) {
        targetPanel.classList.add('active');
      }

      if (btn.dataset.tab === 'tab-history') {
        loadHistory();
      } else if (btn.dataset.tab === 'tab-batch') {
        loadBatchTabs();
      }
    });
  });

  // --- Helper: Get page content ---
  async function getExtractedContent() {
    if (extractedContent) return extractedContent;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active browser tab detected.');
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    const options = {
      includeImages: optImages.checked,
      preserveLinks: optLinks.checked
    };

    return new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { action: 'extract', options }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error('Cannot read page content. Try reloading the tab.'));
          return;
        }

        if (response && response.success) {
          extractedContent = response.data;
          resolve(extractedContent);
        } else {
          reject(new Error(response ? response.error : 'Content extraction failed.'));
        }
      });
    });
  }

  // --- Actions: Extract Panel ---

  // Copy Current Page
  btnCopy.addEventListener('click', async () => {
    btnCopy.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Extracting...';
    btnCopy.disabled = true;

    try {
      const content = await getExtractedContent();
      let textToCopy = content.text;
      if (activeFormat === 'markdown') {
        textToCopy = content.markdown;
      } else if (activeFormat === 'json') {
        textToCopy = content.json;
      } else if (activeFormat === 'html') {
        textToCopy = content.html;
      }

      const data = {
        'text/plain': new Blob([textToCopy], { type: 'text/plain' })
      };
      if (content.html) {
        data['text/html'] = new Blob([content.html], { type: 'text/html' });
      }

      const item = new ClipboardItem(data);
      await navigator.clipboard.write([item]);

      // Save to History via message to Background Script
      chrome.runtime.sendMessage({ action: 'saveHistory', data: content });

      // Telemetry
      trackEvent('extract_triggered', {
        method: 'popup_copy',
        format: activeFormat,
        url_domain: content.url ? new URL(content.url).hostname : ''
      });

      // Trigger floating overlay feedback on the host page
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'showToast',
          message: 'Clean content copied!'
        });
      }

      btnCopy.innerHTML = '<i class="bx bx-check"></i> Copied!';
      showStatus('Copied clean content successfully.');
      setTimeout(() => {
        btnCopy.innerHTML = '<i class="bx bx-copy"></i> Copy Page';
        btnCopy.disabled = false;
      }, 1500);
    } catch (err) {
      btnCopy.innerHTML = '<i class="bx bx-copy"></i> Copy Page';
      btnCopy.disabled = false;
      showError(err.message);
    }
  });

  // Interactive Element Picker
  btnPicker.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      trackEvent('picker_used', { action: 'started' });

      // Inject script first
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });

      // Send trigger message
      chrome.tabs.sendMessage(tab.id, { action: 'startPicker' }, () => {
        // Close popup window immediately so user can select
        setTimeout(() => window.close(), 100);
      });
    } catch (err) {
      showError('Failed to start element picker: ' + err.message);
    }
  });

  // Download Text File
  btnDownload.addEventListener('click', async () => {
    btnDownload.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Preparing...';
    btnDownload.disabled = true;

    try {
      const content = await getExtractedContent();
      const filename = getDownloadFilename(content.title);
      let mimeType = 'text/plain;charset=utf-8';
      let dataStr = content.text;

      if (activeFormat === 'markdown') {
        dataStr = content.markdown;
        mimeType = 'text/markdown;charset=utf-8';
      } else if (activeFormat === 'json') {
        dataStr = content.json;
        mimeType = 'application/json;charset=utf-8';
      } else if (activeFormat === 'html') {
        dataStr = content.html;
        mimeType = 'text/html;charset=utf-8';
      }

      const blob = new Blob([dataStr], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showStatus('Download initiated.');
    } catch (err) {
      showError(err.message);
    } finally {
      updateDownloadButtonLabel();
      btnDownload.disabled = false;
    }
  });

  // Save PDF
  btnPDF.addEventListener('click', async () => {
    btnPDF.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Preparing PDF...';
    btnPDF.disabled = true;

    try {
      const content = await getExtractedContent();
      chrome.storage.local.set({ pdfContent: content }, () => {
        chrome.tabs.create({ url: 'print.html' });
      });
      showStatus('Opening PDF layout generator...');
    } catch (err) {
      showError(err.message);
    } finally {
      btnPDF.innerHTML = '<i class="bx bx-file-pdf"></i> Save as PDF';
      btnPDF.disabled = false;
    }
  });

  function getDownloadFilename(title) {
    const cleanTitle = (title || 'page')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    
    let ext = 'txt';
    if (activeFormat === 'markdown') ext = 'md';
    else if (activeFormat === 'json') ext = 'json';
    else if (activeFormat === 'html') ext = 'html';

    return `${cleanTitle}.${ext}`;
  }

  // --- Actions: History Panel ---

  historyExpiry.addEventListener('change', () => {
    chrome.storage.local.set({ historyExpiryMinutes: parseInt(historyExpiry.value, 10) });
    showStatus('Expiry preferences saved.');
  });

  historySearch.addEventListener('input', () => {
    const query = historySearch.value.trim();
    btnClearSearch.style.display = query ? 'block' : 'none';
    loadHistory();
  });

  btnClearSearch.addEventListener('click', () => {
    historySearch.value = '';
    btnClearSearch.style.display = 'none';
    loadHistory();
  });

  btnClearHistory.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear all saved clippings?')) {
      chrome.storage.local.set({ history: [] }, () => {
        loadHistory();
        showStatus('History cleared.');
      });
    }
  });

  function loadHistory() {
    chrome.storage.local.get({ history: [] }, (items) => {
      historyList.innerHTML = '';
      let list = items.history;
      
      // Perform local search filtering
      const query = historySearch.value.toLowerCase().trim();
      if (query) {
        list = list.filter(item => 
          item.title.toLowerCase().includes(query) ||
          item.url.toLowerCase().includes(query) ||
          item.text.toLowerCase().includes(query)
        );
      }

      if (list.length === 0) {
        historyList.innerHTML = '<div class="no-history">No matching clips found.</div>';
        return;
      }

      const now = Date.now();

      list.forEach(item => {
        // Expiry check
        if (item.expiresAt !== 0 && item.expiresAt < now) {
          return; // Skip expired
        }

        const card = document.createElement('div');
        card.className = 'history-card';

        const remainingText = getRemainingTimeText(item.expiresAt, now);
        const domain = item.url ? new URL(item.url).hostname : 'Local page';

        // Check if expiration is nearing (less than 10 minutes left)
        const isNear = item.expiresAt !== 0 && (item.expiresAt - now < 10 * 60 * 1000);

        card.innerHTML = `
          <div class="history-card-header">
            <span class="history-card-title" title="${item.title}">${item.title}</span>
            <button class="btn-card-delete" data-id="${item.id}" title="Remove Clip"><i class="bx bx-x"></i></button>
          </div>
          <div class="history-card-meta">
            <span class="history-card-domain" title="${item.url}">${domain}</span>
            <span class="history-card-badge ${isNear ? 'expiry-near' : ''}">${remainingText}</span>
          </div>
          <div class="history-card-actions">
            <button class="btn-card-action copy-text" data-id="${item.id}"><i class="bx bx-copy"></i> Text</button>
            <button class="btn-card-action copy-md" data-id="${item.id}"><i class="bx bx-file"></i> MD</button>
            <button class="btn-card-action download-btn" data-id="${item.id}"><i class="bx bx-download"></i> Save</button>
          </div>
        `;

        // Card Delete handler
        card.querySelector('.btn-card-delete').addEventListener('click', (e) => {
          e.stopPropagation();
          deleteHistoryItem(item.id);
        });

        // Copy Text handler
        card.querySelector('.copy-text').addEventListener('click', async () => {
          await writeToSystemClipboard(item.text, item.html);
          showStatus('Copied text format!');
        });

        // Copy MD handler
        card.querySelector('.copy-md').addEventListener('click', async () => {
          await writeToSystemClipboard(item.markdown, item.html);
          showStatus('Copied markdown format!');
        });

        // Download handler
        card.querySelector('.download-btn').addEventListener('click', () => {
          downloadClip(item);
        });

        historyList.appendChild(card);
      });
    });
  }

  function getRemainingTimeText(expiresAt, now) {
    if (expiresAt === 0) return "Session Only";
    const msLeft = expiresAt - now;
    if (msLeft <= 0) return "Expired";
    
    const minsLeft = Math.round(msLeft / (60 * 1000));
    if (minsLeft < 60) return `${minsLeft}m left`;

    const hrsLeft = Math.round(minsLeft / 60);
    if (hrsLeft < 24) return `${hrsLeft}h left`;

    const daysLeft = Math.round(hrsLeft / 24);
    return `${daysLeft}d left`;
  }

  function deleteHistoryItem(id) {
    chrome.storage.local.get({ history: [] }, (items) => {
      const cleanList = items.history.filter(item => item.id !== id);
      chrome.storage.local.set({ history: cleanList }, () => {
        loadHistory();
        showStatus('Clip removed.');
      });
    });
  }

  async function writeToSystemClipboard(text, html) {
    const data = {
      'text/plain': new Blob([text], { type: 'text/plain' })
    };
    if (html) {
      data['text/html'] = new Blob([html], { type: 'text/html' });
    }
    const clipItem = new ClipboardItem(data);
    await navigator.clipboard.write([clipItem]);
  }

  function downloadClip(item) {
    const filename = `${item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}.md`;
    const blob = new Blob([item.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- Actions: Batch Panel ---

  btnBatchSelectAll.addEventListener('click', () => {
    const checkboxes = batchTabsList.querySelectorAll('.tab-item-checkbox');
    checkboxes.forEach(cb => cb.checked = true);
    updateBatchButtonState();
  });

  btnBatchSelectNone.addEventListener('click', () => {
    const checkboxes = batchTabsList.querySelectorAll('.tab-item-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    updateBatchButtonState();
  });

  function updateBatchButtonState() {
    const checkedCount = batchTabsList.querySelectorAll('.tab-item-checkbox:checked').length;
    btnBatchDownload.disabled = checkedCount === 0;
    btnBatchDownload.innerHTML = checkedCount > 0 ? `<i class="bx bx-folder-plus"></i> Compile & Download (${checkedCount} tabs)` : '<i class="bx bx-folder-plus"></i> Compile & Download (.md)';
  }

  async function loadBatchTabs() {
    batchTabsList.innerHTML = '';
    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabs = await chrome.tabs.query({ currentWindow: true });

    // Filter out extensions tabs, settings tabs, and the popup/current active tab if necessary
    const targetTabs = tabs.filter(t => t.url && !t.url.startsWith('chrome://') && t.id !== currentTab?.id);

    if (targetTabs.length === 0) {
      batchTabsList.innerHTML = '<div class="no-history">No other active web pages found.</div>';
      btnBatchDownload.disabled = true;
      return;
    }

    targetTabs.forEach(t => {
      const row = document.createElement('div');
      row.className = 'tab-item-row';
      const domain = new URL(t.url).hostname;

      row.innerHTML = `
        <input type="checkbox" class="tab-item-checkbox" data-tab-id="${t.id}">
        <div class="tab-item-details">
          <span class="tab-item-title" title="${t.title}">${t.title}</span>
          <span class="tab-item-url" title="${t.url}">${domain}</span>
        </div>
      `;

      // Click row toggles checkbox
      row.addEventListener('click', (e) => {
        if (e.target.className !== 'tab-item-checkbox') {
          const cb = row.querySelector('.tab-item-checkbox');
          cb.checked = !cb.checked;
        }
        updateBatchButtonState();
      });

      batchTabsList.appendChild(row);
    });

    updateBatchButtonState();
  }

  btnBatchDownload.addEventListener('click', async () => {
    const checkboxes = batchTabsList.querySelectorAll('.tab-item-checkbox:checked');
    if (checkboxes.length === 0) return;

    trackEvent('batch_download_triggered', {
      tabs_count: checkboxes.length
    });

    btnBatchDownload.innerHTML = '<i class="bx bx-loader-alt bx-spin"></i> Processing Tabs...';
    btnBatchDownload.disabled = true;

    try {
      let compiledMarkdown = `# Combined Fix Paste Scrape\n`;
      compiledMarkdown += `Generated: ${new Date().toLocaleString()}\n`;
      compiledMarkdown += `==================================================\n\n`;

      let processedCount = 0;

      for (const cb of checkboxes) {
        const tabId = parseInt(cb.dataset.tabId, 10);
        showStatus(`Scraping tab ${processedCount + 1} of ${checkboxes.length}...`);

        try {
          // Inject content script
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
          });

          // Request extract
          const response = await new Promise((resolve) => {
            chrome.tabs.sendMessage(tabId, { action: 'extract', options: { includeImages: optImages.checked, preserveLinks: optLinks.checked } }, (res) => {
              if (chrome.runtime.lastError) {
                resolve({ success: false, error: 'Runtime communication failed.' });
              } else {
                resolve(res);
              }
            });
          });

          if (response && response.success) {
            const data = response.data;
            compiledMarkdown += `## ${data.title}\n`;
            compiledMarkdown += `Source: [${new URL(data.url).hostname}](${data.url})\n\n`;
            compiledMarkdown += `${data.markdown}\n\n`;
            compiledMarkdown += `***\n\n`;
            processedCount++;
          }
        } catch (tabErr) {
          console.warn(`Could not extract content from tab ID ${tabId}:`, tabErr);
        }
      }

      if (processedCount === 0) {
        throw new Error('Failed to extract content from any of the selected tabs.');
      }

      // Trigger download
      const blob = new Blob([compiledMarkdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `compiled-clippings-${Date.now().toString().substring(6)}.md`;
      a.click();
      URL.revokeObjectURL(url);

      showStatus(`Compiled and saved ${processedCount} clips!`);
    } catch (err) {
      showError(err.message);
    } finally {
      updateBatchButtonState();
    }
  });

  // --- Status Utilities ---

  function showStatus(msg) {
    statusText.textContent = msg;
    statusText.style.color = '';
    clearTimeout(statusText.timeoutId);
    statusText.timeoutId = setTimeout(() => {
      statusText.textContent = 'Ready to extract page content.';
    }, 3500);
  }

  function showError(msg) {
    statusText.textContent = msg;
    statusText.style.color = '#ef4444';
    clearTimeout(statusText.timeoutId);
    statusText.timeoutId = setTimeout(() => {
      statusText.style.color = '';
      statusText.textContent = 'Ready to extract page content.';
    }, 4500);
  }

  // --- Telemetry / Analytics Manager ---
  // To track live stats, enter your free Mixpanel Project Token below:
  const TELEMETRY_TOKEN = '6d0ee0ebb1a11bbea59139fd285990b0';

  function trackEvent(eventName, properties = {}) {
    const telemetryCheckbox = document.getElementById('opt-telemetry');
    if (!telemetryCheckbox || !telemetryCheckbox.checked) return;

    // Log locally in development/console so the creator can see events firing
    console.log(`[Telemetry Event] ${eventName}:`, properties);

    if (!TELEMETRY_TOKEN) return;

    const payload = {
      event: eventName,
      properties: {
        token: TELEMETRY_TOKEN,
        distinct_id: getAnonymousUserId(),
        time: Date.now(),
        ...properties
      }
    };

    fetch('https://api.mixpanel.com/track', {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }).catch(err => console.warn('Telemetry transmission failed:', err));
  }

  function getAnonymousUserId() {
    let id = localStorage.getItem('anonymous_client_id');
    if (!id) {
      id = 'client_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
      localStorage.setItem('anonymous_client_id', id);
    }
    return id;
  }
});
