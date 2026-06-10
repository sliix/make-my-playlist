import { state, el, saveAppState } from './state.js';
import { getResponseError, showSuccessToast, showErrorToast, showCustomAlert } from './utils.js';
import { updateCreatePlaylistButtonState, renderTracksList, updateTracksCounter } from './renderer.js';
import { t } from './i18n.js';

// Helper to fetch session configuration with up to 3 retries (1 second apart)
export async function loadSessionConfigWithRetries(maxAttempts = 4, delayMs = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await fetchSessionConfig();
      return; // Succeeded!
    } catch (err) {
      console.warn(`Attempt ${attempt} to fetch developer token failed: ${err.message}`);
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  // All attempts failed
  showCustomAlert(t('alert.serviceUnavailable'));
}

// Fetch session configurations dynamically from secure Express backend
export async function fetchSessionConfig() {
  const response = await fetch('/api/session/config');
  if (!response.ok) {
    throw new Error(`Session configuration endpoint returned ${response.status}`);
  }
  const data = await response.json();
  if (data.developerToken) {
    await initMusicKit(data.developerToken);
    // Succeeded, token is dynamic and secure
  } else {
    throw new Error("No developer token in server response");
  }
}

// MusicKit SDK Core Wrapper
export async function initMusicKit(developerToken) {
  if (typeof MusicKit === 'undefined') {
    throw new Error("MusicKit JS is not loaded on this page.");
  }

  await MusicKit.configure({
    developerToken: developerToken,
    app: {
      name: 'MakeMyPlaylist',
      build: '1.0.0'
    }
  });

  state.musicKit = MusicKit.getInstance();

  // Wire up authorization status changes
  updateConnectionUI();
  state.musicKit.addEventListener(MusicKit.Events.authorizationStatusDidChange, () => {
    updateConnectionUI();
    updateCreatePlaylistButtonState();
  });
}

export function getAuthHeaders() {
  const headers = {
    'X-Service-Id': state.activeService
  };
  
  if (state.activeService === 'apple') {
    if (state.musicKit) {
      headers['X-User-Token'] = state.musicKit.musicUserToken || '';
    }
  } else if (state.activeService === 'spotify') {
    headers['X-User-Token'] = state.spotifyAccessToken || '';
  } else if (state.activeService === 'youtube' || state.activeService === 'youtube_music') {
    headers['X-User-Token'] = state.youtubeAccessToken || '';
  }
  
  return headers;
}

export async function checkAndRefreshSpotifyToken() {
  if (!state.spotifyAccessToken || !state.spotifyRefreshToken) return false;
  
  const expiresAt = parseInt(state.spotifyExpiresAt, 10);
  if (isNaN(expiresAt) || expiresAt - Date.now() < 5 * 60 * 1000) {
    try {
      console.log("Spotify access token expiring soon, refreshing...");
      const response = await fetch(`/api/spotify/refresh?refresh_token=${state.spotifyRefreshToken}`);
      if (!response.ok) {
        throw new Error(`Refresh request failed with status ${response.status}`);
      }
      const data = await response.json();
      state.spotifyAccessToken = data.access_token;
      state.spotifyExpiresAt = Date.now() + (data.expires_in * 1000);
      if (data.refresh_token) {
        state.spotifyRefreshToken = data.refresh_token;
      }
      localStorage.setItem('spotifyAccessToken', state.spotifyAccessToken);
      localStorage.setItem('spotifyRefreshToken', state.spotifyRefreshToken);
      localStorage.setItem('spotifyExpiresAt', state.spotifyExpiresAt);
      console.log("Spotify token refreshed successfully.");
      updateConnectionUI();
      return true;
    } catch (err) {
      console.error("Failed to refresh Spotify token:", err);
      handleDisconnectSpotify();
      return false;
    }
  }
  return true;
}

export function handleSpotifyCallback() {
  // Check for error in hash first
  const hash = window.location.hash || '';
  if (hash.startsWith('#spotify_error=')) {
    const params = new URLSearchParams(hash.substring(1));
    const error = params.get('spotify_error');
    showErrorToast(t('alert.spotifyAuthFailed', { error }));
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const accessToken = urlParams.get('spotify_access_token');
  const refreshToken = urlParams.get('spotify_refresh_token');
  const expiresIn = urlParams.get('spotify_expires_in');

  if (accessToken && refreshToken) {
    state.spotifyAccessToken = accessToken;
    state.spotifyRefreshToken = refreshToken;
    state.spotifyExpiresAt = Date.now() + (parseInt(expiresIn || '3600', 10) * 1000);

    localStorage.setItem('spotifyAccessToken', state.spotifyAccessToken);
    localStorage.setItem('spotifyRefreshToken', state.spotifyRefreshToken);
    localStorage.setItem('spotifyExpiresAt', state.spotifyExpiresAt);

    // Set Spotify as active service
    state.activeService = 'spotify';
    localStorage.setItem('activeService', 'spotify');

    // Clean URL
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);

    showSuccessToast(t('alert.spotifyConnected'));
  }
}

