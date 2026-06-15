// IntentTube Background Service Worker
// Manages CSP-exempt AI summarization requests and tracks daily usage limits

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SUMMARIZE_VIDEO') {
    handleSummarizeRequest(request.transcriptText, request.focusText, request.apiKey)
      .then(result => sendResponse({ success: true, text: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }
});

async function handleSummarizeRequest(transcriptText, focusText, apiKey) {
  // 1. Check daily limit if no personal API key is provided
  if (!apiKey) {
    const today = new Date().toISOString().slice(0, 10);
    const data = await chrome.storage.local.get({ dailySummaryCount: { date: '', count: 0 } });
    let { date, count } = data.dailySummaryCount;
    
    if (date !== today) {
      date = today;
      count = 0;
    }
    
    if (count >= 10) {
      throw new Error("You have reached your daily limit of 10 free summaries. Save a personal Gemini API Key in the settings (click the browser toolbar icon) for unlimited summaries!");
    }
    
    // Increment count
    await chrome.storage.local.set({ dailySummaryCount: { date, count: count + 1 } });
  }

  // 2. Route request: Gemini API (if key is set) vs DuckDuckGo AI Chat (free tier fallback)
  if (apiKey) {
    return await summarizeWithGemini(transcriptText, focusText, apiKey);
  } else {
    return await summarizeWithDuckDuckGo(transcriptText, focusText);
  }
}

async function summarizeWithGemini(transcriptText, focusText, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const prompt = `You are a study assistant analyzing a video transcript.
Deliver a highly detailed, concise, and structured summary.
Focus: ${focusText}
Use timestamps in the format [MM:SS] or [HH:MM:SS] next to major sections so the user can easily jump to those parts of the video.

Transcript:
${transcriptText}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }]
    })
  });
  
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `HTTP ${response.status} from Gemini API`);
  }

  const data = await response.json();
  if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
    return data.candidates[0].content.parts[0].text;
  }
  throw new Error("No summary returned in Gemini API response.");
}

async function summarizeWithDuckDuckGo(transcriptText, focusText) {
  const prompt = `You are a study assistant analyzing a video transcript.
Deliver a highly detailed, concise, and structured summary.
Focus: ${focusText}
Use timestamps in the format [MM:SS] or [HH:MM:SS] next to major sections so the user can easily jump to those parts of the video.

Transcript:
${transcriptText}`;

  // Step 1: Get VQD Token
  const statusRes = await fetch('https://duckduckgo.com/duckchat/v1/status', {
    headers: { 'x-vqd-accept': '1' }
  });
  if (!statusRes.ok) {
    throw new Error("Failed to initialize free-tier AI connection.");
  }
  const vqdToken = statusRes.headers.get('x-vqd-token') || (await statusRes.json()).vqd;

  // Step 2: Request Chat Completion
  const chatRes = await fetch('https://duckduckgo.com/duckchat/v1/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-vqd-4': vqdToken
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!chatRes.ok) {
    throw new Error("Free summarizer engine rate-limited. Please try again later or save a Gemini API Key.");
  }

  // Parse streamed text chunks
  const reader = chatRes.body.getReader();
  const decoder = new TextDecoder();
  let textResult = '';
  let done = false;

  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (value) {
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.message) {
              textResult += parsed.message;
            }
          } catch (e) {}
        }
      }
    }
  }

  if (!textResult) {
    throw new Error("Empty summary returned by free engine.");
  }

  return textResult;
}
