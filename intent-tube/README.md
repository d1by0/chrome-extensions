# IntentTube

IntentTube is a premium, distraction-free YouTube Chrome extension designed to shift your relationship with video content from passive binging to intentional learning. It hides recommendation feeds, collapses layout distractions, lets you take timestamped notes, and keeps your screen time in check with a gentle focus timer.

---

## Version
- **Current Version**: 1.0.0 (Core Focus Engine)

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
