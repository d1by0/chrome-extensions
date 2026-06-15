# IntentTube

IntentTube is a premium, distraction-free YouTube Chrome extension designed to shift your relationship with video content from passive binging to intentional learning. It hides recommendation feeds, collapses layout distractions, lets you take timestamped notes, and keeps your screen time in check with a gentle focus timer.

---

## Version & Changelog
- **Current Version**: 1.4.0 (Advanced Focus Upgrades: Summaries, Speech, Canvas, & Analytics)

### Release History

#### v1.4.0 (Current) - Advanced Focus Upgrades
- **AI Video Summarization & Custom Focus**: Extracts caption transcripts directly from YouTube, parsing the content client-side to generate summaries using Chrome's built-in `window.ai` or fallback **Gemini API**. Supports custom formats (Detailed, Timeline & Milestones, Actionable, or Custom Prompts) with interactive timestamps that seek the video player on click.
- **Screenshot / Frame Capture**: Renders the active video frame to canvas, compressing it to low-res WebP data URIs, which save to `unlimitedStorage` and display inline inside notes.
- **Voice Typing / Speech-to-Text**: Added hands-free note dictation using Chrome's native Web Speech API (`webkitSpeechRecognition`).
- **Distraction Analytics Dashboard**: Added navigation tabs to the popup to reveal a glassmorphic dashboard tracking daily Focus Time, Bypassed Recommendation Feeds, and Notes Logged, illustrated by a weekly focus canvas-drawn bar chart.

#### v1.3.2 - Spelling API Autocorrect & Multi-line Titles
- **API spelling Autocorrect**: Replaced the static, limited spell map check with a live query to the public **Datamuse API** (`api.datamuse.com/words?sp=...`) to dynamically check and correct spelling mistakes/typos for full English words and vocabulary on spacebar press.
- **Wrapped Video Titles**: Updated the sidebar's current video link styling to wrap across multiple lines rather than using `text-overflow: ellipsis`, allowing the user to view the full title.

#### v1.3.1 - Ad-Aware Timer Checks, Anti-Overlap, & Sidebar Video URLs
- **Improved Ad-Aware Timer**: Refined Zen Focus Timer checks by querying the player container's `playing-mode` and checking for active ad-player overlays, ensuring it does not run before the video starts or during ads.
- **Badge Positioning**: Positioned the player timer badge to `right: 110px` to avoid overlapping with YouTube's native top-right info card button.
- **Sidebar Video URLs**: Added clear, clickable video URLs inside both the Study Notes sidebar header and the Study Block Summary container so the user understands exactly where their notes map.

#### v1.3.0 - Ad Pause, Overlay Anti-Overlap, & Popup Video References

#### v1.2.0 - Spell Correction, Interactive Timer, & Draggable Notes
- **Draggable Notes Toggle**: Allows users to drag and position the floating pencil note button anywhere on the screen.
- **English Autocorrect**: Automatically corrects common English spelling mistakes (e.g. `teh` -> `the`, `recieve` -> `receive`) inside the notes textarea upon hitting space.
- **Interactive Zen Timer**: Adds click controls to the timer badge (`+5m` and `-5m` adjustment triggers) to modify duration directly from the video player.
- **Intelligent Timestamping**: Captures note timestamps the exact moment writing *starts* rather than when hitting enter.
- **Dynamic Summary Block**: Automatically generates a bulleted study summary card detailing highlights and note counts inside the sidebar.
- **Dynamic Trending Badges**: Automatically decorates the top 2 popular autocomplete suggestions returned directly from YouTube's API with a fire vector icon, ensuring suggestions are fully real and matching.

#### v1.1.0 - Smart Suggestions & Clean Refactor
- **Smart Autocomplete**: Intercepts YouTube's autocomplete search queries and injects focus-driven suggestions (e.g. cinematography, coding, design) when matching intent keywords are typed.
- **Master Toggle**: Added a global "Enable IntentTube" switch inside the popup header, restoring YouTube to its native state instantly when toggled off.
- **Emoji-Free Vector UI**: Replaced all emojis in the content script with inline SVGs (Search, Timer, Pencil, Bulb) to bypass CSP issues, and linked Boxicons in the popup.
- **Performance Optimization**: Swapped out heavy DOM MutationObservers for a passive interval loop to prevent page freezing and layout recursion loops.
- **PNG Icon Generation**: Created properly formatted PNG assets (`icon16.png`, `icon48.png`, `icon128.png`) from the high-res AVIF logo to fix Chrome Extension bar loading.

#### v1.0.0 - Core Focus Engine
- **Intent Gate**: Hides the home recommendation feed behind a centered search input.
- **Clean Theater Mode**: Collapses related video columns and comments, centering the player workspace.
- **Study Notes**: Adds a collapsible sidebar drawer capturing timestamped notes with click-to-seek support.
- **Zen Timer**: Integrates a focus countdown badge that pauses playback and blurs the screen when time expires.

