import { state, el, saveAppState } from './state.js';
import { getResponseError, showSuccessToast, showErrorToast } from './utils.js';
import { updateCreatePlaylistButtonState } from './renderer.js';
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
  alert(t('alert.serviceUnavailable'));
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
  return isAppleAuthorized || isSpotifyAuthorized;
}

export function updateConnectionUI() {
  // 1. Apple Music Status
  const isAppleAuthorized = !!(state.musicKit && state.musicKit.isAuthorized);
  const appleItem = document.querySelector('.service-menu-item[data-service="apple"]');
  
  if (appleItem) {
    if (isAppleAuthorized) {
      appleItem.classList.remove('offline');
      el.badgeStatusApple.textContent = t('service.status.connected');
      el.badgeStatusApple.setAttribute('data-i18n', 'service.status.connected');
      el.badgeStatusApple.className = "service-status-badge online";
      el.btnConnectAppleMenu.classList.add('hidden');
      el.btnDisconnectAppleAction.classList.remove('hidden');
      
      if (state.activeService === 'apple') {
        el.btnActivateApple.classList.add('hidden');
        appleItem.classList.add('active');
      } else {
        el.btnActivateApple.classList.remove('hidden');
        appleItem.classList.remove('active');
      }
    } else {
      appleItem.classList.add('offline');
      appleItem.classList.remove('active');
      el.badgeStatusApple.textContent = t('service.status.disconnected');
      el.badgeStatusApple.setAttribute('data-i18n', 'service.status.disconnected');
      el.badgeStatusApple.className = "service-status-badge offline";
      el.btnConnectAppleMenu.classList.remove('hidden');
      el.btnDisconnectAppleAction.classList.add('hidden');
      el.btnActivateApple.classList.add('hidden');
    }
  }

  // 2. Spotify Status
  const isSpotifyAuthorized = !!(state.spotifyAccessToken && state.spotifyExpiresAt && parseInt(state.spotifyExpiresAt, 10) > Date.now());
  const spotifyItem = document.querySelector('.service-menu-item[data-service="spotify"]');

  if (spotifyItem) {
    if (isSpotifyAuthorized) {
      spotifyItem.classList.remove('offline');
      el.badgeStatusSpotify.textContent = t('service.status.connected');
      el.badgeStatusSpotify.setAttribute('data-i18n', 'service.status.connected');
      el.badgeStatusSpotify.className = "service-status-badge online";
      el.btnConnectSpotifyMenu.classList.add('hidden');
      el.btnDisconnectSpotifyAction.classList.remove('hidden');
      
      if (state.activeService === 'spotify') {
        el.btnActivateSpotify.classList.add('hidden');
        spotifyItem.classList.add('active');
      } else {
        el.btnActivateSpotify.classList.remove('hidden');
        spotifyItem.classList.remove('active');
      }
    } else {
      spotifyItem.classList.add('offline');
      spotifyItem.classList.remove('active');
      el.badgeStatusSpotify.textContent = t('service.status.disconnected');
      el.badgeStatusSpotify.setAttribute('data-i18n', 'service.status.disconnected');
      el.badgeStatusSpotify.className = "service-status-badge offline";
      el.btnConnectSpotifyMenu.classList.remove('hidden');
      el.btnDisconnectSpotifyAction.classList.add('hidden');
      el.btnActivateSpotify.classList.add('hidden');
    }
  }

  // 3. Dropdown Header Trigger Label and Indicator
  const isAnyConnected = isAnyServiceConnected();
  const isServiceConnected = state.activeService === 'apple' ? isAppleAuthorized : isSpotifyAuthorized;
  
  let serviceKey, serviceIcon;
  if (!isAnyConnected) {
    serviceKey = 'service.none';
    serviceIcon = '';
  } else {
    serviceKey = state.activeService === 'apple' ? 'service.apple' : 'service.spotify';
    serviceIcon = state.activeService === 'apple' ? '🍏' : '🟢';
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
    alert(t('alert.musicKitUnavailable'));
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

export function handleDisconnectSpotify() {
  state.spotifyAccessToken = null;
  state.spotifyRefreshToken = null;
  state.spotifyExpiresAt = null;

  localStorage.removeItem('spotifyAccessToken');
  localStorage.removeItem('spotifyRefreshToken');
  localStorage.removeItem('spotifyExpiresAt');

  showSuccessToast(t('alert.spotifyDisconnected'));
  if (state.activeService === 'spotify') {
    handleSelectActive('apple');
  } else {
    updateConnectionUI();
  }
}

export function handleSelectActive(service) {
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
  saveAppState();

  updateConnectionUI();
  updateCreatePlaylistButtonState();
  
  const targetServiceLabel = service === 'apple' ? t('service.apple') : t('service.spotify');
  showSuccessToast(t('alert.serviceSwitched', { service: targetServiceLabel }));
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
