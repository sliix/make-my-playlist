// Application State
const state = {
  tracks: [], // list of track state objects
  musicKit: null,
  isSearching: false,

  playingTrackId: null,      // track ID currently playing preview
  playingAudio: null,        // Audio object currently playing

  loadedPlaylistId: null,             // ID of loaded library playlist if any
  loadedPlaylistName: null,           // Name of loaded library playlist if any
  loadedPlaylistDesc: null,           // Description of loaded library playlist if any
  loadedPlaylistOriginalTrackIds: [], // array of track IDs currently in the loaded playlist
};

// UI Elements Cache
const el = {
  btnReset: document.getElementById('btn-reset'),
  btnMenuToggle: document.getElementById('btn-menu-toggle'),
  headerActions: document.getElementById('header-actions'),

  inputSongList: document.getElementById('input-song-list'),
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

  connectionIndicator: document.getElementById('connection-indicator'),
  connectionText: document.getElementById('connection-text'),
  btnConnectApple: document.getElementById('btn-connect-apple'),
  btnCreatePlaylist: document.getElementById('btn-create-playlist'),
  btnCreateText: document.getElementById('btn-create-text'),
  spinnerCreate: document.getElementById('spinner-create'),

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
};

// Helper to fetch session configuration with up to 3 retries (1 second apart)
async function loadSessionConfigWithRetries(maxAttempts = 4, delayMs = 1000) {
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
  alert("The service is not available right now. Please try refreshing the page or try again later.");
}

// Initialize Application
window.addEventListener('DOMContentLoaded', async () => {
  initEventListeners();

  // Register Service Worker for PWA installability
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered successfully:', reg.scope))
      .catch(err => console.warn('Service Worker registration failed:', err));
  }

  // Try to load dynamic session config from backend with retries
  await loadSessionConfigWithRetries(4, 1000);

  // Restore persisted state from local storage
  restoreAppState();
});

// Event Listeners Registration
function initEventListeners() {
  // Reset handler
  el.btnReset.addEventListener('click', handleResetApp);

  // Action listeners
  el.btnAnalyze.addEventListener('click', handleAnalyzeSongList);
  el.btnApproveAll.addEventListener('click', handleApproveAll);
  el.btnConnectApple.addEventListener('click', handleConnectAppleMusic);
  el.btnCreatePlaylist.addEventListener('click', handleCreatePlaylist);

  // Library Playlist Import listeners
  el.btnFetchPlaylists.addEventListener('click', handleFetchLibraryPlaylists);
  el.btnLoadPlaylist.addEventListener('click', handleLoadSelectedPlaylist);
  el.selectLibraryPlaylists.addEventListener('change', () => {
    if (el.selectLibraryPlaylists.value) {
      el.btnLoadPlaylist.removeAttribute('disabled');
    } else {
      el.btnLoadPlaylist.setAttribute('disabled', 'disabled');
    }
  });

  // Mobile Hamburger Toggle
  el.btnMenuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    el.headerActions.classList.toggle('open');
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (el.headerActions.classList.contains('open') &&
      !el.headerActions.contains(e.target) &&
      e.target !== el.btnMenuToggle &&
      !el.btnMenuToggle.contains(e.target)) {
      el.headerActions.classList.remove('open');
    }
  });

  // Persist input values as they type
  el.inputSongList.addEventListener('input', saveAppState);
  el.playlistName.addEventListener('input', saveAppState);
  el.playlistDesc.addEventListener('input', saveAppState);
  el.playlistPublic.addEventListener('change', saveAppState);

  // Export Options Modal listeners
  if (el.btnCloseModal) {
    el.btnCloseModal.addEventListener('click', () => el.modalExportOptions.close());
  }
  if (el.modalExportOptions) {
    el.modalExportOptions.addEventListener('click', (e) => {
      if (e.target === el.modalExportOptions) {
        el.modalExportOptions.close();
      }
    });
  }
  if (el.btnModalCreateNew) {
    el.btnModalCreateNew.addEventListener('click', () => {
      el.modalExportOptions.close();
      executeCreatePlaylist();
    });
  }
  if (el.btnModalUpdate) {
    el.btnModalUpdate.addEventListener('click', () => {
      el.modalExportOptions.close();
      handleUpdatePlaylist();
    });
  }

  // Initialize Drag & Drop events
  initDragAndDrop();
}