export function isAnyServiceConnected() {
  const isAppleAuthorized = !!(state.musicKit && state.musicKit.isAuthorized);
  const isSpotifyAuthorized = !!(state.spotifyAccessToken && state.spotifyExpiresAt && parseInt(state.spotifyExpiresAt, 10) > Date.now());
  const isYoutubeAuthorized = !!(state.youtubeAccessToken && state.youtubeExpiresAt && parseInt(state.youtubeExpiresAt, 10) > Date.now());
  return isAppleAuthorized || isSpotifyAuthorized || isYoutubeAuthorized;
}

export function updateConnectionUI() {
  // 1. Apple Music Status
  const isAppleAuthorized = !!(state.musicKit && state.musicKit.isAuthorized);
  const appleItem = document.querySelector('.service-menu-item[data-service="apple"]');
  
  if (appleItem) {
    if (isAppleAuthorized) {
      appleItem.classList.remove('offline');
      el.badgeStatusApple.className = "service-status-dot online";
      
      if (state.activeService === 'apple') {
        appleItem.classList.add('active');
      } else {
        appleItem.classList.remove('active');
      }
    } else {
      appleItem.classList.add('offline');
      appleItem.classList.remove('active');
      el.badgeStatusApple.className = "service-status-dot offline";
    }
  }

  // 2. Spotify Status
  const isSpotifyAuthorized = !!(state.spotifyAccessToken && state.spotifyExpiresAt && parseInt(state.spotifyExpiresAt, 10) > Date.now());
  const spotifyItem = document.querySelector('.service-menu-item[data-service="spotify"]');

  if (spotifyItem) {
    if (isSpotifyAuthorized) {
      spotifyItem.classList.remove('offline');
      el.badgeStatusSpotify.className = "service-status-dot online";
      
      if (state.activeService === 'spotify') {
        spotifyItem.classList.add('active');
      } else {
        spotifyItem.classList.remove('active');
      }
    } else {
      spotifyItem.classList.add('offline');
      spotifyItem.classList.remove('active');
      el.badgeStatusSpotify.className = "service-status-dot offline";
    }
  }

  // 3. YouTube & YouTube Music Status
  const isYoutubeAuthorized = !!(state.youtubeAccessToken && state.youtubeExpiresAt && parseInt(state.youtubeExpiresAt, 10) > Date.now());
  const youtubeItem = document.querySelector('.service-menu-item[data-service="youtube"]');
  const youtubeMusicItem = document.querySelector('.service-menu-item[data-service="youtube_music"]');

  if (youtubeItem) {
    if (isYoutubeAuthorized) {
      youtubeItem.classList.remove('offline');
      el.badgeStatusYoutube.className = "service-status-dot online";
      
      if (state.activeService === 'youtube') {
        youtubeItem.classList.add('active');
      } else {
        youtubeItem.classList.remove('active');
      }
    } else {
      youtubeItem.classList.add('offline');
      youtubeItem.classList.remove('active');
      el.badgeStatusYoutube.className = "service-status-dot offline";
    }
  }

  if (youtubeMusicItem) {
    if (isYoutubeAuthorized) {
      youtubeMusicItem.classList.remove('offline');
      el.badgeStatusYoutubeMusic.className = "service-status-dot online";
      
      if (state.activeService === 'youtube_music') {
        youtubeMusicItem.classList.add('active');
      } else {
        youtubeMusicItem.classList.remove('active');
      }
    } else {
      youtubeMusicItem.classList.add('offline');
      youtubeMusicItem.classList.remove('active');
      el.badgeStatusYoutubeMusic.className = "service-status-dot offline";
    }
  }

  // 4. Dropdown Header Trigger Label and Indicator
  const isAnyConnected = isAnyServiceConnected();
  const isServiceConnected = state.activeService === 'apple' ? isAppleAuthorized : 
                             state.activeService === 'spotify' ? isSpotifyAuthorized : 
                             isYoutubeAuthorized;
  
  let serviceKey, serviceIcon;
  if (!isAnyConnected) {
    serviceKey = 'service.none';
    serviceIcon = '';
  } else {
    if (state.activeService === 'apple') {
      serviceKey = 'service.apple';
      serviceIcon = '🍏';
    } else if (state.activeService === 'spotify') {
      serviceKey = 'service.spotify';
      serviceIcon = '🟢';
    } else if (state.activeService === 'youtube') {
      serviceKey = 'service.youtube';
      serviceIcon = '🔴';
    } else if (state.activeService === 'youtube_music') {
      serviceKey = 'service.youtube_music';
      serviceIcon = '🔴';
    }
  }

  if (el.activeServiceName) {
    el.activeServiceName.setAttribute('data-i18n', serviceKey);
    el.activeServiceName.textContent = t(serviceKey);
  }

  if (el.activeServiceIcon) {
    el.activeServiceIcon.textContent = serviceIcon;
    if (isAnyConnected) {
      el.activeServiceIcon.style.opacity = isServiceConnected ? "1" : "0.5";
      el.activeServiceIcon.style.filter = isServiceConnected ? "none" : "grayscale(1)";
    } else {
      el.activeServiceIcon.style.opacity = "0.5";
      el.activeServiceIcon.style.filter = "grayscale(1)";
    }
  }
}

