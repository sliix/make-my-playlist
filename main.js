import { state, el, saveAppState, restoreAppState } from './js/modules/state.js';
import { 
  loadSessionConfigWithRetries, 
  handleSpotifyCallback, 
  updateConnectionUI,
  handleConnectAppleMusic,
  handleDisconnectAppleMusic,
  handleConnectSpotify,
  handleDisconnectSpotify,
  handleSelectActive
} from './js/modules/api.js';
import {
  handleAnalyzeSongList,
  handleApproveAll,
  handleCreatePlaylist,
  executeCreatePlaylist,
  handleUpdatePlaylist,
  handleResetApp,
  handleFetchLibraryPlaylists,
  handleLoadSelectedPlaylist
} from './js/modules/actions.js';
import {
  updateInputAutoDetection
} from './js/modules/parser.js';
import {
  initDragAndDrop
} from './js/modules/reorder.js';

// Initialize Application
window.addEventListener('DOMContentLoaded', async () => {
  handleSpotifyCallback();
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

  // Update connection UI after initialization
  updateConnectionUI();
});

// Event Listeners Registration
function initEventListeners() {
  // Reset handler
  el.btnReset.addEventListener('click', handleResetApp);

  // Action listeners
  el.btnAnalyze.addEventListener('click', handleAnalyzeSongList);
  el.btnApproveAll.addEventListener('click', handleApproveAll);
  el.btnCreatePlaylist.addEventListener('click', handleCreatePlaylist);

  // Services Dropdown trigger
  el.btnServicesDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    el.menuServicesDropdown.classList.toggle('hidden');
    el.btnServicesDropdown.parentElement.classList.toggle('open');
  });

  // Services Dropdown Actions
  el.btnConnectAppleMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    handleConnectAppleMusic();
  });
  el.btnDisconnectAppleAction.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDisconnectAppleMusic();
  });
  el.btnActivateApple.addEventListener('click', (e) => {
    e.stopPropagation();
    handleSelectActive('apple');
  });

  el.btnConnectSpotifyMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    handleConnectSpotify();
  });
  el.btnDisconnectSpotifyAction.addEventListener('click', (e) => {
    e.stopPropagation();
    handleDisconnectSpotify();
  });
  el.btnActivateSpotify.addEventListener('click', (e) => {
    e.stopPropagation();
    handleSelectActive('spotify');
  });

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
  if (el.btnMenuToggle) {
    el.btnMenuToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      el.headerActions.classList.toggle('open');
    });
  }

  // Close menus when clicking outside
  document.addEventListener('click', (e) => {
    // Mobile menu toggle click outside
    if (el.headerActions && el.headerActions.classList.contains('open')) {
      if (!el.headerActions.contains(e.target) &&
          (!el.btnMenuToggle || (e.target !== el.btnMenuToggle && !el.btnMenuToggle.contains(e.target)))) {
        el.headerActions.classList.remove('open');
      }
    }

    // Dropdown toggle click outside
    if (el.btnServicesDropdown && el.menuServicesDropdown) {
      if (!el.btnServicesDropdown.contains(e.target) && !el.menuServicesDropdown.contains(e.target)) {
        el.menuServicesDropdown.classList.add('hidden');
        el.btnServicesDropdown.parentElement.classList.remove('open');
      }
    }
  });

  // Persist input values as they type
  el.inputSongList.addEventListener('input', () => {
    updateInputAutoDetection();
    saveAppState();
  });
  el.btnOverrideMode.addEventListener('click', (e) => {
    e.preventDefault();
    state.isModeOverridden = true;
    state.detectedMode = state.detectedMode === 'list' ? 'natural' : 'list';
    updateInputAutoDetection();
    saveAppState();
  });
  el.playlistName.addEventListener('input', saveAppState);
  el.playlistDesc.addEventListener('input', saveAppState);
  el.playlistPublic.addEventListener('change', saveAppState);
  el.chkAppendMode.addEventListener('change', saveAppState);

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
