/**
 * Fix Paste - Background Controller (Service Worker)
 * 
 * Registers context menus and handles routing of extraction requests
 * triggered from the page viewport right-click menu.
 */

// Register context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'fix-paste-context',
    title: 'Fix Paste (Copy Clean Content)',
    contexts: ['page', 'selection']
  });
});

// Listen for context menu click events
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'fix-paste-context' && tab && tab.id) {
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
        preserveLinks: true
      }, (items) => {
        // Send instruction to content script to perform extraction and write to clipboard
        chrome.tabs.sendMessage(tab.id, {
          action: 'extractAndCopy',
          options: {
            includeImages: items.includeImages,
            preserveLinks: items.preserveLinks,
            format: items.format
          }
        });
      });
    } catch (err) {
      console.error('Failed to run Fix Paste context menu action:', err);
    }
  }
});
