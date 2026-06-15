// IntentTube Background Service Worker
// Manages CSP-exempt AI summarization requests and tracks daily limits on unique videos

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'SUMMARIZE_VIDEO') {
    handleSummarizeRequest(request.transcriptText, request.focusText, request.videoId)
      .then(result => sendResponse({ success: true, text: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }
  if (request.type === 'RESTRUCTURE_TEXT') {
    handleRestructureRequest(request.text)
      .then(result => sendResponse({ success: true, text: result }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep channel open for async response
  }
});

async function handleRestructureRequest(text) {
  const prompt = `Clean up and restructure this voice transcription. 
Remove verbal self-corrections, fillers (like 'um', 'ah'), repetitions, and false starts. 
Keep it concise and clear. Preserve the original meaning and tone.
Example: "i love what she said... no no i only like what she said" -> "I only like what she said."
Example: "we need to build this... wait actually let's build that" -> "We need to build that."

Text: "${text}"
Output ONLY the clean, polished final text. Do not include quotes, explanations, or commentary.`;

  return queryDuckDuckGoChat(prompt);
}

async function handleSummarizeRequest(transcriptText, focusText, videoId) {
  const today = new Date().toISOString().slice(0, 10);
  const data = await chrome.storage.local.get({ summaryQuota: { date: '', list: [] } });
  let { date, list } = data.summaryQuota;

  if (date !== today) {
    date = today;
    list = [];
  }

  // Check if we already summarized this video today
  const alreadySummarized = list.includes(videoId);

  if (!alreadySummarized && list.length >= 10) {
    throw new Error("You have reached your daily limit of 10 free summaries today.");
  }

  const prompt = `You are a study assistant analyzing a video transcript.
Deliver a highly detailed, concise, and structured summary.
Focus: ${focusText}
Use timestamps in the format [MM:SS] or [HH:MM:SS] next to major sections so the user can easily jump to those parts of the video.

Transcript:
${transcriptText}`;

  // Attempt summarization
  const result = await queryDuckDuckGoChat(prompt);

  // If successful and not already summarized, add to the daily list
  if (result && !alreadySummarized && videoId) {
    list.push(videoId);
    await chrome.storage.local.set({ summaryQuota: { date, list } });
  }

  return result;
}

async function queryDuckDuckGoChat(prompt) {
  // Try Meta Llama 3 first, then GPT-4o-mini as fallback
  const models = ['meta-llama/Llama-3-70b-instruct', 'gpt-4o-mini'];
  let lastError = null;

  for (const model of models) {
    try {
      // Step 1: Get VQD Token
      const statusRes = await fetch('https://duckduckgo.com/duckchat/v1/status', {
        headers: { 
          'x-vqd-accept': '1',
          'Origin': 'https://duckduckgo.com',
          'Referer': 'https://duckduckgo.com/'
        }
      });
      if (!statusRes.ok) continue;
      
      const vqdToken = statusRes.headers.get('x-vqd-4');
      if (!vqdToken) continue;

      // Generate a random 7-character string for x-vqd-hash-1 instead of getting it from response headers
      const letters = "abcdefghijklmnopqrstuvwxyz";
      const randomHash = Array.from({ length: 7 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');

      // Step 2: Request Chat Completion
      const chatRes = await fetch('https://duckduckgo.com/duckchat/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-vqd-4': vqdToken,
          'x-vqd-hash-1': randomHash,
          'Origin': 'https://duckduckgo.com',
          'Referer': 'https://duckduckgo.com/'
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!chatRes.ok) continue;

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

      if (textResult) {
        return textResult;
      }
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(lastError ? lastError.message : "Free AI helper is temporarily busy. Please try again in a moment.");
}
