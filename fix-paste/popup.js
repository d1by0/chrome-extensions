/**
 * Fix Paste - Extension Interface Controller (Popup Script)
 * 
 * Manages extraction commands, clipboard formatting (both rich HTML and
 * formatted plain text simultaneously), and file export downloads.
 */

document.addEventListener('DOMContentLoaded', () => {
  let extractedContent = null;

  // UI elements
  const btnCopy = document.getElementById('btn-copy');
  const btnDownload = document.getElementById('btn-download');
  const btnPDF = document.getElementById('btn-pdf');
  const statusText = document.getElementById('status-text');

  const optImages = document.getElementById('opt-images');
  const optLinks = document.getElementById('opt-links');

  // Load preferences from local storage (defaulting to true)
  chrome.storage.local.get({
    includeImages: true,
    preserveLinks: true
  }, (items) => {
    optImages.checked = items.includeImages;
    optLinks.checked = items.preserveLinks;
  });

  // Settings change handlers (clear cache to force fresh parse)
  optImages.addEventListener('change', () => {
    extractedContent = null;
    chrome.storage.local.set({ includeImages: optImages.checked });
  });

  optLinks.addEventListener('change', () => {
    extractedContent = null;
    chrome.storage.local.set({ preserveLinks: optLinks.checked });
  });

  // Helper to ensure content is extracted
  async function getExtractedContent() {
    if (extractedContent) return extractedContent;
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) {
      throw new Error('No active browser tab detected.');
    }

    // Inject the extraction script dynamically
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

  // Copy to clipboard action
  btnCopy.addEventListener('click', async () => {
    const originalText = btnCopy.textContent;
    btnCopy.textContent = 'Copying...';
    btnCopy.disabled = true;

    try {
      const content = await getExtractedContent();
      const data = {};
      
      data['text/plain'] = new Blob([content.text], { type: 'text/plain' });
      if (content.html) {
        data['text/html'] = new Blob([content.html], { type: 'text/html' });
      }

      const item = new ClipboardItem(data);
      await navigator.clipboard.write([item]);

      // Trigger floating overlay feedback on the host page
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'showToast',
          message: 'Clean content copied!'
        });
      }

      btnCopy.textContent = 'Copied!';
      setTimeout(() => {
        btnCopy.textContent = originalText;
        btnCopy.disabled = false;
      }, 1500);
    } catch (err) {
      btnCopy.textContent = originalText;
      btnCopy.disabled = false;
      showError(err.message);
    }
  });

  // Download text file action
  btnDownload.addEventListener('click', async () => {
    const originalText = btnDownload.textContent;
    btnDownload.textContent = 'Preparing...';
    btnDownload.disabled = true;

    try {
      const content = await getExtractedContent();
      const filename = getDownloadFilename();
      const mimeType = 'text/plain;charset=utf-8';

      const blob = new Blob([content.text], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showError(err.message);
    } finally {
      btnDownload.textContent = originalText;
      btnDownload.disabled = false;
    }
  });

  // Print/Save as PDF action
  btnPDF.addEventListener('click', async () => {
    const originalText = btnPDF.textContent;
    btnPDF.textContent = 'Preparing PDF...';
    btnPDF.disabled = true;

    try {
      const content = await getExtractedContent();
      
      // Save content to local storage for print.html to retrieve
      chrome.storage.local.set({ pdfContent: content }, () => {
        // Open the native print page in a new tab
        chrome.tabs.create({ url: 'print.html' });
      });
      
    } catch (err) {
      showError(err.message);
    } finally {
      btnPDF.textContent = originalText;
      btnPDF.disabled = false;
    }
  });

  // Helper: Get file name based on page title
  function getDownloadFilename() {
    const title = (extractedContent?.title || 'page')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    
    return `${title}.txt`;
  }

  // Helper: Render error message inside status section
  function showError(msg) {
    statusText.textContent = msg;
    statusText.style.color = 'hsl(350, 75%, 65%)';

    setTimeout(() => {
      statusText.style.color = '';
      statusText.textContent = 'Ready to extract page content.';
    }, 4000);
  }
});
