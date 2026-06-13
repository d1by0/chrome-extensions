// Register context menu and alarms on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'fix-paste-context',
    title: 'Fix Paste (Copy Clean Content)',
    contexts: ['page', 'selection']
  });

  // Create alarm to run every 5 minutes for purging expired history items
  chrome.alarms.create('purge-expired-history', { periodInMinutes: 5 });
});

// Clean up "Session Only" items on startup/loading
chrome.runtime.onStartup.addListener(() => {
  purgeSessionHistory();
});

// Also run cleanups immediately when background script loads
purgeSessionAndExpiredHistory();

// Listen for alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'purge-expired-history') {
    purgeExpiredHistory();
  }
});

// Listen for keyboard command shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'quick-extract') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      executeExtractionAndSave(tab);
    }
  }
});

// Listen for context menu click events
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'fix-paste-context' && tab && tab.id) {
    executeExtractionAndSave(tab);
  }
});

// Listen for direct messages to save history (e.g. from popup.js)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'saveHistory') {
    chrome.storage.local.get({ historyExpiryMinutes: 60 }, (items) => {
      saveToHistory(message.data, items.historyExpiryMinutes);
      sendResponse({ success: true });
    });
    return true;
  }
});

/**
 * Executes content script extraction, copies to clipboard, and saves to history.
 */
async function executeExtractionAndSave(tab) {
  try {
    // Inject content script into active tab
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });

    // Fetch user preferences from local storage
    chrome.storage.local.get({
      format: 'text',
      includeImages: true,
      preserveLinks: true,
      historyExpiryMinutes: 60
    }, (items) => {
      // Send instruction to content script to perform extraction and write to clipboard
      chrome.tabs.sendMessage(tab.id, {
        action: 'extractAndCopy',
        options: {
          includeImages: items.includeImages,
          preserveLinks: items.preserveLinks,
          format: items.format
        }
      }, (response) => {
        if (response && response.success && response.data) {
          saveToHistory(response.data, items.historyExpiryMinutes);
        }
      });
    });
  } catch (err) {
    console.error('Failed to run Fix Paste extraction action:', err);
  }
}

/**
 * Saves extracted data into local storage history.
 */
function saveToHistory(data, expiryMinutes) {
  if (!data) return;
  chrome.storage.local.get({ history: [] }, (items) => {
    let history = items.history;
    const timestamp = Date.now();
    
    // Expiry behavior: 0 means "Session Only"
    const expiresAt = expiryMinutes === 0 ? 0 : timestamp + (expiryMinutes * 60 * 1000);

    const newEntry = {
      id: Math.random().toString(36).substring(2, 15) + timestamp.toString(36),
      title: data.title || 'Untitled Page',
      url: data.url || '',
      text: data.text || '',
      markdown: data.markdown || '',
      html: data.html || '',
      json: data.json || '',
      timestamp: timestamp,
      expiresAt: expiresAt
    };

    // Prepend new entry
    history.unshift(newEntry);

    // Limit size
    if (history.length > 50) {
      history = history.slice(0, 50);
    }

    chrome.storage.local.set({ history });
  });
}

/**
 * Purges expired entries from local storage.
 */
function purgeExpiredHistory() {
  chrome.storage.local.get({ history: [] }, (items) => {
    const now = Date.now();
    const cleanHistory = items.history.filter(item => {
      // Keep if expiresAt is 0 (Session Only) or if it hasn't expired yet
      return item.expiresAt === 0 || item.expiresAt > now;
    });

    if (cleanHistory.length !== items.history.length) {
      chrome.storage.local.set({ history: cleanHistory });
    }
  });
}

/**
 * Purges Session-only entries (expiresAt === 0).
 */
function purgeSessionHistory() {
  chrome.storage.local.get({ history: [] }, (items) => {
    const cleanHistory = items.history.filter(item => item.expiresAt !== 0);
    chrome.storage.local.set({ history: cleanHistory });
  });
}

/**
 * Runs both cleanups.
 */
function purgeSessionAndExpiredHistory() {
  chrome.storage.local.get({ history: [] }, (items) => {
    const now = Date.now();
    const cleanHistory = items.history.filter(item => {
      // Remove session only entries on startup, and remove expired entries
      return item.expiresAt !== 0 && item.expiresAt > now;
    });
    chrome.storage.local.set({ history: cleanHistory });
  });
}
