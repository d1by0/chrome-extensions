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
      const options = request.options || {};
      extractContent(options)
        .then(extractedData => {
          sendResponse({ success: true, data: extractedData });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true; // Keep message channel open for asynchronous response
    } else if (request.action === 'extractAndCopy') {
      const options = request.options || {};
      extractContent(options)
        .then(extractedData => {
          let textToCopy = extractedData.text;
          if (options.format === 'markdown') {
            textToCopy = extractedData.markdown;
          } else if (options.format === 'json') {
            textToCopy = extractedData.json;
          }
          return writeToClipboard(textToCopy, extractedData.html)
            .then(() => {
              showToastFeedback("Clean content copied!");
              sendResponse({ success: true });
            });
        })
        .catch(error => {
          sendResponse({ success: false, error: error.message });
        });
      return true;
    } else if (request.action === 'showToast') {
      showToastFeedback(request.message || "Clean content copied!");
      sendResponse({ success: true });
      return true;
    }
    return true;
  });

  /**
   * Main extraction driver function (asynchronous)
   */
  async function extractContent(options) {
    const candidate = findBestContentContainer();
    if (!candidate) {
      throw new Error("Could not identify the main content container on this page.");
    }

    // Clone candidate node to prevent mutating the actual webpage
    const clonedContainer = candidate.cloneNode(true);
    cleanContainer(clonedContainer);

    // Extract blocks from the cleaned DOM tree (before converting images to base64 to keep markdown/text clean)
    const blocks = extractBlocks(clonedContainer, options);

    // Format HTML output (converts images to base64 asynchronously)
    const html = await getCleanHTML(clonedContainer, options);

    return {
      title: document.title || 'Untitled Page',
      url: window.location.href,
      markdown: convertToMarkdown(blocks, options),
      text: convertToPlainText(blocks, options),
      html: html,
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
      'nav', 'footer', 'aside',
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
  /**
   * Recursively formats node children into Markdown inline elements
   */
  function nodeToMarkdown(node, options) {
    let md = '';
    if (!node) return md;
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        md += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'strong' || tag === 'b') {
          md += `**${nodeToMarkdown(child, options)}**`;
        } else if (tag === 'em' || tag === 'i') {
          md += `*${nodeToMarkdown(child, options)}*`;
        } else if (tag === 'a') {
          const href = child.getAttribute('href');
          const text = nodeToMarkdown(child, options).trim();
          if (options.preserveLinks && href && text) {
            md += `[${text}](${makeAbsoluteURL(href)})`;
          } else {
            md += text;
          }
        } else if (tag === 'code') {
          md += `\`${child.innerText}\``;
        } else if (tag === 'br') {
          md += '\n';
        } else {
          md += nodeToMarkdown(child, options);
        }
      }
    });
    return md;
  }

  /**
   * Recursively formats node children into plain text with optional link URLs
   */
  function nodeToPlainText(node, options) {
    let txt = '';
    if (!node) return txt;
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        txt += child.textContent;
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        if (tag === 'a') {
          const href = child.getAttribute('href');
          const text = nodeToPlainText(child, options).trim();
          if (options.preserveLinks && href && text) {
            txt += `${text} (${makeAbsoluteURL(href)})`;
          } else {
            txt += text;
          }
        } else if (tag === 'br') {
          txt += '\n';
        } else {
          txt += nodeToPlainText(child, options);
        }
      }
    });
    return txt;
  }

  function extractBlocks(element, options) {
    const blocks = [];
    
    function traverse(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        if (text) {
          const parentTag = node.parentNode.tagName;
          if (['DIV', 'SECTION', 'ARTICLE', 'BODY'].includes(parentTag)) {
            const mockP = document.createElement('p');
            mockP.textContent = text;
            blocks.push({ type: 'paragraph', node: mockP });
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
        return; // Skip inner traversal
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
          node: node.cloneNode(true)
        });
        return;
      }

      // Check paragraph
      if (tag === 'p') {
        if (node.innerText.trim()) {
          blocks.push({
            type: 'paragraph',
            node: node.cloneNode(true)
          });
        }
        return;
      }

      // Check blockquote
      if (tag === 'blockquote') {
        if (node.innerText.trim()) {
          blocks.push({
            type: 'blockquote',
            node: node.cloneNode(true)
          });
        }
        return;
      }

      // Check list elements
      if (tag === 'ul' || tag === 'ol') {
        const items = [];
        node.querySelectorAll(':scope > li').forEach(li => {
          items.push(li.cloneNode(true));
        });
        if (items.length > 0) {
          blocks.push({
            type: tag === 'ol' ? 'ordered-list' : 'unordered-list',
            items
          });
        }
        return;
      }

      // Check pre/code blocks
      if (tag === 'pre') {
        if (node.innerText.trim()) {
          blocks.push({
            type: 'code-block',
            text: node.innerText.trim()
          });
        }
        return;
      }

      // Check images
      if (tag === 'img' && options.includeImages) {
        const rawSrc = node.getAttribute('src');
        const alt = node.getAttribute('alt') || '';
        if (rawSrc && !rawSrc.startsWith('data:image')) {
          const src = makeAbsoluteURL(rawSrc);
          blocks.push({ type: 'image', src, alt });
        }
        return;
      }

      // Fallback for links if inside other raw blocks
      if (tag === 'a' && options.preserveLinks) {
        const rawHref = node.getAttribute('href');
        const text = node.innerText.trim();
        if (rawHref && text) {
          const href = makeAbsoluteURL(rawHref);
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
        cells.push(cell.cloneNode(true));
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
      headerRow = Array(rows[0].length).fill(null);
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

      const rowData = cols.map(col => col.cloneNode(true));
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
          markdown += `${'#'.repeat(block.level)} ${nodeToMarkdown(block.node, options)}\n\n`;
          break;
        case 'paragraph':
          markdown += `${nodeToMarkdown(block.node, options)}\n\n`;
          break;
        case 'blockquote':
          markdown += `> ${nodeToMarkdown(block.node, options).split('\n').join('\n> ')}\n\n`;
          break;
        case 'code-block':
          markdown += `\`\`\`\n${block.text}\n\`\`\`\n\n`;
          break;
        case 'unordered-list':
          block.items.forEach(item => {
            markdown += `- ${nodeToMarkdown(item, options)}\n`;
          });
          markdown += '\n';
          break;
        case 'ordered-list':
          block.items.forEach((item, index) => {
            markdown += `${index + 1}. ${nodeToMarkdown(item, options)}\n`;
          });
          markdown += '\n';
          break;
        case 'table':
          const mdHeaders = block.headers.map(hNode => hNode ? nodeToMarkdown(hNode, options).trim().replace(/\r?\n/g, ' ') : 'Column');
          markdown += `| ${mdHeaders.join(' | ')} |\n`;
          markdown += `| ${mdHeaders.map(() => '---').join(' | ')} |\n`;
          block.rows.forEach(row => {
            const mdRow = row.map(cellNode => cellNode ? nodeToMarkdown(cellNode, options).trim().replace(/\r?\n/g, ' ') : '');
            while (mdRow.length < mdHeaders.length) {
              mdRow.push('');
            }
            markdown += `| ${mdRow.join(' | ')} |\n`;
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
  function convertToPlainText(blocks, options) {
    let text = '';
    
    text += `${document.title || 'Untitled Page'}\n`;
    text += `Source: ${window.location.href}\n`;
    text += `========================================\n\n`;

    blocks.forEach(block => {
      switch (block.type) {
        case 'heading':
          text += `\n**${nodeToPlainText(block.node, options).toUpperCase()}**\n\n`;
          break;
        case 'paragraph':
          text += `${nodeToPlainText(block.node, options)}\n\n`;
          break;
        case 'blockquote':
          text += `> ${nodeToPlainText(block.node, options).split('\n').join('\n> ')}\n\n`;
          break;
        case 'code-block':
          text += `\n--------------------\n${block.text}\n--------------------\n\n`;
          break;
        case 'unordered-list':
          block.items.forEach(item => {
            text += `* ${nodeToPlainText(item, options)}\n`;
          });
          text += '\n';
          break;
        case 'ordered-list':
          block.items.forEach((item, index) => {
            text += `${index + 1}. ${nodeToPlainText(item, options)}\n`;
          });
          text += '\n';
          break;
        case 'table':
          const textHeaders = block.headers.map(hNode => hNode ? nodeToPlainText(hNode, options).trim().replace(/\s+/g, ' ') : 'Column');
          const textRows = block.rows.map(row => row.map(cellNode => cellNode ? nodeToPlainText(cellNode, options).trim().replace(/\s+/g, ' ') : ''));
          
          const colsCount = textHeaders.length;
          const colWidths = Array(colsCount).fill(0);
          
          textHeaders.forEach((h, colIndex) => {
            colWidths[colIndex] = Math.max(colWidths[colIndex], h.length);
          });
          
          textRows.forEach(row => {
            row.forEach((cell, colIndex) => {
              if (colIndex < colsCount) {
                colWidths[colIndex] = Math.max(colWidths[colIndex], cell.length);
              }
            });
          });
          
          const padCell = (val, width) => {
            return val + ' '.repeat(Math.max(0, width - val.length));
          };
          
          const headerCells = textHeaders.map((h, idx) => padCell(h, colWidths[idx]));
          text += `| ${headerCells.join(' | ')} |\n`;
          
          const separators = colWidths.map(w => '-'.repeat(w));
          text += `| ${separators.join(' | ')} |\n`;
          
          textRows.forEach(row => {
            const rowCells = [];
            for (let idx = 0; idx < colsCount; idx++) {
              rowCells.push(padCell(row[idx] || '', colWidths[idx]));
            }
            text += `| ${rowCells.join(' | ')} |\n`;
          });
          text += '\n';
          break;
        case 'image':
          text += `{image: ${block.alt || 'Untitled'}}\n\n`;
          break;
        case 'link':
          if (options && options.preserveLinks) {
            text += `${block.text} (${block.href})\n\n`;
          } else {
            text += `${block.text}\n\n`;
          }
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
   * Helper to convert image links inside a container to self-contained Base64 Data URLs
   */
  async function convertImagesToBase64(container) {
    const images = Array.from(container.querySelectorAll('img'));
    for (const img of images) {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('data:')) {
        const absoluteSrc = makeAbsoluteURL(src);
        try {
          const res = await fetch(absoluteSrc);
          const blob = await res.blob();
          const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          img.setAttribute('src', dataUrl);
        } catch (e) {
          console.warn('Could not convert image to base64:', absoluteSrc, e);
          img.setAttribute('src', absoluteSrc);
        }
      }
    }
  }

  /**
   * Sanitizes DOM tree to extract clean, minimal, semantic HTML tags suitable for copy-pasting
   */
  async function getCleanHTML(element, options) {
    const clone = element.cloneNode(true);
    if (options.includeImages) {
      await convertImagesToBase64(clone);
    }
    
    function cleanNode(node) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        
        // Whitelist of clean formatting tags to preserve
        const allowedTags = [
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'ul', 'ol', 'li',
          'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img',
          'strong', 'b', 'em', 'i', 'span', 'br', 'blockquote', 'pre', 'code'
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
            if (options.preserveLinks) {
              node.setAttribute('href', makeAbsoluteURL(node.getAttribute('href')));
            } else {
              node.removeAttribute('href');
            }
          } else if (tag === 'img' && name === 'src') {
            if (options.includeImages) {
              // Note: src is already replaced with base64/absolute URL by convertImagesToBase64
            } else {
              node.remove();
            }
          } else if (tag === 'img' && name === 'alt') {
            // Keep alt attribute
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

  /**
   * Resolves relative URLs (links/images) to full absolute URLs
   */
  function makeAbsoluteURL(url) {
    if (!url) return '';
    try {
      return new URL(url, window.location.href).href;
    } catch (e) {
      return url;
    }
  }
})();
