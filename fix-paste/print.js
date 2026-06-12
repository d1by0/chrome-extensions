/**
 * Fix Paste - PDF Generation Script
 * 
 * Safely reads cached extraction data from chrome.storage,
 * populates the print document tree, and triggers the print dialog.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Retrieve the content stored in chrome.storage.local
  chrome.storage.local.get('pdfContent', (data) => {
    if (data && data.pdfContent) {
      const content = data.pdfContent;
      
      // Update DOM
      document.title = content.title;
      document.getElementById('print-title').textContent = content.title;
      document.getElementById('print-meta').innerHTML = `Source: <a href="${content.url}">${content.url}</a>`;
      document.getElementById('print-content').innerHTML = content.html;
      
      // Wait for layout rendering and trigger print sequence
      setTimeout(() => {
        window.print();
        window.close();
      }, 500);
    }
  });
});