export async function handleConnectAppleMusic() {
  if (!state.musicKit) {
    showCustomAlert(t('alert.musicKitUnavailable'));
    return;
  }
  try {
    // Refresh configurations right before auth popups to guarantee active JWT validity
    await refreshMusicKitConfiguration();
    await state.musicKit.authorize();
    showSuccessToast(t('alert.appleConnected'));
  } catch (err) {
    console.error("Authorization flow error:", err);
    showErrorToast(t('alert.appleAuthFailed'));
  }
}

export async function handleDisconnectAppleMusic() {
  if (!state.musicKit) return;
  try {
    await state.musicKit.unauthorize();
    showSuccessToast(t('alert.appleDisconnected'));
    if (state.activeService === 'apple') {
      handleSelectActive('spotify');
    } else {
      updateConnectionUI();
    }
  } catch (err) {
    console.error("Apple Music disconnect error:", err);
  }
}

export function handleConnectSpotify() {
  window.location.href = '/api/spotify/login';
}

export async function handleDisconnectSpotify() {
  state.spotifyAccessToken = null;
  state.spotifyRefreshToken = null;
  state.spotifyExpiresAt = null;

  localStorage.removeItem('spotifyAccessToken');
  localStorage.removeItem('spotifyRefreshToken');
  localStorage.removeItem('spotifyExpiresAt');

  showSuccessToast(t('alert.spotifyDisconnected'));
  if (state.activeService === 'spotify') {
    await handleSelectActive('apple');
  } else {
    updateConnectionUI();
  }
}

export async function checkAndRefreshYoutubeToken() {
  if (!state.youtubeAccessToken || !state.youtubeRefreshToken) return false;
  
  const expiresAt = parseInt(state.youtubeExpiresAt, 10);
  if (isNaN(expiresAt) || expiresAt - Date.now() < 5 * 60 * 1000) {
    try {
      console.log("YouTube access token expiring soon, refreshing...");
      const response = await fetch(`/api/youtube/refresh?refresh_token=${state.youtubeRefreshToken}`);
      if (!response.ok) {
        throw new Error(`Refresh request failed with status ${response.status}`);
      }
      const data = await response.json();
      state.youtubeAccessToken = data.access_token;
      state.youtubeExpiresAt = Date.now() + (data.expires_in * 1000);
      
      localStorage.setItem('youtubeAccessToken', state.youtubeAccessToken);
      localStorage.setItem('youtubeExpiresAt', state.youtubeExpiresAt);
      console.log("YouTube token refreshed successfully.");
      updateConnectionUI();
      return true;
    } catch (err) {
      console.error("Failed to refresh YouTube token:", err);
      handleDisconnectYoutube();
      return false;
    }
  }
  return true;
}

