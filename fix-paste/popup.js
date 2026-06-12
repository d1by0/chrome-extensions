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
      const printWindow = window.open('', '_blank');
      
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${content.title}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              line-height: 1.6;
              color: hsl(222, 25%, 15%);
              max-width: 800px;
              margin: 40px auto;
              padding: 0 24px;
              background-color: #fff;
            }
            h1 {
              font-size: 2.2rem;
              font-weight: 600;
              margin-bottom: 8px;
              color: hsl(222, 25%, 10%);
              letter-spacing: -0.025em;
              line-height: 1.25;
            }
            .meta {
              font-size: 0.9rem;
              color: hsl(222, 10%, 45%);
              margin-bottom: 24px;
            }
            .meta a {
              color: hsl(258, 65%, 50%);
              text-decoration: none;
            }
            hr {
              border: 0;
              border-top: 1px solid hsl(222, 20%, 90%);
              margin-bottom: 30px;
            }
            p {
              margin-bottom: 20px;
              font-size: 1.05rem;
              color: hsl(222, 20%, 20%);
            }
            h2 {
              font-size: 1.6rem;
              font-weight: 600;
              margin-top: 36px;
              margin-bottom: 14px;
              color: hsl(222, 25%, 12%);
              border-bottom: 1px solid hsl(222, 20%, 95%);
              padding-bottom: 6px;
            }
            h3 {
              font-size: 1.25rem;
              font-weight: 500;
              margin-top: 24px;
              margin-bottom: 10px;
              color: hsl(222, 25%, 15%);
            }
            ul, ol {
              margin-bottom: 20px;
              padding-left: 24px;
            }
            li {
              margin-bottom: 8px;
              color: hsl(222, 20%, 20%);
            }
            img {
              max-width: 100%;
              height: auto;
              display: block;
              margin: 24px auto;
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 28px 0;
              font-size: 0.95rem;
            }
            th, td {
              border: 1px solid hsl(222, 20%, 88%);
              padding: 12px 14px;
              text-align: left;
            }
            th {
              background-color: hsl(222, 20%, 97%);
              font-weight: 600;
              color: hsl(222, 25%, 15%);
            }
            @media print {
              body {
                margin: 20px;
                color: #000;
              }
              h1, h2, h3 {
                page-break-after: avoid;
              }
              tr {
                page-break-inside: avoid;
              }
              img {
                page-break-inside: avoid;
              }
            }
          </style>
        </head>
        <body>
          <h1>${content.title}</h1>
          <div class="meta">Source: <a href="${content.url}">${content.url}</a></div>
          <hr>
          ${content.html}
          <script>
            window.onload = function() {
              window.print();
              window.close();
            };
          </script>
        </body>
        </html>
      `;
      printWindow.document.write(htmlContent);
      printWindow.document.close();
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