---

## Why I Built This

I’ve always been someone who binges YouTube. Whenever something is on my mind or I need to figure out how to build something, I immediately go to YouTube creators I admire. But lately, the experience has been frustrating - especially when the very first thing I see on a video is an annoying ad.

Initially, I thought about just coding another adblocker or installing a simple unhook extension. But as I sat on the idea, I realized the real problem goes way beyond ads. The actual enemy is the distraction engine itself: the home page recommendation feed, the related sidebar thumbnails, the infinite Shorts loop, and the endless comments section designed specifically to keep us scrolling.

Instead of fighting Google's ad-engine, I wanted to build something that restores intentionality. IntentTube is built to work alongside Fix Paste (which purifies web pages). With Fix Paste for reading and IntentTube for watching, they form a cohesive stack to protect your attention online.

---

## What IntentTube Can Do

### 1. The Intent Gate (Anti-Binge Barrier)
- **Mindful Landing Page**: When you open YouTube, the entire home page feed is completely hidden behind a clean, dark-mode overlay.
- **Search-First Flow**: Rather than clicking on bait thumbnails, you are greeted with a single centered prompt: *"What are you here to watch or learn?"*
- **Direct Redirection**: Submitting your query immediately searches YouTube, bypassing the home feed so you only see search results related to your goal.

### 2. Clean Theater Mode
- **Layout Purifier**: Automatically collapses secondary sidebars, related videos, comments section, and live chats on watch pages so you can focus entirely on the video.
- **Shorts Blocker**: Automatically hides Shorts tabs from the navigation sidebars and search shelves to prevent quick dopamine loops.
- **Centered Player View**: Automatically centers the video player on watch pages when recommendations are hidden, giving you a clean viewing workspace.

### 3. Timestamped Study Notes
- **Collapsible Notes Panel**: Adds an integrated, slide-out notes drawer directly inside the YouTube interface.
- **Auto-Timestamping**: Type notes as you watch; pressing `Enter` instantly saves the note pinned to the exact second in the video (e.g., `[04:15]`).
- **Interactive Click-to-Seek**: Clicking any note's timestamp instantly jumps the YouTube player to that specific point in the video.
- **Markdown Export**: Export your session notes as a clean Markdown (`.md`) file, complete with title headers and clickable timestamp links.

### 4. Zen Timer
- **Countdown Indicator**: Displays a subtle, unobtrusive focus timer in the top-right corner of the video player.
- **Mindful Break Prompt**: When your configured focus limit (e.g., 15m, 30m, 45m) ends, the extension automatically pauses the video, blurs the player, and shows a full-screen break screen prompting you to step away.
- **Session Resume**: Click "Resume Session" to reset the timer and continue your study block.

### 5. Advanced Inputs (Voice & Canvas Screenshots)
- **Voice Typing Dictation**: Dictate notes hands-free using Chrome's native Web Speech API (`webkitSpeechRecognition`).
- **Video Screenshot Capture**: Draw the active video player element onto canvas and compress it to lightweight WebP data URIs. Stored in `unlimitedStorage` and previewed inline.

### 6. AI Video Summarization & Focus Options
- **Dynamic Transcript Fetching**: Automatically parses and fetches caption track XMLs directly from YouTube.
- **Custom-Prompt Summary**: Generate a timeline, takeaways, detailed guide, or use a custom prompt via built-in local AI or Google Gemini API.
- **Interactive Timestamps**: Click generated timestamps within the summary text to seek the video player to that exact frame.

### 7. Distraction Analytics Dashboard
- **Glassmorphic Popup Tab**: Switches between settings toggles and a custom stats grid tracking study time, prevented binge loops, and notes counts.
- **Weekly Focus Canvas Chart**: Renders a beautiful daily bar chart using pure HTML5 canvas gradients.

---

## Installation
1. Open Google Chrome and go to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click the **Load unpacked** button.
4. Select the `intent-tube` directory from your local workspace.

---

## Technical Architecture
- **manifest.json**: Manifest V3 configuration setting permissions for `storage`, host matching for YouTube, and declaring the AVIF logo as a web-accessible resource.
- **content.js**: Injected content script executing SPA-safe page checkers, the Intent Gate search overlay, HTML5 video controls for the Zen Timer, and note-saving routines.
- **content.css**: Stylesheet containing overlays, theater-mode hide classes, floating note toggles, and the glassmorphic sidebar layout.
- **popup.html / css / js**: Modern popup dashboard styled with a neon-accented dark theme, facilitating setting toggles, custom time inputs, and note previews.

---

## Credits & Acknowledgements
- Autocomplete search hints utilize Google Suggest query completions.
- Spelling correction and English vocabulary autocorrect is powered by the [Datamuse API](https://www.datamuse.com/api/).
- Toolbar vector icons provided by [Boxicons](https://boxicons.com/).