// Fetch session configurations dynamically from secure Express backend
async function fetchSessionConfig() {
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
async function initMusicKit(developerToken) {
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

function updateConnectionUI() {
  if (!state.musicKit) return;

  if (state.musicKit.isAuthorized) {
    el.connectionIndicator.className = 'status-indicator online';
    el.connectionText.textContent = "Apple Music: Connected";
    el.btnConnectApple.textContent = "Disconnect Apple Music";
  } else {
    el.connectionIndicator.className = 'status-indicator offline';
    el.connectionText.textContent = "Apple Music: Not Connected";
    el.btnConnectApple.textContent = "Connect Apple Music";
  }
}

// Re-configure/refresh configuration dynamically to prevent JWT expirations
async function refreshMusicKitConfiguration() {

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

async function handleConnectAppleMusic() {
  if (!state.musicKit) {
    alert("Apple Music is not configured or unavailable. Please refresh the page.");
    return;
  }

  try {
    if (state.musicKit.isAuthorized) {
      await state.musicKit.unauthorize();
      showSuccessToast("Disconnected from Apple Music.");
    } else {
      // Refresh configurations right before auth popups to guarantee active JWT validity
      await refreshMusicKitConfiguration();
      await state.musicKit.authorize();
      showSuccessToast("Connected to Apple Music successfully!");
    }
  } catch (err) {
    console.error("Authorization flow error:", err);
    showErrorToast("Could not authorize Apple Music account.");
  }
}

// Parsing & Analyze Actions
function handleAnalyzeSongList() {
  if (!state.musicKit) {
    alert("Apple Music is not configured or unavailable. Please refresh the page.");
    return;
  }

  // Stop active playing audio before re-analyzing
  if (state.playingAudio) {
    state.playingAudio.pause();
    state.playingAudio = null;
    state.playingTrackId = null;
  }

  const rawText = el.inputSongList.value;
  if (!rawText.trim()) {
    alert("Please paste or write a list of songs first.");
    return;
  }

  // Parse lines
  const lines = rawText.split('\n');
  const newTracks = [];
  const currentTracks = [...state.tracks];
  let nextId = Math.max(0, ...state.tracks.map(t => t.id)) + 1;

  for (const line of lines) {
    const cleanedQuery = parseSongLine(line);
    if (cleanedQuery) {
      // Find an existing track that matches this line (by originalQuery or searchQuery)
      const existingIndex = currentTracks.findIndex(t => 
        t.originalQuery.toLowerCase() === line.trim().toLowerCase() || 
        t.searchQuery.toLowerCase() === cleanedQuery.toLowerCase()
      );

      if (existingIndex !== -1) {
        // Reuse this track (preserves selections, custom matches, and checkbox approved status)
        const reusedTrack = currentTracks.splice(existingIndex, 1)[0];
        newTracks.push(reusedTrack);
      } else {
        // Create a new pending track
        newTracks.push({
          id: nextId++,
          originalQuery: line.trim(),
          searchQuery: cleanedQuery,
          status: 'pending',
          results: [],
          selectedIndex: 0,
          approved: true,
          errorMessage: ''
        });
      }
    }
  }

  if (newTracks.length === 0) {
    alert("No valid songs found in the input list.");
    return;
  }

  state.tracks = newTracks;

  // Find tracks that actually need searching
  const pendingTracks = state.tracks.filter(t => t.status === 'pending');

  if (pendingTracks.length === 0) {
    // No new tracks to search! Just re-render the list and save
    renderTracksList();
    updateCreatePlaylistButtonState();
    saveAppState();
    showSuccessToast("Track list updated (no new searches needed).");
    return;
  }

  // Update UI Elements to show searching status
  el.resultsEmptyState.classList.add('hidden');
  el.tracksList.classList.add('hidden');
  el.searchProgressCard.classList.remove('hidden');
  el.btnApproveAll.disabled = true;

  // Set load button to active loading state
  el.btnAnalyze.disabled = true;
  el.spinnerAnalyze.classList.remove('hidden');
  el.btnAnalyzeText.textContent = "Searching Catalog...";

  // Start parallel query execution with throttling for pending tracks only
  executeCatalogSearches(pendingTracks);
}

function parseSongLine(line) {
  let cleaned = line.trim();
  if (!cleaned) return null;

  // Strips list item markers at the beginning
  cleaned = cleaned.replace(/^(\d+[\.\-\)]\s*|\[\d+\]\s*|[\u2022\*\-]\s*)/, '');
  cleaned = cleaned.trim();

  // Replace multiple spaces with a single space
  cleaned = cleaned.replace(/\s+/g, ' ');

  return cleaned;
}

// Query the backend Express search proxy (token stays hidden)
async function searchCatalogProxy(query) {
  const storefront = (state.musicKit && state.musicKit.storefrontId) || 'us';
  const url = `/api/search?term=${encodeURIComponent(query)}&storefront=${storefront}`;

  // Fetch via backend proxy
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Proxy search endpoint returned HTTP status ${response.status}`);
  }
  const data = await response.json();
  if (data.results && data.results.songs) {
    return data.results.songs.data;
  }
  return [];
}

// Execute searches using a simple concurrent worker queue
async function executeCatalogSearches(pendingTracks) {
  const maxConcurrency = 5;
  const total = pendingTracks.length;
  let completed = 0;

  // Function to update progress bar status
  const updateProgress = () => {
    const pct = Math.floor((completed / total) * 100);
    el.progressStatusText.textContent = `Searching Apple Music Catalog (${completed}/${total})...`;
    el.progressPercentage.textContent = `${pct}%`;
    el.progressBarFill.style.width = `${pct}%`;
  };

  updateProgress();

  // Worker task queue runner
  const pool = Array.from({ length: Math.min(maxConcurrency, total) }, async (_, i) => {
    let index = i;
    while (index < total) {
      const track = pendingTracks[index];
      track.status = 'searching';

      try {
        const results = await searchCatalogProxy(track.searchQuery);
        track.results = results;
        if (results.length > 0) {
          track.status = 'matched';
          track.selectedIndex = 0;
          track.approved = true; // Auto approved default
        } else {
          track.status = 'no-match';
          track.approved = false;
        }
      } catch (err) {
        track.status = 'error';
        track.approved = false;
        track.errorMessage = err.message || 'Search failed';
      }

      completed++;
      updateProgress();
      index += maxConcurrency;
    }
  });

  await Promise.all(pool);

  // Complete search and draw UI list
  el.searchProgressCard.classList.add('hidden');
  el.tracksList.classList.remove('hidden');

  el.btnAnalyze.disabled = false;
  el.spinnerAnalyze.classList.add('hidden');
  el.btnAnalyzeText.textContent = "Analyze & Search Catalog";
  el.btnApproveAll.disabled = false;

  renderTracksList();
  updateCreatePlaylistButtonState();
  saveAppState();
}

// UI Rendering for track cards
function renderTracksList() {
  el.tracksList.innerHTML = '';

  state.tracks.forEach((track, index) => {
    const card = document.createElement('div');
    card.className = `track-card ${track.approved ? 'approved' : ''} ${track.status === 'no-match' ? 'no-match' : ''}`;
    card.id = `track-card-${track.id}`;

    // Artwork calculations
    let activeSong = null;
    let artworkHtml = `<div class="track-artwork-fallback">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px;">
        <path d="M9 18V5l12-2v13"></path>
        <circle cx="6" cy="18" r="3"></circle>
        <circle cx="18" cy="16" r="3"></circle>
      </svg>
    </div>`;

    let previewUrl = '';
    if (track.status === 'matched' && track.results.length > 0) {
      activeSong = track.results[track.selectedIndex];
      if (activeSong && activeSong.attributes && activeSong.attributes.artwork) {
        const artUrl = activeSong.attributes.artwork.url
          .replace('{w}', '120')
          .replace('{h}', '120');
        artworkHtml = `<img class="track-artwork" src="${artUrl}" alt="${activeSong.attributes.name} Artwork">`;
      }
      if (activeSong && activeSong.attributes && activeSong.attributes.previews && activeSong.attributes.previews[0]) {
        previewUrl = activeSong.attributes.previews[0].url;
      }
    }

    // Core Layout variables
    const title = activeSong ? activeSong.attributes.name : 'No Match Found';
    const artist = activeSong ? activeSong.attributes.artistName : 'Try refining your search';
    const album = activeSong ? activeSong.attributes.albumName : '';
    const duration = activeSong ? formatDuration(activeSong.attributes.durationInMillis) : '';
    const isExplicit = activeSong && activeSong.attributes.contentRating === 'explicit';
    const isFirst = index === 0;
    const isLast = index === state.tracks.length - 1;

    // HTML Card Body
    card.innerHTML = `
      <div class="track-main-info">
        <div class="track-drag-handle" title="Drag to reorder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="5" r="1"></circle>
            <circle cx="15" cy="5" r="1"></circle>
            <circle cx="9" cy="12" r="1"></circle>
            <circle cx="15" cy="12" r="1"></circle>
            <circle cx="9" cy="19" r="1"></circle>
            <circle cx="15" cy="19" r="1"></circle>
          </svg>
        </div>

        <label class="track-status-check" aria-label="Approve Song">
          <input type="checkbox" class="track-checkbox" data-id="${track.id}" ${track.approved ? 'checked' : ''} ${track.status === 'no-match' ? 'disabled' : ''}>
          <span class="checkbox-custom">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
        </label>
        
        <div class="track-query-indicator">#${index + 1}</div>
        
        <div class="track-artwork-container ${previewUrl ? 'has-preview' : ''}" id="artwork-container-${track.id}">
          ${artworkHtml}
          ${previewUrl ? `
          <button class="btn-play-preview" data-id="${track.id}" data-url="${previewUrl}" aria-label="Play Preview">
            <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21"></polygon>
            </svg>
            <svg class="pause-icon hidden" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16"></rect>
              <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
          </button>
          ` : ''}
        </div>
        
        <div class="track-meta">
          <div class="track-title-row">
            <span class="track-title" title="${title}">${title}</span>
            ${isExplicit ? '<span class="track-explicit-badge">Explicit</span>' : ''}
          </div>
          <div class="track-artist" title="${artist}">${artist}</div>
          ${album ? `<div class="track-album" title="${album}">${album}</div>` : ''}
          <div class="track-original-query">
            <span>Query: "${track.originalQuery}"</span>
          </div>
        </div>
        
        <div class="track-right-controls">
          ${duration ? `
          <div class="track-details-badge">
            <span>${duration}</span>
          </div>
          ` : ''}
          <div class="track-reorder-buttons">
            <button class="btn-reorder btn-reorder-up" data-id="${track.id}" title="Move Up" ${isFirst ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            </button>
            <button class="btn-reorder btn-reorder-down" data-id="${track.id}" title="Move Down" ${isLast ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      <!-- Sub controls: dropdown selector & refinement search box -->
      <div class="track-controls">
        <div class="control-group">
          <label>Version / Match Options</label>
          <div class="select-wrapper">
            <select class="select-alternatives" data-id="${track.id}" ${track.results.length <= 1 ? 'disabled' : ''}>
              ${track.results.length > 0
        ? track.results.map((song, index) => {
          const label = `${song.attributes.name} - ${song.attributes.artistName} (${formatDuration(song.attributes.durationInMillis)})`;
          return `<option value="${index}" ${index === track.selectedIndex ? 'selected' : ''}>${label}</option>`;
        }).join('')
        : '<option>No options available</option>'
      }
            </select>
          </div>
        </div>
        
        <div class="control-group">
          <label>Refine Search</label>
          <div class="input-refine-group">
            <input type="text" class="input-refine" data-id="${track.id}" value="${track.searchQuery}" placeholder="Artist Song Title">
            <button class="btn btn-secondary btn-refine" data-id="${track.id}">Re-query</button>
          </div>
        </div>
      </div>
    `;

    el.tracksList.appendChild(card);
  });

  // Bind dynamic interactive elements inside cards
  bindTrackCardListeners();
}

function bindTrackCardListeners() {
  // 1. Approval Checkbox Toggle
  el.tracksList.querySelectorAll('.track-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const trackId = parseInt(e.target.dataset.id);
      const track = state.tracks.find(t => t.id === trackId);
      if (track) {
        track.approved = e.target.checked;
        const card = document.getElementById(`track-card-${trackId}`);
        if (track.approved) {
          card.classList.add('approved');
        } else {
          card.classList.remove('approved');
        }
        updateCreatePlaylistButtonState();
        saveAppState();
      }
    });
  });

  // 2. Selection Alternate Version Change
  el.tracksList.querySelectorAll('.select-alternatives').forEach(select => {
    select.addEventListener('change', (e) => {
      const trackId = parseInt(e.target.dataset.id);
      const track = state.tracks.find(t => t.id === trackId);
      if (track) {
        track.selectedIndex = parseInt(e.target.value);
        updateSingleTrackCard(track);
        saveAppState();
      }
    });
  });

  // 3. Single Song Search Refinement
  el.tracksList.querySelectorAll('.btn-refine').forEach(button => {
    button.addEventListener('click', async (e) => {
      const trackId = parseInt(e.target.dataset.id);
      const track = state.tracks.find(t => t.id === trackId);
      const input = el.tracksList.querySelector(`.input-refine[data-id="${trackId}"]`);

      if (track && input) {
        const newQuery = input.value.trim();
        if (!newQuery) return;

        button.disabled = true;
        button.textContent = "...";
        track.searchQuery = newQuery;

        try {
          const results = await searchCatalogProxy(newQuery);
          track.results = results;
          if (results.length > 0) {
            track.status = 'matched';
            track.selectedIndex = 0;
            track.approved = true;
          } else {
            track.status = 'no-match';
            track.approved = false;
          }
        } catch (err) {
          track.status = 'error';
          track.approved = false;
          track.errorMessage = err.message || 'Query failed';
        }

        updateSingleTrackCard(track);
        updateCreatePlaylistButtonState();
        saveAppState();
      }
    });
  });

  // 4. Play Preview Button Handler
  el.tracksList.querySelectorAll('.btn-play-preview').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target.closest('.btn-play-preview');
      const trackId = parseInt(btn.dataset.id);
      const url = btn.dataset.url;
      playPreview(trackId, url);
    });
  });

  // 5. Up/Down Reorder Buttons click
  el.tracksList.querySelectorAll('.btn-reorder-up').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const trackId = parseInt(btn.dataset.id);
      moveTrack(trackId, -1);
    });
  });

  el.tracksList.querySelectorAll('.btn-reorder-down').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const trackId = parseInt(btn.dataset.id);
      moveTrack(trackId, 1);
    });
  });

  // 6. Drag and Drop event listeners on cards
  el.tracksList.querySelectorAll('.track-card').forEach(card => {
    bindDragAndDropListeners(card);
  });
}

// Local card rerender logic for seamless transitions
function updateSingleTrackCard(track) {
  const card = document.getElementById(`track-card-${track.id}`);
  if (!card) return;

  card.className = `track-card ${track.approved ? 'approved' : ''} ${track.status === 'no-match' ? 'no-match' : ''}`;

  let activeSong = null;
  let artworkHtml = `<div class="track-artwork-fallback">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 24px; height: 24px;">
      <path d="M9 18V5l12-2v13"></path>
      <circle cx="6" cy="18" r="3"></circle>
      <circle cx="18" cy="16" r="3"></circle>
    </svg>
  </div>`;

  let previewUrl = '';
  if (track.status === 'matched' && track.results.length > 0) {
    activeSong = track.results[track.selectedIndex];
    if (activeSong && activeSong.attributes && activeSong.attributes.artwork) {
      const artUrl = activeSong.attributes.artwork.url
        .replace('{w}', '120')
        .replace('{h}', '120');
      artworkHtml = `<img class="track-artwork" src="${artUrl}" alt="${activeSong.attributes.name} Artwork">`;
    }
    if (activeSong && activeSong.attributes && activeSong.attributes.previews && activeSong.attributes.previews[0]) {
      previewUrl = activeSong.attributes.previews[0].url;
    }
  }

  const title = activeSong ? activeSong.attributes.name : 'No Match Found';
  const artist = activeSong ? activeSong.attributes.artistName : 'Try refining your search';
  const album = activeSong ? activeSong.attributes.albumName : '';
  const duration = activeSong ? formatDuration(activeSong.attributes.durationInMillis) : '';
  const isExplicit = activeSong && activeSong.attributes.contentRating === 'explicit';
  const index = state.tracks.findIndex(t => t.id === track.id);
  const isFirst = index === 0;
  const isLast = index === state.tracks.length - 1;

  const mainInfo = card.querySelector('.track-main-info');
  mainInfo.innerHTML = `
    <div class="track-drag-handle" title="Drag to reorder">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="9" cy="5" r="1"></circle>
        <circle cx="15" cy="5" r="1"></circle>
        <circle cx="9" cy="12" r="1"></circle>
        <circle cx="15" cy="12" r="1"></circle>
        <circle cx="9" cy="19" r="1"></circle>
        <circle cx="15" cy="19" r="1"></circle>
      </svg>
    </div>

    <label class="track-status-check" aria-label="Approve Song">
      <input type="checkbox" class="track-checkbox" data-id="${track.id}" ${track.approved ? 'checked' : ''} ${track.status === 'no-match' ? 'disabled' : ''}>
      <span class="checkbox-custom">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </span>
    </label>
    
    <div class="track-query-indicator">#${index + 1}</div>
    
    <div class="track-artwork-container ${previewUrl ? 'has-preview' : ''}" id="artwork-container-${track.id}">
      ${artworkHtml}
      ${previewUrl ? `
      <button class="btn-play-preview" data-id="${track.id}" data-url="${previewUrl}" aria-label="Play Preview">
        <svg class="play-icon" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21"></polygon>
        </svg>
        <svg class="pause-icon hidden" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16"></rect>
          <rect x="14" y="4" width="4" height="16"></rect>
        </svg>
      </button>
      ` : ''}
    </div>
    
    <div class="track-meta">
      <div class="track-title-row">
        <span class="track-title" title="${title}">${title}</span>
        ${isExplicit ? '<span class="track-explicit-badge">Explicit</span>' : ''}
      </div>
      <div class="track-artist" title="${artist}">${artist}</div>
      ${album ? `<div class="track-album" title="${album}">${album}</div>` : ''}
      <div class="track-original-query">
        <span>Query: "${track.originalQuery}"</span>
      </div>
    </div>
    
    <div class="track-right-controls">
      ${duration ? `
      <div class="track-details-badge">
        <span>${duration}</span>
      </div>
      ` : ''}
      <div class="track-reorder-buttons">
        <button class="btn-reorder btn-reorder-up" data-id="${track.id}" title="Move Up" ${isFirst ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
        <button class="btn-reorder btn-reorder-down" data-id="${track.id}" title="Move Down" ${isLast ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>
    </div>
  `;

  const select = card.querySelector('.select-alternatives');
  select.innerHTML = track.results.length > 0
    ? track.results.map((song, index) => {
      const label = `${song.attributes.name} - ${song.attributes.artistName} (${formatDuration(song.attributes.durationInMillis)})`;
      return `<option value="${index}" ${index === track.selectedIndex ? 'selected' : ''}>${label}</option>`;
    }).join('')
    : '<option>No options available</option>';

  if (track.results.length <= 1) {
    select.setAttribute('disabled', 'disabled');
  } else {
    select.removeAttribute('disabled');
  }

  const button = card.querySelector('.btn-refine');
  button.disabled = false;
  button.textContent = "Re-query";

  // Re-bind listeners on this single card
  const checkbox = card.querySelector('.track-checkbox');
  checkbox.addEventListener('change', (e) => {
    track.approved = e.target.checked;
    if (track.approved) {
      card.classList.add('approved');
    } else {
      card.classList.remove('approved');
    }
    updateCreatePlaylistButtonState();
    saveAppState();
  });

  select.addEventListener('change', (e) => {
    track.selectedIndex = parseInt(e.target.value);
    updateSingleTrackCard(track);
    saveAppState();
  });

  const playBtn = card.querySelector('.btn-play-preview');
  if (playBtn) {
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target.closest('.btn-play-preview');
      const trackId = parseInt(btn.dataset.id);
      const url = btn.dataset.url;
      playPreview(trackId, url);
    });
  }

  // Re-bind up/down reorder buttons click
  const upBtn = card.querySelector('.btn-reorder-up');
  if (upBtn) {
    upBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveTrack(track.id, -1);
    });
  }

  const downBtn = card.querySelector('.btn-reorder-down');
  if (downBtn) {
    downBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveTrack(track.id, 1);
    });
  }

  // Re-bind drag and drop on this card
  bindDragAndDropListeners(card);

  // Update play button state for this card
  updateAllPlayButtonUI();
}

function handleApproveAll() {
  const matchTracks = state.tracks.filter(t => t.status === 'matched');
  const allApproved = matchTracks.every(t => t.approved);

  matchTracks.forEach(track => {
    track.approved = !allApproved;
    const card = document.getElementById(`track-card-${track.id}`);
    const checkbox = card.querySelector('.track-checkbox');
    if (checkbox) {
      checkbox.checked = track.approved;
      if (track.approved) {
        card.classList.add('approved');
      } else {
        card.classList.remove('approved');
      }
    }
  });

  updateCreatePlaylistButtonState();
  saveAppState();
}

// Global Playlist Export Operations
function updateCreatePlaylistButtonState() {
  const approvedCount = state.tracks.filter(t => t.approved && t.status === 'matched').length;
  if (approvedCount > 0 && state.musicKit) {
    el.btnCreatePlaylist.removeAttribute('disabled');
  } else {
    el.btnCreatePlaylist.setAttribute('disabled', 'disabled');
  }
  if (el.btnCreateText) {
    el.btnCreateText.textContent = state.loadedPlaylistId ? "Export Playlist" : "Create Playlist";
  }
}

async function handleCreatePlaylist() {
  if (!state.musicKit) {
    alert("Apple Music is not configured or unavailable. Please refresh the page.");
    return;
  }

  // Refresh config before checking auth to prevent expired developer token issues
  await refreshMusicKitConfiguration();

  // Ensure Apple Music User is authenticated before saving
  if (!state.musicKit.isAuthorized) {
    try {
      await state.musicKit.authorize();
    } catch (err) {
      showErrorToast("Apple Music authentication cancelled or failed.");
      return;
    }
  }

  const approvedTracks = state.tracks.filter(t => t.approved && t.status === 'matched');
  if (approvedTracks.length === 0) {
    alert("Please approve at least one matched song to create/export a playlist.");
    return;
  }

  // If we loaded an existing playlist
  if (state.loadedPlaylistId) {
    const name = el.playlistName.value.trim() || "My Imported Playlist";
    const desc = el.playlistDesc.value.trim() || "Created with MakeMyPlaylist";
    
    // Check if name or description has changed
    const hasMetadataChanges = (name !== state.loadedPlaylistName || desc !== state.loadedPlaylistDesc);
    
    if (hasMetadataChanges) {
      // If user changed name or description, create a new playlist directly without asking
      await executeCreatePlaylist();
    } else if (el.modalExportOptions) {
      // If metadata is unchanged, show the options dialog
      el.modalExportOptions.showModal();
    } else {
      await executeCreatePlaylist();
    }
  } else {
    await executeCreatePlaylist();
  }
}

async function executeCreatePlaylist() {
  const approvedTracks = state.tracks.filter(t => t.approved && t.status === 'matched');
  const name = el.playlistName.value.trim() || "My Imported Playlist";
  const desc = el.playlistDesc.value.trim() || "Created with MakeMyPlaylist";

  // Set create button to active loading state
  el.btnCreatePlaylist.disabled = true;
  el.spinnerCreate.classList.remove('hidden');
  el.btnCreateText.textContent = "Creating...";

  try {
    const userToken = state.musicKit.musicUserToken;

    // Step 1: Create playlist through our backend proxy (developer token never exposed in request logs)
    const createResponse = await fetch('/api/playlists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: name,
        description: desc,
        musicUserToken: userToken
      })
    });

    if (!createResponse.ok) {
      const errData = await createResponse.text();
      throw new Error(`Failed to create playlist container: ${errData}`);
    }

    const createData = await createResponse.json();
    if (!createData.data || !createData.data[0]) {
      throw new Error("Invalid playlist creation response from Apple Music proxy.");
    }

    const playlistId = createData.data[0].id;

    // Step 2: Add approved tracks to the new playlist through proxy
    const trackPayload = approvedTracks.map(track => {
      const activeSong = track.results[track.selectedIndex];
      return {
        id: activeSong.id,
        type: 'songs'
      };
    });

    const addResponse = await fetch(`/api/playlists/${playlistId}/tracks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        tracks: trackPayload,
        musicUserToken: userToken
      })
    });

    if (!addResponse.ok) {
      const errData = await addResponse.text();
      throw new Error(`Failed to add tracks: ${errData}`);
    }

    // Update loaded playlist state to point to the newly created playlist
    state.loadedPlaylistId = playlistId;
    state.loadedPlaylistName = name;
    state.loadedPlaylistDesc = desc;
    state.loadedPlaylistOriginalTrackIds = trackPayload.map(t => t.id);
    saveAppState();

    showSuccessToast(`Playlist "${name}" created successfully with ${trackPayload.length} songs!`);
  } catch (error) {
    console.error("Playlist export error:", error);
    alert(`Could not create playlist: ${error.message}`);
  } finally {
    el.btnCreatePlaylist.disabled = false;
    el.spinnerCreate.classList.add('hidden');
    updateCreatePlaylistButtonState();
  }
}

async function handleUpdatePlaylist() {
  const playlistId = state.loadedPlaylistId;
  if (!playlistId) return;

  const approvedTracks = state.tracks.filter(t => t.approved && t.status === 'matched');
  const name = el.playlistName.value.trim() || "My Imported Playlist";
  const desc = el.playlistDesc.value.trim() || "Created with MakeMyPlaylist";

  // Set button to active loading state
  el.btnCreatePlaylist.disabled = true;
  el.spinnerCreate.classList.remove('hidden');
  el.btnCreateText.textContent = "Updating...";

  try {
    const userToken = state.musicKit.musicUserToken;

    // Check if the user tried to change name or description
    const hasMetadataChanges = (name !== state.loadedPlaylistName || desc !== state.loadedPlaylistDesc);

    // Determine which approved tracks are NEW (not in state.loadedPlaylistOriginalTrackIds)
    const newTracks = approvedTracks.filter(track => {
      const activeSong = track.results[track.selectedIndex];
      return !state.loadedPlaylistOriginalTrackIds.includes(activeSong.id);
    });

    if (newTracks.length > 0) {
      const trackPayload = newTracks.map(track => {
        const activeSong = track.results[track.selectedIndex];
        return {
          id: activeSong.id,
          type: 'songs'
        };
      });

      // Append new tracks via POST proxy
      const addResponse = await fetch(`/api/playlists/${playlistId}/tracks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tracks: trackPayload,
          musicUserToken: userToken
        })
      });

      if (!addResponse.ok) {
        const errData = await addResponse.text();
        throw new Error(`Failed to append new tracks: ${errData}`);
      }

      // Add newly appended IDs to state.loadedPlaylistOriginalTrackIds
      newTracks.forEach(track => {
        const activeSong = track.results[track.selectedIndex];
        state.loadedPlaylistOriginalTrackIds.push(activeSong.id);
      });

      saveAppState();
      showSuccessToast(`Successfully appended ${trackPayload.length} new songs to the playlist!`);
    } else {
      if (hasMetadataChanges) {
        showWarningToast("Note: Apple Music API does not support editing playlist name/description via web app.");
      } else {
        showSuccessToast("Playlist is up-to-date (no new songs to append).");
      }
    }

    if (hasMetadataChanges && newTracks.length > 0) {
      // Show warning about name/desc not being editable shortly after success toast
      setTimeout(() => {
        showWarningToast("Note: Playlist name/description changes cannot be saved due to Apple Music API limits.");
      }, 1500);
    }
  } catch (error) {
    console.error("Playlist update error:", error);
    alert(`Could not update playlist: ${error.message}`);
  } finally {
    el.btnCreatePlaylist.disabled = false;
    el.spinnerCreate.classList.add('hidden');
    updateCreatePlaylistButtonState();
  }
}

// Helpers
function formatDuration(ms) {
  if (!ms) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Subtle Toast Notifications
function showSuccessToast(message) {
  showToast(message, 'success');
}

function showWarningToast(message) {
  showToast(message, 'warning');
}

function showErrorToast(message) {
  showToast(message, 'error');
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.style.position = 'fixed';
  toast.style.bottom = '110px';
  toast.style.right = '40px';
  toast.style.background = type === 'success' ? '#34c759' : (type === 'warning' ? '#ff9f0a' : '#ff3b30');
  toast.style.color = 'white';
  toast.style.padding = '12px 24px';
  toast.style.borderRadius = '8px';
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  toast.style.zIndex = '999';
  toast.style.fontSize = '14px';
  toast.style.fontWeight = '600';
  toast.style.fontFamily = 'var(--font-family-body)';
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(10px)';
  toast.style.transition = 'all 0.3s ease';

  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  }, 50);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

// Global Audio Preview Controllers
function playPreview(trackId, previewUrl) {
  if (state.playingAudio && state.playingTrackId === trackId) {
    state.playingAudio.pause();
    state.playingAudio = null;
    state.playingTrackId = null;
    updateAllPlayButtonUI();
    return;
  }

  if (state.playingAudio) {
    state.playingAudio.pause();
  }

  const audio = new Audio(previewUrl);
  state.playingAudio = audio;
  state.playingTrackId = trackId;

  audio.addEventListener('ended', () => {
    state.playingAudio = null;
    state.playingTrackId = null;
    updateAllPlayButtonUI();
  });

  audio.play().catch(err => {
    console.error("Audio playback error:", err);
    state.playingAudio = null;
    state.playingTrackId = null;
    updateAllPlayButtonUI();
  });

  updateAllPlayButtonUI();
}

function updateAllPlayButtonUI() {
  const containers = el.tracksList.querySelectorAll('.track-artwork-container');
  containers.forEach(container => {
    const playBtn = container.querySelector('.btn-play-preview');
    if (!playBtn) return;

    const trackId = parseInt(playBtn.dataset.id);
    const playIcon = playBtn.querySelector('.play-icon');
    const pauseIcon = playBtn.querySelector('.pause-icon');

    if (state.playingTrackId === trackId) {
      container.classList.add('playing');
      playIcon.classList.add('hidden');
      pauseIcon.classList.remove('hidden');
    } else {
      container.classList.remove('playing');
      playIcon.classList.remove('hidden');
      pauseIcon.classList.add('hidden');
    }
  });
}

// Local Storage Session Persistence Helpers
function saveAppState() {
  localStorage.setItem('makemyplaylist_raw_input', el.inputSongList.value);

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
}

function restoreAppState() {
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
        el.btnApproveAll.disabled = false;
        renderTracksList();
        updateCreatePlaylistButtonState();
      }
    }
  } catch (e) {
    console.error("Error restoring app state:", e);
  }
}

function handleResetApp() {
  if (confirm("Are you sure you want to clear the editor? This will erase the current song list, playlist settings, and all search results.")) {
    // 1. Stop any running audio preview
    if (state.playingAudio) {
      state.playingAudio.pause();
      state.playingAudio = null;
      state.playingTrackId = null;
    }

    // 2. Clear state variables
    state.tracks = [];
    state.loadedPlaylistId = null;
    state.loadedPlaylistName = null;
    state.loadedPlaylistDesc = null;
    state.loadedPlaylistOriginalTrackIds = [];

    // 3. Reset UI inputs to defaults
    el.inputSongList.value = "";
    el.playlistName.value = "My Awesome Playlist";
    el.playlistDesc.value = "";
    el.playlistPublic.checked = false;

    // 4. Reset library playlist importer selector
    el.selectLibraryPlaylists.value = "";
    el.btnLoadPlaylist.setAttribute('disabled', 'disabled');

    // 5. Hide results and show empty state
    el.tracksList.innerHTML = "";
    el.tracksList.classList.add('hidden');
    el.resultsEmptyState.classList.remove('hidden');
    el.btnApproveAll.setAttribute('disabled', 'disabled');
    el.searchProgressCard.classList.add('hidden');
    el.progressBarFill.style.width = "0%";

    // 6. Disable final export actions since there are no songs
    updateCreatePlaylistButtonState();

    // 7. Clear local storage state
    localStorage.removeItem('makemyplaylist_raw_input');
    localStorage.removeItem('makemyplaylist_details');
    localStorage.removeItem('makemyplaylist_tracks');
    localStorage.removeItem('makemyplaylist_loaded_playlist_id');
    localStorage.removeItem('makemyplaylist_loaded_playlist_name');
    localStorage.removeItem('makemyplaylist_loaded_playlist_desc');
    localStorage.removeItem('makemyplaylist_loaded_playlist_original_track_ids');

    showSuccessToast("Editor cleared successfully!");
  }
}


// Fetch user's library playlists via proxy
async function handleFetchLibraryPlaylists() {
  if (!state.musicKit) {
    alert("Apple Music is not configured or unavailable. Please refresh the page.");
    return;
  }

  // Refresh config and authenticate if needed
  await refreshMusicKitConfiguration();
  if (!state.musicKit.isAuthorized) {
    try {
      await state.musicKit.authorize();
    } catch (err) {
      showErrorToast("Apple Music authorization failed.");
      return;
    }
  }

  // UI loading state
  el.btnFetchPlaylists.disabled = true;
  el.spinnerFetch.classList.remove('hidden');
  el.btnFetchText.textContent = "Fetching Playlists...";

  try {
    const userToken = state.musicKit.musicUserToken;
    const response = await fetch(`/api/library/playlists?musicUserToken=${encodeURIComponent(userToken)}`);
    if (!response.ok) {
      throw new Error(`Proxy playlists endpoint returned ${response.status}`);
    }

    const data = await response.json();
    if (!data.data || data.data.length === 0) {
      alert("No playlists found in your Apple Music library.");
      return;
    }

    // Populate Select options
    el.selectLibraryPlaylists.innerHTML = '<option value="" disabled selected>Choose a playlist...</option>';
    data.data.forEach(playlist => {
      const option = document.createElement('option');
      option.value = playlist.id;
      option.textContent = playlist.attributes.name;
      option.dataset.name = playlist.attributes.name;
      option.dataset.description = playlist.attributes.description?.standard || "";
      el.selectLibraryPlaylists.appendChild(option);
    });

    // Show selection group
    el.playlistSelectGroup.classList.remove('hidden');
    showSuccessToast("Playlists loaded successfully!");
  } catch (err) {
    console.error("Error fetching library playlists:", err);
    alert(`Could not load playlists: ${err.message}`);
  } finally {
    el.btnFetchPlaylists.disabled = false;
    el.spinnerFetch.classList.add('hidden');
    el.btnFetchText.textContent = "Fetch My Playlists";
  }
}

// Load track items of the selected library playlist
async function handleLoadSelectedPlaylist() {
  const select = el.selectLibraryPlaylists;
  const playlistId = select.value;
  if (!playlistId) return;

  const selectedOption = select.options[select.selectedIndex];
  const playlistName = selectedOption.dataset.name;
  const playlistDesc = selectedOption.dataset.description;

  // UI Loading state
  el.btnLoadPlaylist.disabled = true;
  el.spinnerLoad.classList.remove('hidden');
  el.btnLoadText.textContent = "Loading tracks...";

  try {
    const userToken = state.musicKit.musicUserToken;
    const response = await fetch(`/api/library/playlists/${playlistId}/tracks?musicUserToken=${encodeURIComponent(userToken)}`);
    if (!response.ok) {
      throw new Error(`Proxy tracks endpoint returned ${response.status}`);
    }

    const data = await response.json();
    if (!data.data || data.data.length === 0) {
      alert("This playlist has no songs.");
      return;
    }

    // Parse and map tracks to formatted text list
    const tracksLines = [];
    const originalTrackIds = [];
    let trackId = 1;

    const parsedTracks = data.data.map(track => {
      const name = track.attributes.name || "";
      const artist = track.attributes.artistName || "";
      const queryText = `${artist} - ${name}`;
      tracksLines.push(queryText);

      const catalogSong = track.relationships?.catalog?.data?.[0];
      if (catalogSong) {
        originalTrackIds.push(catalogSong.id);
        return {
          id: trackId++,
          originalQuery: queryText,
          searchQuery: queryText,
          status: 'matched',
          results: [catalogSong],
          selectedIndex: 0,
          approved: true,
          errorMessage: ''
        };
      } else {
        return {
          id: trackId++,
          originalQuery: queryText,
          searchQuery: queryText,
          status: 'no-match',
          results: [],
          selectedIndex: 0,
          approved: false,
          errorMessage: ''
        };
      }
    });

    // Populate state and inputs
    const finalDesc = playlistDesc || `Imported from library playlist: ${playlistName}`;
    state.tracks = parsedTracks;
    state.loadedPlaylistId = playlistId;
    state.loadedPlaylistName = playlistName;
    state.loadedPlaylistDesc = finalDesc;
    state.loadedPlaylistOriginalTrackIds = originalTrackIds;

    el.inputSongList.value = tracksLines.join('\n');
    el.playlistName.value = playlistName;
    el.playlistDesc.value = finalDesc;

    // Update UI immediately
    el.resultsEmptyState.classList.add('hidden');
    el.tracksList.classList.remove('hidden');
    el.btnApproveAll.disabled = false;

    renderTracksList();
    updateCreatePlaylistButtonState();
    saveAppState();

    showSuccessToast(`Successfully loaded ${tracksLines.length} songs and updated track list!`);
  } catch (err) {
    console.error("Error loading playlist tracks:", err);
    alert(`Could not load playlist songs: ${err.message}`);
  } finally {
    el.btnLoadPlaylist.disabled = false;
    el.spinnerLoad.classList.add('hidden');
    el.btnLoadText.textContent = "Load Playlist Songs";
  }
}

// FLIP animation helper for smooth reordering transitions
function flipReorder(actionFn) {
  const list = el.tracksList;
  if (!list) {
    actionFn();
    return;
  }

  const cards = [...list.querySelectorAll('.track-card')];

  // First: Capture initial offsetTop positions relative to container parent
  const startTops = new Map(
    cards.map(card => [card.id, card.offsetTop])
  );

  // Perform layout modifications (state re-render or DOM shifts)
  actionFn();

  // Last: Capture post-layout positions and apply inverted transforms
  const newCards = [...list.querySelectorAll('.track-card')];
  newCards.forEach(card => {
    const startTop = startTops.get(card.id);
    if (startTop === undefined) return;

    const endTop = card.offsetTop;
    const deltaY = startTop - endTop;

    if (deltaY !== 0) {
      // Invert: shift back immediately with no transition
      card.style.transition = 'none';
      card.style.transform = `translateY(${deltaY}px)`;

      // Force repaint to make transform register before transition is enabled
      card.offsetHeight;

      // Play: animate back to final layout position
      card.style.transition = 'transform 0.15s cubic-bezier(0.2, 0.8, 0.2, 1)';
      card.style.transform = '';
    }
  });

  // Cleanup inline transition styles after transition finishes
  if (list.cleanupTimeout) clearTimeout(list.cleanupTimeout);
  list.cleanupTimeout = setTimeout(() => {
    newCards.forEach(card => {
      card.style.transition = '';
      card.style.transform = '';
    });
  }, 150);
}

// Reorder tracks by index offset
function moveTrack(trackId, direction) {
  const index = state.tracks.findIndex(t => t.id === trackId);
  if (index === -1) return;

  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= state.tracks.length) return;

  // Swap tracks in state
  const temp = state.tracks[index];
  state.tracks[index] = state.tracks[newIndex];
  state.tracks[newIndex] = temp;

  // Animate the swap re-render
  flipReorder(() => {
    renderTracksList();
  });

  saveAppState();
}

let draggedCard = null;
let dragDirection = 'down';
let lastY = 0;

// Initialize dragover on track list container
function initDragAndDrop() {
  const list = el.tracksList;
  if (!list) return;

  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!draggedCard) return;

    // Determine drag direction
    if (e.clientY > lastY) {
      dragDirection = 'down';
    } else if (e.clientY < lastY) {
      dragDirection = 'up';
    }
    lastY = e.clientY;

    const afterElement = getDragAfterElement(list, e.clientY, dragDirection);

    // Only trigger insertion if position actually changes in the DOM
    const currentNext = draggedCard.nextElementSibling;
    if (afterElement !== draggedCard && afterElement !== currentNext) {
      flipReorder(() => {
        if (afterElement == null) {
          list.appendChild(draggedCard);
        } else {
          list.insertBefore(draggedCard, afterElement);
        }
      });
    }
  });
}

// Bind drag listeners to each card
function bindDragAndDropListeners(card) {
  // Only trigger dragging if user starts drag on the drag handle
  const handle = card.querySelector('.track-drag-handle');
  if (handle) {
    handle.addEventListener('mousedown', () => {
      card.setAttribute('draggable', 'true');
    });
    handle.addEventListener('mouseup', () => {
      card.removeAttribute('draggable');
    });
    handle.addEventListener('dragend', () => {
      card.removeAttribute('draggable');
    });
  }

  card.addEventListener('dragstart', (e) => {
    draggedCard = card;
    dragDirection = 'down'; // Reset to default on start
    lastY = e.clientY;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', card.id);
  });

  card.addEventListener('dragend', () => {
    draggedCard = null;
    card.classList.remove('dragging');
    card.removeAttribute('draggable');
    reorderStateFromDOM();
  });
}

// Find closest dropsite card below drag pointer
function getDragAfterElement(container, y, direction) {
  const draggableElements = [...container.querySelectorAll('.track-card:not(.dragging)')];
  const containerBox = container.getBoundingClientRect();
  const scrollTop = container.scrollTop;

  const thresholdRatio = direction === 'down' ? -1 : 0;

  return draggableElements.reduce((closest, child) => {
    // Calculate layout top relative to the viewport, ignoring active transforms
    const layoutTop = containerBox.top + child.offsetTop - scrollTop;
    const height = child.offsetHeight;
    const offset = y - layoutTop - height * thresholdRatio;

    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Synchronize state array with current DOM elements order
function reorderStateFromDOM() {
  const cards = [...el.tracksList.querySelectorAll('.track-card')];
  const newTracks = [];

  cards.forEach((card) => {
    const trackId = parseInt(card.id.replace('track-card-', ''));
    const track = state.tracks.find(t => t.id === trackId);
    if (track) {
      newTracks.push(track);
    }
  });

  state.tracks = newTracks;
  saveAppState();

  // Re-render to refresh indices and button disabled states
  renderTracksList();
}