export function handleYoutubeCallback() {
  const hash = window.location.hash || '';
  if (!hash.startsWith('#youtube_access_token=') && !hash.startsWith('#youtube_error=')) return;
  
  const params = new URLSearchParams(hash.substring(1));
  const accessToken = params.get('youtube_access_token');
  const refreshToken = params.get('youtube_refresh_token');
  const expiresIn = params.get('youtube_expires_in');
  const error = params.get('youtube_error');

  if (error) {
    showErrorToast(t('alert.youtubeAuthFailed', { error }));
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    return;
  }

  if (accessToken) {
    state.youtubeAccessToken = accessToken;
    if (refreshToken) {
      state.youtubeRefreshToken = refreshToken;
      localStorage.setItem('youtubeRefreshToken', state.youtubeRefreshToken);
    }
    state.youtubeExpiresAt = Date.now() + (parseInt(expiresIn || '3600', 10) * 1000);

    localStorage.setItem('youtubeAccessToken', state.youtubeAccessToken);
    localStorage.setItem('youtubeExpiresAt', state.youtubeExpiresAt);

    // Set YouTube as active service
    state.activeService = 'youtube';
    localStorage.setItem('activeService', 'youtube');

    // Clean URL
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);

    showSuccessToast(t('alert.youtubeConnected'));
    updateConnectionUI();
  }
}

export function handleConnectYoutube() {
  window.location.href = '/api/youtube/login';
}

export async function handleDisconnectYoutube() {
  state.youtubeAccessToken = null;
  state.youtubeRefreshToken = null;
  state.youtubeExpiresAt = null;

  localStorage.removeItem('youtubeAccessToken');
  localStorage.removeItem('youtubeRefreshToken');
  localStorage.removeItem('youtubeExpiresAt');

  showSuccessToast(t('alert.youtubeDisconnected'));
  if (state.activeService === 'youtube' || state.activeService === 'youtube_music') {
    await handleSelectActive('apple');
  } else {
    updateConnectionUI();
  }
}

export async function handleSelectActive(service) {
  const oldService = state.activeService;

  // Save current tracks to old service cache
  if (!state.serviceTracks) {
    state.serviceTracks = { apple: [], spotify: [], youtube: [], youtube_music: [] };
  }
  state.serviceTracks[oldService] = [...state.tracks];
  localStorage.setItem('makemyplaylist_service_tracks', JSON.stringify(state.serviceTracks));

  // Change active service
  state.activeService = service;
  localStorage.setItem('activeService', service);

  // Clear fetched/loaded playlist selection options
  el.playlistSelectGroup.classList.add('hidden');
  el.selectLibraryPlaylists.innerHTML = '<option value="" disabled selected>Choose a playlist...</option>';
  el.btnLoadPlaylist.setAttribute('disabled', 'disabled');
  state.loadedPlaylistId = null;
  state.loadedPlaylistName = null;
  state.loadedPlaylistDesc = null;
  state.loadedPlaylistOriginalTrackIds = [];

  const targetServiceLabel = service === 'apple' ? t('service.apple') : 
                             service === 'spotify' ? t('service.spotify') : 
                             service === 'youtube' ? t('service.youtube') : 
                             t('service.youtube_music');

  const cachedTracks = state.serviceTracks[service] || [];
  const oldTracks = state.serviceTracks[oldService] || [];

  if (cachedTracks.length > 0) {
    state.tracks = [...cachedTracks];
    renderTracksList();
    updateTracksCounter();
    saveAppState();
    updateConnectionUI();
    updateCreatePlaylistButtonState();
    showSuccessToast(t('alert.serviceSwitched', { service: targetServiceLabel }));
  } else if (oldTracks.length > 0) {
    // Regenerate track list by searching on the new service
    el.resultsEmptyState.classList.add('hidden');
    el.tracksList.classList.add('hidden');
    el.searchProgressCard.classList.remove('hidden');
    el.btnApproveAll.disabled = true;

    el.progressStatusText.textContent = t("card.input.btnSearchSearching");
    el.progressPercentage.textContent = "0%";
    el.progressBarFill.style.width = "0%";

    const newTracks = [];
    try {
      for (let i = 0; i < oldTracks.length; i++) {
        const track = oldTracks[i];
        const artist = track.attributes?.artistName || 'Unknown Artist';
        const name = track.attributes?.name || 'Unknown Track';

        // Update progress status message
        el.progressStatusText.textContent = t('alert.resolvingTracksProgress', {
          current: i + 1,
          total: oldTracks.length,
          service: targetServiceLabel
        });

        const pct = Math.floor(((i + 1) / oldTracks.length) * 100);
        el.progressPercentage.textContent = `${pct}%`;
        el.progressBarFill.style.width = `${pct}%`;

        // Search for track on the new service catalog
        const queryTerm = `${artist} - ${name}`;
        const searchResults = await searchCatalogProxy(queryTerm, 1, 'songs');

        if (searchResults && searchResults.length > 0) {
          newTracks.push(searchResults[0]);
        }
      }

      state.tracks = newTracks;
      state.serviceTracks[service] = [...newTracks];
      localStorage.setItem('makemyplaylist_service_tracks', JSON.stringify(state.serviceTracks));

      renderTracksList();
      updateTracksCounter();
      saveAppState();
      updateConnectionUI();
      updateCreatePlaylistButtonState();

      showSuccessToast(t('alert.serviceSwitched', { service: targetServiceLabel }));
    } catch (err) {
      console.error("Failed to resolve tracks on new service:", err);
      showErrorToast(t('alert.resolvingTracksFailed'));
      state.tracks = [];
      renderTracksList();
      updateTracksCounter();
      saveAppState();
      updateConnectionUI();
      updateCreatePlaylistButtonState();
    } finally {
      el.searchProgressCard.classList.add('hidden');
      el.tracksList.classList.remove('hidden');
      el.btnApproveAll.disabled = false;
    }
  } else {
    // Both caches empty, clear current track list
    state.tracks = [];
    renderTracksList();
    updateTracksCounter();
    saveAppState();
    updateConnectionUI();
    updateCreatePlaylistButtonState();
    showSuccessToast(t('alert.serviceSwitched', { service: targetServiceLabel }));
  }
}

