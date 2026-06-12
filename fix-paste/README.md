# Fix Paste

Fix Paste is a lightweight Chrome extension that parses webpages, extracts core content (removing navigation bars, sidebars, comments, and advertisements), and converts it into structured formats.

## Version
- **Current Version**: 1.1.0 (Table Support & Context Menu Update)

## Features
- **Smart DOM Heuristics**: Automatically scores parent elements based on text density, child node tags, and class/id keyword attributes to locate the core content element.
- **Table Parsing**: Intelligently extracts HTML tables and formats them into clean GFM (GitHub Flavored Markdown) tables, aligned plain-text layouts, or structured JSON.
- **Right-Click Context Menu**: Allows copying formatted page content instantly via a right-click browser menu action without opening the popup interface.
- **Feedback Overlay**: Displays floating toast feedback overlays directly on the active webpage indicating successful extractions.
- **Structural Formats**: Converts DOM elements to clean Markdown, formatted Plain Text, or structured JSON blocks.
- **Configurable Filters**: Offers simple options to toggle the inclusion of images and link preservation during extraction.
- **Offline & Private**: Functions entirely within the browser sandbox without communicating with remote servers or tracking user data.

## Installation
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable "Developer mode" via the top-right toggle switch.
3. Click "Load unpacked" in the top-left menu.
4. Select the `fix-paste` directory from this repository.

## Technical Architecture
- **manifest.json**: Manifest V3 configuration defining active tab scoping and scripting execution.
- **content.js**: Executes only when triggered by the popup, querying target nodes, applying cleaners, and returning a structured output.
- **popup.html / css / js**: Implements a sleek dark-themed interface built using the Outfit font family, HSL design tokens, and CSS animations.
