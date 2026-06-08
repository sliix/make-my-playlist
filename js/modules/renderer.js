import { state, el, saveAppState } from './state.js';
import { formatDuration, showSuccessToast, showErrorToast } from './utils.js';
import { searchCatalogProxy } from './api.js';
import { moveTrack, bindDragAndDropListeners } from './reorder.js';
import { t } from './i18n.js';

export function updateMobileViewUI() {
  const isMobile = window.innerWidth <= 640;
  if (!isMobile) {
    document.body.classList.remove('mobile-view-setup', 'mobile-view-tracks');
    return;
  }
  
  const count = state.tracks ? state.tracks.length : 0;
  if (state.mobileView === 'tracks' && count > 0) {
    document.body.classList.remove('mobile-view-setup');
    document.body.classList.add('mobile-view-tracks');
  } else {
    state.mobileView = 'setup';
    document.body.classList.remove('mobile-view-tracks');
    document.body.classList.add('mobile-view-setup');
  }

  // Update Go to Tracks button text
  if (el.btnGoToTracksText) {
    el.btnGoToTracksText.textContent = t('action.goToTracks', { count });
  }

  // Show/hide Go to Tracks button based on track availability
  if (el.btnGoToTracks) {
    if (count > 0) {
      el.btnGoToTracks.classList.remove('hidden');
    } else {
      el.btnGoToTracks.classList.add('hidden');
    }
  }
}

export function updateTracksCounter() {
  if (!state.tracks || state.tracks.length === 0) {
    el.tracksCounter.classList.add('hidden');
    if (el.appendModeContainer) {
      el.appendModeContainer.classList.add('hidden');
    }
    updateMobileViewUI();
    return;
  }
  const total = state.tracks.length;
  const approved = state.tracks.filter(t => t.approved).length;
  el.tracksCounter.textContent = t("track.counter", { approved, total });
  el.tracksCounter.classList.remove('hidden');
  if (el.appendModeContainer) {
    el.appendModeContainer.classList.remove('hidden');
  }
  updateMobileViewUI();
}

export function updateCreatePlaylistButtonState() {
  const approvedCount = state.tracks.filter(t => t.approved && t.status === 'matched').length;
  if (approvedCount > 0 && state.musicKit) {
    el.btnCreatePlaylist.removeAttribute('disabled');
  } else {
    el.btnCreatePlaylist.setAttribute('disabled', 'disabled');
  }
  if (el.btnCreateText) {
    let isCreatingNew = true;
    if (state.loadedPlaylistId) {
      const name = el.playlistName ? el.playlistName.value.trim() : "";
      const desc = el.playlistDesc ? el.playlistDesc.value.trim() : "";
      const hasMetadataChanges = (name !== state.loadedPlaylistName || desc !== state.loadedPlaylistDesc);
      if (!hasMetadataChanges) {
        isCreatingNew = false;
      }
    }
    el.btnCreateText.textContent = isCreatingNew ? t("action.createPlaylist") : t("action.exportPlaylist");
  }
}

