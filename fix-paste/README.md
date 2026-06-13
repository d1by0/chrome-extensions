# Fix Paste

Fix Paste is a premium, lightweight Chrome extension designed to extract, clean, and format webpage content. It strips away noisy page elements like ads, menus, sidebars, and comments, yielding clean Markdown, Plain Text, semantic HTML, or JSON.

---

## Version
- **Current Version**: 1.2.0 (Premium Light Theme, History Panel, & Element Picker)

---

## Why I Built This

I got tired of the outdated, clunky methods of copy-pasting text from the web. Whenever I tried to copy a simple article or documentation snippet, I’d end up with annoying unstructured content, headers mixed in with text, ads popping up, or - worse - tables completely losing their formatting. Getting misplaced values, messed-up columns, and broken grids every time you paste something into your editor or notes is a massive flow-killer.

On top of that, many websites go out of their way to disable right-click context menus, selections, or drag-and-drop events just to stop you from copying their text. 

I wanted a way to grab *exactly* what I need - whether it's raw text, a clean Markdown table, or a specific element - with high fidelity and zero clutter. Fix Paste was born to bypass those limitations and purify content instantly.

---

## What Fix Paste Can Do

### 1. High-Fidelity Content Purification
- **Smart DOM Heuristics**: Automatically scans and scores webpage containers based on text density, tags (like `<p>` counts), link density, and class/id attributes to extract only the core article or page body.
- **Table Parsing**: Translates raw HTML tables and flexible div-based grids into clean GFM (GitHub Flavored Markdown) tables, aligned plain-text grids, or structured JSON.
- **Copy/Paste Bypass**: Automatically circumvents restrictive website blocks (such as disabled right-click context menus, copy events, select events, or drag events) so you can capture text on any webpage.

### 2. Premium Light Theme & Clean UI
- **Modern Minimal Design**: Replaced bulky toggle cards with a unified, clean segmented panel styled in a gorgeous Cobalt Blue (`#0035FE`) and slate grey light theme.
- **Boxicons Integration**: Swapped out emojis for crisp, professional icon sets across all buttons and tabs.
- **Geist Typeface**: Integrated Vercel's clean **Geist** font-family across the popup dashboard and generated PDF print documents.

### 3. Interactive Element Picker
- **Precision Targeting**: Allows you to click **"Select Element"** to hover over page elements, highlighting them with a dashed blue outline. Click to extract and format *only* that selected container (bypassing auto-heuristics entirely). ESC cancels selection.

### 4. Clipboard History (Temporary Saver)
- **Persistent Local Snippets**: Automatically saves clippings to `chrome.storage.local`.
- **Configurable Expiry Alarm**: Set clippings to auto-expire after 15 minutes, 30 minutes, 1 hour, 1 day, or keep them for "Session Only" (automatically cleared when the browser restarts).
- **Search & Filter**: Find saved clips instantly using the history search bar.
- **Quick Re-Copy**: Re-copy history cards in Plain Text, Markdown, or HTML, or download them directly as markdown files.

### 5. Multi-Tab Batch Scraper
- **Combine Scrapes**: Query all open tabs in your current browser window, select which tabs you want to extract, and compile their text contents sequentially into a single consolidated Markdown (`.md`) file.

### 6. Performance & PDF Optimization
- **Parallel Image Resizing**: Fetches and converts page images to Base64 in parallel using `Promise.all` and scales down high-resolution graphics to a max boundary of 800px (with JPEG 0.7 compression) to save memory.
- **Load Safety Timeout**: Features a 1.5-second fallback timeout inside `print.js` to ensure PDF generators never get stuck loading broken external assets. Includes a clean fade-out loading screen overlay.

---

## Installation
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** via the toggle switch in the top-right corner.
3. Click **Load unpacked** in the top-left menu.
4. Select the `fix-paste` directory.

---

## Technical Architecture
- **manifest.json**: Manifest V3 config incorporating alarms, tabs, and commands permission scopes.
- **background.js**: Service worker managing background history purges, startup session cleans, context menus, and keyboard hotkeys (`Alt+Shift+C`).
- **content.js**: Injected DOM scraper hosting clean cleaners, table parsers, custom image compressors, right-click bypasses, and the interactive element picker.
- **popup.html / css / js**: Unified tab controller for format selection, settings management, search filters, and batch processing.
- **print.html / css / js**: PDF document preview window supporting custom load states and rendering.

---

## Credits & Acknowledgements
- PDF generation is powered by the [html2pdf.js](https://github.com/eKoopmans/html2pdf.js) library.
- User analytics tracked via [Mixpanel](https://mixpanel.com/).
- Interface typography uses the [Geist](https://vercel.com/font) typeface family from Vercel.
- Vector icons provided by [Boxicons](https://boxicons.com/).
