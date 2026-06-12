/**
 * Fix Paste - Content Extraction Engine (Content Script)
 * 
 * Implements heuristic-based DOM parsing to identify, extract, and clean
 * the main content area of a webpage, converting it to structured outputs.
 * Supports HTML Table parsing and floating user feedback.
 */

(function () {
  // Listen for extraction messages from the extension popup or background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extract') {
      try {
        const options = request.options || {};
        const extractedData = extractContent(options);
        sendResponse({ success: true, data: extractedData });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    } else if (request.action === 'extractAndCopy') {
      try {
        const options = request.options || {};
        const extractedData = extractContent(options);
        const format = options.format || 'text';
        
        let promise;
        if (format === 'text') {
          promise = writeToClipboard(extractedData.text, extractedData.html);
        } else {
          const textToCopy = format === 'markdown' ? extractedData.markdown : extractedData.json;
          promise = writeToClipboard(textToCopy, null);
        }

        promise.then(() => {
          showToastFeedback("Clean content copied!");
          sendResponse({ success: true });
        }).catch(err => {
          showToastFeedback("Failed to copy content");
          sendResponse({ success: false, error: err.message });
        });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
    }
    return true; // Keep message channel open for asynchronous response
  });

  /**
   * Main extraction driver function
   */
  function extractContent(options) {
    const candidate = findBestContentContainer();
    if (!candidate) {
      throw new Error("Could not identify the main content container on this page.");
    }

    // Clone candidate node to prevent mutating the actual webpage
    const clonedContainer = candidate.cloneNode(true);
    cleanContainer(clonedContainer);

    // Extract blocks from the cleaned DOM tree
    const blocks = extractBlocks(clonedContainer, options);

    // Format output based on requested formats
    return {
      title: document.title || 'Untitled Page',
      url: window.location.href,
      markdown: convertToMarkdown(blocks, options),
      text: convertToPlainText(blocks),
      html: getCleanHTML(clonedContainer, options),
      json: JSON.stringify(blocks, null, 2)
    };
  }

  /**
   * Scrapes DOM to find the most probable element holding the main article/body text
   */
  function findBestContentContainer() {
    // Priority 1: Check standard semantic elements
    const semanticElements = ['article', 'main', '[role="main"]'];
    for (const selector of semanticElements) {
      const el = document.querySelector(selector);
      if (el && el.innerText.trim().length > 300) {
        return el;
      }
    }

    // Priority 2: Run scoring heuristics on general containers (div, section)
    const elements = document.querySelectorAll('div, section, article');
    let bestCandidate = null;
    let maxScore = -1;

    // RegEx patterns for scoring
    const negativePattern = /comment|meta|footer|header|aside|sidebar|nav|menu|share|social|advert|reply|widget/i;
    const positivePattern = /article|post|body|content|entry|main/i;

    elements.forEach(el => {
      // Ignore elements with minimal text
      const text = el.innerText.trim();
      if (text.length < 150) return;

      // Ignore structural elements that span the entire document height if they are not content containers
      if (el.scrollHeight > window.innerHeight * 5 && el.tagName === 'BODY') return;

      let score = 0;

      // Add score based on paragraphs count and text density
      const paragraphs = el.querySelectorAll('p');
      score += paragraphs.length * 5;

      // Score based on text length to total DOM size ratio
      const linkDensity = getLinkDensity(el);
      if (linkDensity > 0.4) {
        score -= 50; // Heavily discount link directories (navbars, index pages)
      }

      // Attribute name inspection
      const idStr = el.id || '';
      const classStr = Array.from(el.classList).join(' ');

      if (negativePattern.test(idStr) || negativePattern.test(classStr)) {
        score -= 25;
      }
      if (positivePattern.test(idStr) || positivePattern.test(classStr)) {
        score += 35;
      }

      if (score > maxScore) {
        maxScore = score;
        bestCandidate = el;
      }
    });

    // Default fallback to body
    return bestCandidate || document.body;
  }

  /**
   * Computes the ratio of link text length to total text length
   */
  function getLinkDensity(element) {
    const textLength = element.innerText.trim().length;
    if (textLength === 0) return 0;

    let linkTextLength = 0;
    const links = element.querySelectorAll('a');
    links.forEach(link => {
      linkTextLength += link.innerText.trim().length;
    });

    return linkTextLength / textLength;
  }

  /**
   * Strips script tags, style sheets, ads, hidden items, and irrelevant nodes
   */
  function cleanContainer(element) {
    const selectorsToRemove = [
      'script', 'style', 'noscript', 'iframe', 'svg',
      'nav', 'footer', 'header', 'aside',
      '.ads', '#ads', '.social', '.comments', '.sidebar', '.menu',
      '[aria-hidden="true"]', '[style*="display: none"]'
    ];

    selectorsToRemove.forEach(selector => {
      element.querySelectorAll(selector).forEach(node => node.remove());
    });
  }

  /**
   * Traverses DOM recursively to extract structured block elements
   */
  function extractBlocks(element, options) {
    const blocks = [];
    
    function traverse(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) {
          const parentTag = node.parentNode.tagName;
          if (['DIV', 'SECTION', 'ARTICLE', 'BODY'].includes(parentTag)) {
            blocks.push({ type: 'paragraph', text });
          }
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toLowerCase();

      // Check table elements
      if (tag === 'table') {
        const tableBlock = parseTableElement(node);
        if (tableBlock) {
          blocks.push(tableBlock);
        }
        return; // Skip inner traversal for individual cells
      }

      // Check div-based grid tables
      if (tag === 'div') {
        const divTableBlock = detectAndParseDivTable(node);
        if (divTableBlock) {
          blocks.push(divTableBlock);
          return; // Skip inner traversal
        }
      }

      // Check headings
      if (/^h[1-6]$/.test(tag)) {
        const level = parseInt(tag.substring(1), 10);
        blocks.push({
          type: 'heading',
          level,
          text: node.innerText.trim()
        });
        return;
      }

      // Check paragraph
      if (tag === 'p') {
        const text = node.innerText.trim();
        if (text) {
          blocks.push({ type: 'paragraph', text });
        }
        return;
      }

      // Check list elements
      if (tag === 'ul' || tag === 'ol') {
        const items = [];
        node.querySelectorAll(':scope > li').forEach(li => {
          items.push(li.innerText.trim());
        });
        if (items.length > 0) {
          blocks.push({
            type: tag === 'ol' ? 'ordered-list' : 'unordered-list',
            items
          });
        }
        return;
      }

      // Check images
      if (tag === 'img' && options.includeImages) {
        const src = node.getAttribute('src');
        const alt = node.getAttribute('alt') || '';
        if (src && !src.startsWith('data:image')) {
          blocks.push({ type: 'image', src, alt });
        }
        return;
      }

      // Fallback for links if inside other raw blocks
      if (tag === 'a' && options.preserveLinks) {
        const href = node.getAttribute('href');
        const text = node.innerText.trim();
        if (href && text) {
          blocks.push({ type: 'link', href, text });
        }
        return;
      }

      // Recursively check children
      node.childNodes.forEach(child => traverse(child));
    }

    traverse(element);
    return blocks;
  }

  /**
   * Parses standard HTML table elements into structured arrays of cell data
   */
  function parseTableElement(tableNode) {
    const rows = [];
    const trElements = tableNode.querySelectorAll('tr');
    
    trElements.forEach(tr => {
      const cells = [];
      const cellElements = tr.querySelectorAll('th, td');
      cellElements.forEach(cell => {
        cells.push(cell.innerText.trim().replace(/\s+/g, ' '));
      });
      if (cells.length > 0) {
        rows.push(cells);
      }
    });

    if (rows.length === 0) return null;

    // Distinguish headers and rows
    let headerRow = [];
    let dataRows = rows;

    const firstRowHasTh = trElements[0]?.querySelector('th');
    if (firstRowHasTh || rows.length > 1) {
      headerRow = rows[0];
      dataRows = rows.slice(1);
    } else {
      headerRow = Array(rows[0].length).fill('Column');
    }

    return {
      type: 'table',
      headers: headerRow,
      rows: dataRows
    };
  }

  /**
   * Detects and parses custom grid/flex tables built with nested divs
   */
  function detectAndParseDivTable(node) {
    if (node.tagName.toLowerCase() !== 'div') return null;

    const children = Array.from(node.children);
    // Div-based tables must contain at least 2 rows
    if (children.length < 2) return null;

    let isTable = true;
    let colCount = -1;
    const rows = [];

    for (const child of children) {
      if (child.tagName.toLowerCase() !== 'div') {
        isTable = false;
        break;
      }

      const cols = Array.from(child.children);
      // Row must contain at least 2 column nodes
      if (cols.length < 2) {
        isTable = false;
        break;
      }

      if (colCount === -1) {
        colCount = cols.length;
      } else if (cols.length !== colCount) {
        // All rows must have identical column counts
        isTable = false;
        break;
      }

      const rowData = cols.map(col => col.innerText.trim().replace(/\s+/g, ' '));
      rows.push(rowData);
    }

    if (!isTable || rows.length === 0) return null;

    const headerRow = rows[0];
    const dataRows = rows.slice(1);

    return {
      type: 'table',
      headers: headerRow,
      rows: dataRows
    };
  }

  /**
   * Formats blocks into a clean Markdown document
   */
  function convertToMarkdown(blocks, options) {
    let markdown = '';
    
    markdown += `# ${document.title || 'Untitled Page'}\n\n`;
    markdown += `Source: [${window.location.host}](${window.location.href})\n\n`;
    markdown += `---\n\n`;

    blocks.forEach(block => {
      switch (block.type) {
        case 'heading':
          markdown += `${'#'.repeat(block.level)} ${block.text}\n\n`;
          break;
        case 'paragraph':
          markdown += `${block.text}\n\n`;
          break;
        case 'unordered-list':
          block.items.forEach(item => {
            markdown += `- ${item}\n`;
          });
          markdown += '\n';
          break;
        case 'ordered-list':
          block.items.forEach((item, index) => {
            markdown += `${index + 1}. ${item}\n`;
          });
          markdown += '\n';
          break;
        case 'table':
          const headers = block.headers;
          markdown += `| ${headers.join(' | ')} |\n`;
          markdown += `| ${headers.map(() => '---').join(' | ')} |\n`;
          block.rows.forEach(row => {
            const paddedRow = [...row];
            while (paddedRow.length < headers.length) {
              paddedRow.push('');
            }
            markdown += `| ${paddedRow.join(' | ')} |\n`;
          });
          markdown += '\n';
          break;
        case 'image':
          if (options.includeImages) {
            markdown += `![${block.alt}](${block.src})\n\n`;
          }
          break;
        case 'link':
          if (options.preserveLinks) {
            markdown += `[${block.text}](${block.href})\n\n`;
          } else {
            markdown += `${block.text}\n\n`;
          }
          break;
      }
    });

    return markdown.trim() + '\n';
  }

  /**
   * Formats blocks into structured plain text
   */
  function convertToPlainText(blocks) {
    let text = '';
    
    text += `${document.title || 'Untitled Page'}\n`;
    text += `Source: ${window.location.href}\n`;
    text += `========================================\n\n`;

    blocks.forEach(block => {
      switch (block.type) {
        case 'heading':
          text += `\n${block.text.toUpperCase()}\n\n`;
          break;
        case 'paragraph':
          text += `${block.text}\n\n`;
          break;
        case 'unordered-list':
          block.items.forEach(item => {
            text += `* ${item}\n`;
          });
          text += '\n';
          break;
        case 'ordered-list':
          block.items.forEach((item, index) => {
            text += `${index + 1}. ${item}\n`;
          });
          text += '\n';
          break;
        case 'table':
          const colsCount = block.headers.length;
          const colWidths = Array(colsCount).fill(0);
          
          block.headers.forEach((h, colIndex) => {
            colWidths[colIndex] = Math.max(colWidths[colIndex], h.length);
          });
          
          block.rows.forEach(row => {
            row.forEach((cell, colIndex) => {
              if (colIndex < colsCount) {
                colWidths[colIndex] = Math.max(colWidths[colIndex], cell.length);
              }
            });
          });
          
          const padCell = (val, width) => {
            return val + ' '.repeat(Math.max(0, width - val.length));
          };
          
          const headerCells = block.headers.map((h, idx) => padCell(h, colWidths[idx]));
          text += `| ${headerCells.join(' | ')} |\n`;
          
          const separators = colWidths.map(w => '-'.repeat(w));
          text += `| ${separators.join(' | ')} |\n`;
          
          block.rows.forEach(row => {
            const rowCells = [];
            for (let idx = 0; idx < colsCount; idx++) {
              rowCells.push(padCell(row[idx] || '', colWidths[idx]));
            }
            text += `| ${rowCells.join(' | ')} |\n`;
          });
          text += '\n';
          break;
        case 'image':
          text += `[Image: ${block.alt || 'No description'} - ${block.src}]\n\n`;
          break;
        case 'link':
          text += `${block.text} (${block.href})\n\n`;
          break;
      }
    });

    return text.trim() + '\n';
  }

  /**
   * Displays a temporary floating status toast feedback overlay in the tab
   */
  function showToastFeedback(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    
    // Inline styling for the feedback toast
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      backgroundColor: 'hsla(222, 25%, 12%, 0.95)',
      color: 'hsl(222, 15%, 95%)',
      padding: '12px 24px',
      borderRadius: '8px',
      fontFamily: "'Outfit', sans-serif",
      fontSize: '14px',
      fontWeight: '500',
      boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
      borderLeft: '4px solid hsl(258, 65%, 60%)',
      borderTop: '1px solid hsla(222, 20%, 30%, 0.3)',
      borderRight: '1px solid hsla(222, 20%, 30%, 0.3)',
      borderBottom: '1px solid hsla(222, 20%, 30%, 0.3)',
      backdropFilter: 'blur(10px)',
      zIndex: '2147483647',
      opacity: '0',
      transform: 'translateX(30px)',
      transition: 'all 0.35s cubic-bezier(0.16, 1, 0.3, 1)'
    });

    document.body.appendChild(toast);

    // Trigger transition Reflow
    toast.offsetHeight;

    // Animate In (slide left & fade in)
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';

    // Animate Out & Destroy (slide up & fade out)
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.addEventListener('transitionend', () => toast.remove());
    }, 2500);
  }

  /**
   * Sanitizes DOM tree to extract clean, minimal, semantic HTML tags suitable for copy-pasting
   */
  function getCleanHTML(element, options) {
    const clone = element.cloneNode(true);
    
    function cleanNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        
        // Whitelist of clean formatting tags to preserve
        const allowedTags = [
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li',
          'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img',
          'strong', 'b', 'em', 'i', 'span', 'br'
        ];
        
        if (!allowedTags.includes(tag)) {
          // Unwrap tag: lift children up and remove parent wrapper
          const parent = node.parentNode;
          if (parent) {
            while (node.firstChild) {
              parent.insertBefore(node.firstChild, node);
            }
            node.remove();
          }
          return;
        }
        
        // Clean all attributes except standard essentials
        const attrs = Array.from(node.attributes);
        attrs.forEach(attr => {
          const name = attr.name.toLowerCase();
          if (tag === 'a' && name === 'href') {
            if (!options.preserveLinks) {
              node.removeAttribute('href');
            }
          } else if (tag === 'img' && (name === 'src' || name === 'alt')) {
            if (!options.includeImages && name === 'src') {
              node.remove();
            }
          } else {
            // Strip classes, ids, styles, datasets, custom attrs
            node.removeAttribute(attr.name);
          }
        });
      }
      
      // Clean children recursively
      Array.from(node.childNodes).forEach(cleanNode);
    }
    
    cleanNode(clone);
    return clone.innerHTML;
  }

  /**
   * Writes text and HTML streams to the system clipboard simultaneously using ClipboardItem
   */
  function writeToClipboard(plainText, htmlText) {
    const data = {
      'text/plain': new Blob([plainText], { type: 'text/plain' })
    };
    
    if (htmlText) {
      data['text/html'] = new Blob([htmlText], { type: 'text/html' });
    }
    
    const item = new ClipboardItem(data);
    return navigator.clipboard.write([item]);
  }
})();
