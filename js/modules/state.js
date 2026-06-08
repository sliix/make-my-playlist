import { updateInputAutoDetection } from './parser.js';
import { renderTracksList, updateCreatePlaylistButtonState, updateMobileViewUI } from './renderer.js';

// Application State
export const state = {
  tracks: [], // list of track state objects
  musicKit: null,
  isSearching: false,

  playingTrackId: null,      // track ID currently playing preview
  playingAudio: null,        // Audio object currently playing

  loadedPlaylistId: null,             // ID of loaded library playlist if any
  loadedPlaylistName: null,           // Name of loaded library playlist if any
  loadedPlaylistDesc: null,           // Description of loaded library playlist if any
  loadedPlaylistOriginalTrackIds: [], // array of track IDs currently in the loaded playlist
  detectedMode: 'list',               // auto-detected mode ('list' or 'natural')
  isModeOverridden: false,            // whether the user manually locked the mode

  activeService: localStorage.getItem('activeService') || 'apple',
  spotifyAccessToken: localStorage.getItem('spotifyAccessToken') || null,
  spotifyRefreshToken: localStorage.getItem('spotifyRefreshToken') || null,
  spotifyExpiresAt: localStorage.getItem('spotifyExpiresAt') || null,
  youtubeAccessToken: localStorage.getItem('youtubeAccessToken') || null,
  youtubeRefreshToken: localStorage.getItem('youtubeRefreshToken') || null,
  youtubeExpiresAt: localStorage.getItem('youtubeExpiresAt') || null,
  mobileView: 'setup', // active view on phone ('setup' or 'tracks')
};