// UI Rendering for track cards
export function renderTracksList() {
  el.tracksList.innerHTML = '';
  updateTracksCounter();

  state.tracks.forEach((track, index) => {
    const card = document.createElement('div');
    card.className = `track-card ${track.approved ? 'approved' : ''} ${track.status === 'no-match' ? 'no-match' : ''} ${track.isExpanded ? 'expanded' : ''}`;
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
    const title = activeSong ? activeSong.attributes.name : t('track.noMatch');
    const artist = activeSong ? activeSong.attributes.artistName : t('track.tryRefining');
    const album = activeSong ? activeSong.attributes.albumName : '';
    const duration = activeSong ? formatDuration(activeSong.attributes.durationInMillis) : '';
    const isExplicit = activeSong && (activeSong.attributes.isExplicit || (activeSong.attributes.contentRating && activeSong.attributes.contentRating.toLowerCase() === 'explicit'));
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
            <span class="track-title" title="${title}"><span class="track-title-text">${title}</span></span>
            ${isExplicit ? `<span class="track-explicit-badge desktop-only">${t('track.explicit')}</span>` : ''}
          </div>
          <div class="track-artist" title="${artist}"><span class="track-artist-text">${artist}</span></div>
          ${album ? `<div class="track-album" title="${album}">${album}</div>` : ''}
          <div class="track-original-query">
            <span>${t('track.queryLabel')}: "${track.originalQuery}"</span>
          </div>
        </div>
        
        <div class="track-right-controls">
          <div class="track-duration-stack">
            ${isExplicit ? `<span class="track-explicit-badge mobile-only">${t('track.explicit')}</span>` : ''}
            ${duration ? `
            <div class="track-details-badge">
              <span>${duration}</span>
            </div>
            ` : ''}
          </div>
          <button class="btn-toggle-expand" data-id="${track.id}" aria-label="Toggle Details">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>
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
          <label>${t('track.versionLabel')}</label>
          <div class="select-wrapper">
            <select class="select-alternatives" data-id="${track.id}" ${track.results.length <= 1 ? 'disabled' : ''}>
              ${track.results.length > 0
        ? track.results.map((song, idx) => {
          const label = `${song.attributes.name} - ${song.attributes.artistName} (${formatDuration(song.attributes.durationInMillis)})`;
          return `<option value="${idx}" ${idx === track.selectedIndex ? 'selected' : ''}>${label}</option>`;
        }).join('')
        : `<option>${t('track.alternativesDefault')}</option>`
      }
            </select>
          </div>
        </div>
        
        <div class="control-group">
          <label>${t('track.refineLabel')}</label>
          <div class="input-refine-group">
            <input type="text" class="input-refine" data-id="${track.id}" value="${track.searchQuery}" placeholder="${t('track.refinePlaceholder')}">
            <button class="btn btn-secondary btn-refine" data-id="${track.id}">${t('track.btnRequery')}</button>
          </div>
        </div>
      </div>
    `;

    el.tracksList.appendChild(card);
  });

  // Bind dynamic interactive elements inside cards
  bindTrackCardListeners();
}

export function bindTrackCardListeners() {
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
        updateTracksCounter();
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
        button.textContent = t('track.btnRequerying');
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

  // 6. Drag and Drop + Hover event listeners on cards
  el.tracksList.querySelectorAll('.track-card').forEach(card => {
    bindDragAndDropListeners(card);
    
    // Hover marquee listeners for desktop
    card.addEventListener('mouseenter', () => {
      updateTextMarquee(card, true);
    });
    card.addEventListener('mouseleave', () => {
      updateTextMarquee(card, false);
    });

    // Initial marquee check for mobile expanded items
    updateTextMarquee(card);
  });

  // 7. Toggle Details Event Listener
  el.tracksList.querySelectorAll('.btn-toggle-expand').forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const trackId = parseInt(button.dataset.id);
      const track = state.tracks.find(t => t.id === trackId);
      if (track) {
        track.isExpanded = !track.isExpanded;
        const card = document.getElementById(`track-card-${trackId}`);
        if (card) {
          card.classList.toggle('expanded', track.isExpanded);
          updateTextMarquee(card);
        }
        saveAppState();
      }
    });
  });
}

// Local card rerender logic for seamless transitions
export function updateSingleTrackCard(track) {
  const card = document.getElementById(`track-card-${track.id}`);
  if (!card) return;

  card.className = `track-card ${track.approved ? 'approved' : ''} ${track.status === 'no-match' ? 'no-match' : ''} ${track.isExpanded ? 'expanded' : ''}`;

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

  const title = activeSong ? activeSong.attributes.name : t('track.noMatch');
  const artist = activeSong ? activeSong.attributes.artistName : t('track.tryRefining');
  const album = activeSong ? activeSong.attributes.albumName : '';
  const duration = activeSong ? formatDuration(activeSong.attributes.durationInMillis) : '';
  const isExplicit = activeSong && (activeSong.attributes.isExplicit || (activeSong.attributes.contentRating && activeSong.attributes.contentRating.toLowerCase() === 'explicit'));
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
        <span class="track-title" title="${title}"><span class="track-title-text">${title}</span></span>
        ${isExplicit ? `<span class="track-explicit-badge desktop-only">${t('track.explicit')}</span>` : ''}
      </div>
      <div class="track-artist" title="${artist}"><span class="track-artist-text">${artist}</span></div>
      ${album ? `<div class="track-album" title="${album}">${album}</div>` : ''}
      <div class="track-original-query">
        <span>${t('track.queryLabel')}: "${track.originalQuery}"</span>
      </div>
    </div>
    
    <div class="track-right-controls">
      <div class="track-duration-stack">
        ${isExplicit ? `<span class="track-explicit-badge mobile-only">${t('track.explicit')}</span>` : ''}
        ${duration ? `
        <div class="track-details-badge">
          <span>${duration}</span>
        </div>
        ` : ''}
      </div>
      <button class="btn-toggle-expand" data-id="${track.id}" aria-label="Toggle Details">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
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
    ? track.results.map((song, idx) => {
      const label = `${song.attributes.name} - ${song.attributes.artistName} (${formatDuration(song.attributes.durationInMillis)})`;
      return `<option value="${idx}" ${idx === track.selectedIndex ? 'selected' : ''}>${label}</option>`;
    }).join('')
    : `<option>${t('track.alternativesDefault')}</option>`;

  if (track.results.length <= 1) {
    select.setAttribute('disabled', 'disabled');
  } else {
    select.removeAttribute('disabled');
  }

  const button = card.querySelector('.btn-refine');
  button.disabled = false;
  button.textContent = t('track.btnRequery');

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

  // Re-bind hover/marquee listeners on this card
  card.addEventListener('mouseenter', () => {
    updateTextMarquee(card, true);
  });
  card.addEventListener('mouseleave', () => {
    updateTextMarquee(card, false);
  });

  // Re-bind toggle details listener
  const toggleBtn = card.querySelector('.btn-toggle-expand');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      track.isExpanded = !track.isExpanded;
      card.classList.toggle('expanded', track.isExpanded);
      updateTextMarquee(card);
      saveAppState();
    });
  }

  // Initial marquee check for mobile expanded items
  updateTextMarquee(card);

  // Update play button state for this card
  updateAllPlayButtonUI();
}

export function updateTextMarquee(card, forceActive = false) {
  const isMobile = window.innerWidth <= 640;
  const isExpanded = card.classList.contains('expanded');
  const active = forceActive || (isMobile && isExpanded);

  ['.track-title', '.track-artist'].forEach(selector => {
    const container = card.querySelector(selector);
    if (!container) return;
    const inner = container.querySelector(selector + '-text');
    if (!inner) return;

    if (active) {
      const containerWidth = container.clientWidth;
      const textWidth = inner.offsetWidth;
      const isRtl = document.documentElement.getAttribute('dir') === 'rtl';

      if (textWidth > containerWidth) {
        const overflow = textWidth - containerWidth;
        const duration = Math.max(5, overflow / 10);
        const scrollDist = isRtl ? `${overflow}px` : `-${overflow}px`;
        container.style.setProperty('--scroll-dist', scrollDist);
        container.style.setProperty('--scroll-dur', `${duration}s`);
        container.classList.add('should-scroll');
      } else {
        container.classList.remove('should-scroll');
        container.style.removeProperty('--scroll-dist');
        container.style.removeProperty('--scroll-dur');
      }
    } else {
      container.classList.remove('should-scroll');
      container.style.removeProperty('--scroll-dist');
      container.style.removeProperty('--scroll-dur');
    }
  });
}

// Global Audio Preview Controllers
export function playPreview(trackId, previewUrl) {
  if (previewUrl && previewUrl.startsWith('youtube:')) {
    const videoId = previewUrl.split(':')[1];
    
    if (state.playingAudio) {
      state.playingAudio.pause();
      state.playingAudio = null;
      state.playingTrackId = null;
      updateAllPlayButtonUI();
    }

    if (el.iframeYoutubePreview && el.modalYoutubePreview) {
      el.iframeYoutubePreview.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
      el.modalYoutubePreview.showModal();
    }
    return;
  }

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

export function updateAllPlayButtonUI() {
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
