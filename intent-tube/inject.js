(() => {
  let response = null;
  try {
    const player = document.getElementById('movie_player');
    if (player && typeof player.getPlayerResponse === 'function') {
      response = player.getPlayerResponse();
    }
  } catch (e) {
    console.warn("[IntentTube] Error getting player response via element:", e);
  }
  
  if (!response) {
    response = window.ytInitialPlayerResponse;
  }
  
  window.postMessage({ type: 'YT_PLAYER_RESPONSE', data: response }, '*');
})();