// UI Elements Cache
export const el = {
  btnReset: document.getElementById('btn-reset'),
  btnMenuToggle: document.getElementById('btn-menu-toggle'),
  headerActions: document.getElementById('header-actions'),
  activeServiceIcon: document.getElementById('active-service-icon'),

  btnGoToTracks: document.getElementById('btn-go-to-tracks'),
  btnGoToTracksText: document.getElementById('btn-go-to-tracks-text'),
  btnBackToSetup: document.getElementById('btn-back-to-setup'),

  inputSongList: document.getElementById('input-song-list'),
  cardInputSongs: document.getElementById('card-input-songs'),
  detectionStatusContainer: document.getElementById('detection-status-container'),
  detectionBadge: document.getElementById('detection-badge'),
  detectionExplanation: document.getElementById('detection-explanation'),
  btnOverrideMode: document.getElementById('btn-override-mode'),
  chkAppendMode: document.getElementById('chk-append-mode'),
  appendModeContainer: document.getElementById('append-mode-container'),
  playlistName: document.getElementById('playlist-name'),
  playlistDesc: document.getElementById('playlist-desc'),
  playlistPublic: document.getElementById('playlist-public'),
  btnAnalyze: document.getElementById('btn-analyze'),
  btnAnalyzeText: document.getElementById('btn-analyze-text'),
  spinnerAnalyze: document.getElementById('spinner-analyze'),

  btnApproveAll: document.getElementById('btn-approve-all'),
  resultsEmptyState: document.getElementById('results-empty-state'),
  searchProgressCard: document.getElementById('search-progress-card'),
  progressStatusText: document.getElementById('progress-status-text'),
  progressPercentage: document.getElementById('progress-percentage'),
  progressBarFill: document.getElementById('progress-bar-fill'),
  tracksList: document.getElementById('tracks-list'),
  tracksCounter: document.getElementById('tracks-counter'),

  btnCreatePlaylist: document.getElementById('btn-create-playlist'),
  btnCreateText: document.getElementById('btn-create-text'),
  spinnerCreate: document.getElementById('spinner-create'),

  // Services Dropdown UI
  btnServicesDropdown: document.getElementById('btn-services-dropdown'),
  menuServicesDropdown: document.getElementById('menu-services-dropdown'),
  activeServiceName: document.getElementById('active-service-name'),
  badgeStatusApple: document.getElementById('badge-status-apple'),
  badgeStatusSpotify: document.getElementById('badge-status-spotify'),
  badgeStatusYoutube: document.getElementById('badge-status-youtube'),
  badgeStatusYoutubeMusic: document.getElementById('badge-status-youtube-music'),
  btnActivateApple: document.getElementById('btn-activate-apple'),
  btnActivateSpotify: document.getElementById('btn-activate-spotify'),
  btnActivateYoutube: document.getElementById('btn-activate-youtube'),
  btnActivateYoutubeMusic: document.getElementById('btn-activate-youtube-music'),
  btnConnectAppleMenu: document.getElementById('btn-connect-apple-menu'),
  btnConnectSpotifyMenu: document.getElementById('btn-connect-spotify-menu'),
  btnConnectYoutubeMenu: document.getElementById('btn-connect-youtube-menu'),
  btnConnectYoutubeMusicMenu: document.getElementById('btn-connect-youtube-music-menu'),
  btnDisconnectAppleAction: document.getElementById('btn-disconnect-apple-action'),
  btnDisconnectSpotifyAction: document.getElementById('btn-disconnect-spotify-action'),
  btnDisconnectYoutubeAction: document.getElementById('btn-disconnect-youtube-action'),
  btnDisconnectYoutubeMusicAction: document.getElementById('btn-disconnect-youtube-music-action'),

  // Library Playlist Import Elements
  btnFetchPlaylists: document.getElementById('btn-fetch-playlists'),
  btnLoadPlaylist: document.getElementById('btn-load-playlist'),
  selectLibraryPlaylists: document.getElementById('select-library-playlists'),
  playlistSelectGroup: document.getElementById('playlist-select-group'),
  spinnerFetch: document.getElementById('spinner-fetch'),
  spinnerLoad: document.getElementById('spinner-load'),
  btnFetchText: document.getElementById('btn-fetch-text'),
  btnLoadText: document.getElementById('btn-load-text'),

  // Export options modal elements
  modalExportOptions: document.getElementById('modal-export-options'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  btnModalUpdate: document.getElementById('btn-modal-update'),
  btnModalCreateNew: document.getElementById('btn-modal-create-new'),
  modalPlaylistName: document.getElementById('modal-playlist-name'),
  modalInputPlaylistName: document.getElementById('modal-input-playlist-name'),
  btnSaveNameModal: document.getElementById('btn-save-name-modal'),
  btnCancelNameModal: document.getElementById('btn-cancel-name-modal'),
  btnCloseNameModal: document.getElementById('btn-close-name-modal'),

  // Service connection modal elements
  modalConnectService: document.getElementById('modal-connect-service'),
  btnConnectAppleModal: document.getElementById('btn-connect-apple-modal'),
  btnConnectSpotifyModal: document.getElementById('btn-connect-spotify-modal'),
  btnConnectYoutubeModal: document.getElementById('btn-connect-youtube-modal'),
  btnCloseConnectModal: document.getElementById('btn-close-connect-modal'),

  // YouTube Video Preview modal
  modalYoutubePreview: document.getElementById('modal-youtube-preview'),
  iframeYoutubePreview: document.getElementById('iframe-youtube-preview'),
  btnCloseYoutubePreview: document.getElementById('btn-close-youtube-preview'),

  // Custom Alert Modal
  modalCustomAlert: document.getElementById('modal-custom-alert'),
  btnCloseAlertModal: document.getElementById('btn-close-alert-modal'),
  btnCustomAlertOk: document.getElementById('btn-custom-alert-ok'),
  btnCustomAlertCancel: document.getElementById('btn-custom-alert-cancel'),
  customAlertTitle: document.getElementById('custom-alert-title'),
  customAlertMessage: document.getElementById('custom-alert-message'),

  // Language switcher elements
  btnLangToggle: document.getElementById('btn-lang-toggle'),
  menuLangDropdown: document.getElementById('menu-lang-dropdown'),
  currentLangFlag: document.getElementById('current-lang-flag'),
};

// Local Storage Session Persistence Helpers
export function saveAppState() {
  localStorage.setItem('makemyplaylist_raw_input', el.inputSongList.value);
  localStorage.setItem('makemyplaylist_detected_mode', state.detectedMode || 'list');
  localStorage.setItem('makemyplaylist_is_mode_overridden', state.isModeOverridden ? 'true' : 'false');
  localStorage.setItem('makemyplaylist_append_mode', el.chkAppendMode.checked ? 'true' : 'false');

  const details = {
    name: el.playlistName.value,
    description: el.playlistDesc.value,
    isPublic: el.playlistPublic.checked,
  };
  localStorage.setItem('makemyplaylist_details', JSON.stringify(details));
  localStorage.setItem('makemyplaylist_tracks', JSON.stringify(state.tracks));
  localStorage.setItem('makemyplaylist_loaded_playlist_id', state.loadedPlaylistId || '');
  localStorage.setItem('makemyplaylist_loaded_playlist_name', state.loadedPlaylistName || '');
  localStorage.setItem('makemyplaylist_loaded_playlist_desc', state.loadedPlaylistDesc || '');
  localStorage.setItem('makemyplaylist_loaded_playlist_original_track_ids', JSON.stringify(state.loadedPlaylistOriginalTrackIds || []));
  localStorage.setItem('youtubeAccessToken', state.youtubeAccessToken || '');
  localStorage.setItem('youtubeRefreshToken', state.youtubeRefreshToken || '');
  localStorage.setItem('youtubeExpiresAt', state.youtubeExpiresAt || '');

  updateCreatePlaylistButtonState();
}

export function restoreAppState() {
  try {
    const rawInput = localStorage.getItem('makemyplaylist_raw_input');
    if (rawInput !== null) {
      el.inputSongList.value = rawInput;
    }

    const detailsStr = localStorage.getItem('makemyplaylist_details');
    if (detailsStr) {
      const details = JSON.parse(detailsStr);
      el.playlistName.value = details.name || "My Awesome Playlist";
      el.playlistDesc.value = details.description || "";
      el.playlistPublic.checked = details.isPublic === true;
    }

    state.detectedMode = localStorage.getItem('makemyplaylist_detected_mode') || 'list';
    state.isModeOverridden = localStorage.getItem('makemyplaylist_is_mode_overridden') === 'true';
    updateInputAutoDetection();

    const appendMode = localStorage.getItem('makemyplaylist_append_mode');
    if (appendMode !== null) {
      el.chkAppendMode.checked = appendMode === 'true';
    }

    state.loadedPlaylistId = localStorage.getItem('makemyplaylist_loaded_playlist_id') || null;
    state.loadedPlaylistName = localStorage.getItem('makemyplaylist_loaded_playlist_name') || null;
    state.loadedPlaylistDesc = localStorage.getItem('makemyplaylist_loaded_playlist_desc') || null;
    const originalTrackIdsStr = localStorage.getItem('makemyplaylist_loaded_playlist_original_track_ids');
    if (originalTrackIdsStr) {
      state.loadedPlaylistOriginalTrackIds = JSON.parse(originalTrackIdsStr);
    } else {
      state.loadedPlaylistOriginalTrackIds = [];
    }

    state.mobileView = 'setup';
    const tracksStr = localStorage.getItem('makemyplaylist_tracks');
    if (tracksStr) {
      const tracks = JSON.parse(tracksStr);
      if (tracks && tracks.length > 0) {
        state.tracks = tracks;
        state.mobileView = 'tracks';
        el.resultsEmptyState.classList.add('hidden');
        el.tracksList.classList.remove('hidden');
        el.btnApproveAll.removeAttribute('disabled');
        renderTracksList();
        updateCreatePlaylistButtonState();
      }
    }
    updateMobileViewUI();
  } catch (e) {
    console.error("Error restoring app state:", e);
  }
}
