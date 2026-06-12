/**
 * Fix Paste - Extension Interface Controller (Popup Script)
 * 
 * Manages user configurations, injects content scripts, receives data,
 * and facilitates copying/downloading of cleaned outputs.
 * Saves user selections and options to storage.
 */

document.addEventListener('DOMContentLoaded', () => {
  let selectedFormat = 'text';
  let extractedContent = null;

  // UI elements
  const formatButtons = document.querySelectorAll('.format-btn');
  const btnCopy = document.getElementById('btn-copy');
  const btnDownload = document.getElementById('btn-download');
  const btnPDF = document.getElementById('btn-pdf');
  const statusText = document.getElementById('status-text');

  const optImages = document.getElementById('opt-images');
  const optLinks = document.getElementById('opt-links');

  // Load preferences from local storage
  chrome.storage.local.get({
    format: 'text',
    includeImages: true,
    preserveLinks: true
  }, (items) => {
    selectedFormat = items.format;
    optImages.checked = items.includeImages;
    optLinks.checked = items.preserveLinks;

    // Set active class on the stored format button
    formatButtons.forEach(btn => {
      if (btn.getAttribute('data-format') === selectedFormat) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    updateStatusDisplay();
  });

  // Format selection interaction
  formatButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      formatButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFormat = btn.getAttribute('data-format');
      updateStatusDisplay();
      
      // Save setting to storage
      chrome.storage.local.set({ format: selectedFormat });
    });
  });

  // Option change interactions
  optImages.addEventListener('change', () => {
    chrome.storage.local.set({ includeImages: optImages.checked });
  });

  optLinks.addEventListener('change', () => {
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
      
      if (selectedFormat === 'text') {
        data['text/plain'] = new Blob([content.text], { type: 'text/plain' });
        if (content.html) {
          data['text/html'] = new Blob([content.html], { type: 'text/html' });
        }
      } else {
        const textToCopy = getFormattedText();
        data['text/plain'] = new Blob([textToCopy], { type: 'text/plain' });
      }

      const item = new ClipboardItem(data);
      await navigator.clipboard.write([item]);

      // Trigger floating overlay feedback on the host page
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'extractAndCopy',
          options: {
            includeImages: optImages.checked,
            preserveLinks: optLinks.checked,
            format: selectedFormat
          }
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

  // Download file action
  btnDownload.addEventListener('click', async () => {
    const originalText = btnDownload.textContent;
    btnDownload.textContent = 'Preparing...';
    btnDownload.disabled = true;

    try {
      const content = await getExtractedContent();
      const textToDownload = getFormattedText();
      const filename = getDownloadFilename();
      const mimeType = getMimeType();

      const blob = new Blob([textToDownload], { type: mimeType });
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

  // Helper: Retrieve active formatted text
  function getFormattedText() {
    if (!extractedContent) return '';
    switch (selectedFormat) {
      case 'markdown':
        return extractedContent.markdown;
      case 'text':
        return extractedContent.text;
      case 'json':
        return extractedContent.json;
      default:
        return '';
    }
  }

  // Helper: Get file name based on output format
  function getDownloadFilename() {
    const title = (extractedContent?.title || 'page')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    
    switch (selectedFormat) {
      case 'markdown':
        return `${title}.md`;
      case 'text':
        return `${title}.txt`;
      case 'json':
        return `${title}.json`;
      default:
        return `${title}.txt`;
    }
  }

  // Helper: Get correct Mime Type for downloads
  function getMimeType() {
    switch (selectedFormat) {
      case 'markdown':
        return 'text/markdown;charset=utf-8';
      case 'text':
        return 'text/plain;charset=utf-8';
      case 'json':
        return 'application/json;charset=utf-8';
      default:
        return 'text/plain;charset=utf-8';
    }
  }

  // Helper: Update status information text
  function updateStatusDisplay() {
    let formatLabel = 'Markdown';
    if (selectedFormat === 'text') formatLabel = 'Plain Text';
    if (selectedFormat === 'json') formatLabel = 'JSON';

    statusText.textContent = `Ready to copy as ${formatLabel}.`;
  }

  // Helper: Render error message inside status section
  function showError(msg) {
    statusText.textContent = msg;
    statusText.style.color = 'hsl(350, 75%, 65%)';

    setTimeout(() => {
      statusText.style.color = '';
      updateStatusDisplay();
    }, 4000);
  }
});
