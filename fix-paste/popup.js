/**
 * Fix Paste - Extension Interface Controller (Popup Script)
 * 
 * Manages user configurations, injects content scripts, receives data,
 * and facilitates copying/downloading of cleaned outputs.
 */

document.addEventListener('DOMContentLoaded', () => {
  let selectedFormat = 'markdown';
  let extractedContent = null;

  // UI elements
  const formatButtons = document.querySelectorAll('.format-btn');
  const btnExtract = document.getElementById('btn-extract');
  const resultSection = document.getElementById('result-section');
  const btnCopy = document.getElementById('btn-copy');
  const btnDownload = document.getElementById('btn-download');
  const statusText = document.getElementById('status-text');

  const optImages = document.getElementById('opt-images');
  const optLinks = document.getElementById('opt-links');

  // Format selection interaction
  formatButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      formatButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedFormat = btn.getAttribute('data-format');
      updateStatusDisplay();
    });
  });

  // Extract Content action
  btnExtract.addEventListener('click', async () => {
    btnExtract.textContent = 'Extracting...';
    btnExtract.disabled = true;
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) {
        throw new Error('No active browser tab detected.');
      }

      // Inject the extraction script dynamically
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });

      // Construct options object
      const options = {
        includeImages: optImages.checked,
        preserveLinks: optLinks.checked
      };

      // Query content script
      chrome.tabs.sendMessage(tab.id, { action: 'extract', options }, (response) => {
        btnExtract.textContent = 'Extract Content';
        btnExtract.disabled = false;

        if (chrome.runtime.lastError) {
          showError('Cannot extract content on this page. Try reloading the tab.');
          return;
        }

        if (response && response.success) {
          extractedContent = response.data;
          resultSection.classList.remove('hidden');
          updateStatusDisplay();
        } else {
          showError(response ? response.error : 'Content extraction failed.');
        }
      });
    } catch (err) {
      btnExtract.textContent = 'Extract Content';
      btnExtract.disabled = false;
      showError(err.message);
    }
  });

  // Copy to clipboard action
  btnCopy.addEventListener('click', async () => {
    if (!extractedContent) return;

    const textToCopy = getFormattedText();
    try {
      await navigator.clipboard.writeText(textToCopy);
      const originalText = btnCopy.textContent;
      btnCopy.textContent = 'Copied!';
      btnCopy.disabled = true;
      
      setTimeout(() => {
        btnCopy.textContent = originalText;
        btnCopy.disabled = false;
      }, 1500);
    } catch (err) {
      showError('Failed to copy to clipboard.');
    }
  });

  // Download file action
  btnDownload.addEventListener('click', () => {
    if (!extractedContent) return;

    const textToDownload = getFormattedText();
    const filename = getDownloadFilename();
    const mimeType = getMimeType();

    try {
      const blob = new Blob([textToDownload], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showError('Failed to trigger download.');
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
    if (!extractedContent) return;
    
    let formatLabel = 'Markdown';
    if (selectedFormat === 'text') formatLabel = 'Plain Text';
    if (selectedFormat === 'json') formatLabel = 'JSON';

    statusText.textContent = `Ready to paste as ${formatLabel}.`;
  }

  // Helper: Render error message inside status section
  function showError(msg) {
    statusText.textContent = msg;
    statusText.style.color = 'hsl(350, 75%, 65%)';
    resultSection.classList.remove('hidden');

    setTimeout(() => {
      statusText.style.color = '';
    }, 4000);
  }
});
