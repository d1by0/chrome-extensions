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
      
      // Find all images in print content
      const images = Array.from(document.querySelectorAll('#print-content img'));
      
      if (images.length === 0) {
        // No images, print immediately after a small rendering delay
        setTimeout(() => {
          const loader = document.getElementById('print-loader');
          if (loader) loader.classList.add('hidden');
          setTimeout(() => {
            window.print();
            window.close();
          }, 400);
        }, 300);
      } else {
        // Wait for all images to complete loading or fail
        const loadPromises = images.map(img => {
          if (img.complete) {
            return Promise.resolve();
          }
          return new Promise(resolve => {
            img.addEventListener('load', resolve);
            img.addEventListener('error', resolve); // Resolve on error so we don't hang
          });
        });
        
        Promise.all(loadPromises).then(() => {
          // Hide loader, wait for transition, and print
          const loader = document.getElementById('print-loader');
          if (loader) loader.classList.add('hidden');
          
          setTimeout(() => {
            window.print();
            window.close();
          }, 800); // 800ms gives time for fading animation & paint decoding
        });
      }
    }
  });
});
