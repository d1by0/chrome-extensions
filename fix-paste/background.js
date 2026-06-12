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

      // Send instruction to content script to perform extraction and write to clipboard
      chrome.tabs.sendMessage(tab.id, {
        action: 'extractAndCopy',
        options: {
          includeImages: true,
          preserveLinks: true,
          format: 'text' // Default to Text for context menu copy
        }
      });
    } catch (err) {
      console.error('Failed to run Fix Paste context menu action:', err);
    }
  }
});
