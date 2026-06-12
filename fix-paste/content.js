/**
 * Fix Paste - Content Extraction Engine (Content Script)
 * 
 * Implements heuristic-based DOM parsing to identify, extract, and clean
 * the main content area of a webpage, converting it to structured outputs.
 */

(function () {
  // Listen for extraction messages from the extension popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extract') {
      try {
        const options = request.options || {};
        const extractedData = extractContent(options);
        sendResponse({ success: true, data: extractedData });
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
          // If parent is body or a raw container, represent as text
          const parentTag = node.parentNode.tagName;
          if (['DIV', 'SECTION', 'ARTICLE', 'BODY'].includes(parentTag)) {
            blocks.push({ type: 'paragraph', text });
          }
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;

      const tag = node.tagName.toLowerCase();

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
   * Formats blocks into a clean Markdown document
   */
  function convertToMarkdown(blocks, options) {
    let markdown = '';
    
    // Add page meta header
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
})();