// Re-configure/refresh configuration dynamically to prevent JWT expirations
export async function refreshMusicKitConfiguration() {
  // Try to load backend session config
  try {
    const response = await fetch('/api/session/config');
    if (response.ok) {
      const data = await response.json();
      if (data.developerToken) {
        await initMusicKit(data.developerToken);
      }
    }
  } catch (err) {
    console.warn("Could not refresh token configuration:", err);
  }
}

// Query the backend Express search proxy (token stays hidden)
export async function searchCatalogProxy(query, limit = 5, types = 'songs') {
  if (state.activeService === 'spotify') {
    await checkAndRefreshSpotifyToken();
  } else if (state.activeService === 'youtube' || state.activeService === 'youtube_music') {
    await checkAndRefreshYoutubeToken();
  }
  const storefront = (state.musicKit && state.musicKit.storefrontId) || 'us';
  const url = `/api/search?term=${encodeURIComponent(query)}&storefront=${storefront}&limit=${limit}&types=${types}`;

  // Fetch via backend proxy
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  if (!response.ok) {
    const errMsg = await getResponseError(response);
    throw new Error(errMsg);
  }
  const data = await response.json();
  if (data.results) {
    if (types === 'songs' && data.results.songs) {
      return data.results.songs.data || [];
    } else if (types === 'playlists' && data.results.playlists) {
      return data.results.playlists.data || [];
    } else if (types === 'albums' && data.results.albums) {
      return data.results.albums.data || [];
    }
  }
  return [];
}

export async function fetchCatalogPlaylistTracks(playlistId) {
  if (state.activeService === 'spotify') {
    await checkAndRefreshSpotifyToken();
  } else if (state.activeService === 'youtube' || state.activeService === 'youtube_music') {
    await checkAndRefreshYoutubeToken();
  }
  const storefront = (state.musicKit && state.musicKit.storefrontId) || 'us';
  const url = `/api/catalog/playlists/${playlistId}/tracks?storefront=${storefront}`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  if (!response.ok) {
    const errMsg = await getResponseError(response);
    throw new Error(errMsg);
  }
  const data = await response.json();
  return data.data || [];
}

export async function fetchCatalogAlbumTracks(albumId) {
  if (state.activeService === 'spotify') {
    await checkAndRefreshSpotifyToken();
  } else if (state.activeService === 'youtube' || state.activeService === 'youtube_music') {
    await checkAndRefreshYoutubeToken();
  }
  const storefront = (state.musicKit && state.musicKit.storefrontId) || 'us';
  const url = `/api/catalog/albums/${albumId}/tracks?storefront=${storefront}`;
  const response = await fetch(url, {
    headers: getAuthHeaders()
  });
  if (!response.ok) {
    const errMsg = await getResponseError(response);
    throw new Error(errMsg);
  }
  const data = await response.json();
  return data.data || [];
}
