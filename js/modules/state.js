import { updateInputAutoDetection } from './parser.js';
import { renderTracksList, updateCreatePlaylistButtonState } from './renderer.js';

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
};

// UI Elements Cache
export const el = {
  btnReset: document.getElementById('btn-reset'),
  btnMenuToggle: document.getElementById('btn-menu-toggle'),
  headerActions: document.getElementById('header-actions'),
  activeServiceIcon: document.getElementById('active-service-icon'),

  inputSongList: document.getElementById('input-song-list'),
  cardInputSongs: document.getElementById('card-input-songs'),
  detectionStatusContainer: document.getElementById('detection-status-container'),
  detectionBadge: document.getElementById('detection-badge'),
  detectionExplanation: document.getElementById('detection-explanation'),
  btnOverrideMode: document.getElementById('btn-override-mode'),
  chkAppendMode: document.getElementById('chk-append-mode'),
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
  btnActivateApple: document.getElementById('btn-activate-apple'),
  btnActivateSpotify: document.getElementById('btn-activate-spotify'),
  btnConnectAppleMenu: document.getElementById('btn-connect-apple-menu'),
  btnConnectSpotifyMenu: document.getElementById('btn-connect-spotify-menu'),
  btnDisconnectAppleAction: document.getElementById('btn-disconnect-apple-action'),
  btnDisconnectSpotifyAction: document.getElementById('btn-disconnect-spotify-action'),

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

    const tracksStr = localStorage.getItem('makemyplaylist_tracks');
    if (tracksStr) {
      const tracks = JSON.parse(tracksStr);
      if (tracks && tracks.length > 0) {
        state.tracks = tracks;
        el.resultsEmptyState.classList.add('hidden');
        el.tracksList.classList.remove('hidden');
        el.btnApproveAll.removeAttribute('disabled');
        if (el.cardInputSongs) {
          el.cardInputSongs.classList.add('collapsed');
        }
        renderTracksList();
        updateCreatePlaylistButtonState();
      }
    }
  } catch (e) {
    console.error("Error restoring app state:", e);
  }
}
