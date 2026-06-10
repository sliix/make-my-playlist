import { state, el, saveAppState, restoreAppState } from './js/modules/state.js';
import { applyTranslations, setLocale, t } from './js/modules/i18n.js';
import { 
  loadSessionConfigWithRetries, 
  handleSpotifyCallback, 
  handleYoutubeCallback,
  updateConnectionUI,
  handleConnectAppleMusic,
  handleDisconnectAppleMusic,
  handleConnectSpotify,
  handleDisconnectSpotify,
  handleConnectYoutube,
  handleDisconnectYoutube,
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
import { updateMobileViewUI } from './js/modules/renderer.js';
import { resolveActiveAlert, showCustomAlert, showCustomConfirm } from './js/modules/utils.js';

// Initialize Application
window.addEventListener('DOMContentLoaded', async () => {
  handleSpotifyCallback();
  handleYoutubeCallback();
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

  // Apply initial translations
  applyTranslations();
  updateMobileViewUI();

  // Update placeholders and mobile view styling dynamically on viewport resize
  window.addEventListener('resize', () => {
    applyTranslations();
    updateMobileViewUI();
  });

  // Update connection UI after initialization
  updateConnectionUI();

  // Prevent pinch-to-zoom gestures on touch devices
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });

  document.addEventListener('gesturestart', (e) => {
    e.preventDefault();
  });
});

// Event Listeners Registration
function initEventListeners() {
  // Reset handler
  el.btnReset.addEventListener('click', handleResetApp);

  // Mobile View Navigation handlers
  if (el.btnGoToTracks) {
    el.btnGoToTracks.addEventListener('click', () => {
      if (state.tracks && state.tracks.length > 0) {
        state.mobileView = 'tracks';
        updateMobileViewUI();
      }
    });
  }

  if (el.btnBackToSetup) {
    el.btnBackToSetup.addEventListener('click', () => {
      state.mobileView = 'setup';
      updateMobileViewUI();
    });
  }

  // Action listeners
  el.btnAnalyze.addEventListener('click', handleAnalyzeSongList);
  el.btnApproveAll.addEventListener('click', handleApproveAll);
  el.btnCreatePlaylist.addEventListener('click', handleCreatePlaylist);

  // Language Dropdown trigger
  if (el.btnLangToggle) {
    el.btnLangToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      el.menuLangDropdown.classList.toggle('hidden');
      el.btnLangToggle.parentElement.classList.toggle('open');
    });
  }

  // Language Dropdown Actions
  document.querySelectorAll('.lang-menu-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const lang = item.dataset.lang;
      setLocale(lang);
      updateMobileViewUI();
      if (el.menuLangDropdown) {
        el.menuLangDropdown.classList.add('hidden');
        el.btnLangToggle.parentElement.classList.remove('open');
      }
    });
  });

  // Services Dropdown trigger
  el.btnServicesDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    el.menuServicesDropdown.classList.toggle('hidden');
    el.btnServicesDropdown.parentElement.classList.toggle('open');
  });

  // Services Dropdown Actions
  const serviceItems = document.querySelectorAll('.service-menu-item');
  serviceItems.forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const service = item.getAttribute('data-service');
      const isConnected = !item.classList.contains('offline');
      const isActive = item.classList.contains('active');

      if (!isConnected) {
        // Trigger connection
        if (service === 'apple') {
          handleConnectAppleMusic();
        } else if (service === 'spotify') {
          handleConnectSpotify();
        } else if (service === 'youtube' || service === 'youtube_music') {
          handleConnectYoutube();
        }
      } else {
        if (!isActive) {
          // Select service
          await handleSelectActive(service);
        } else {
          // Connected and Active: Trigger disconnect with confirmation modal
          const confirmDisconnect = await showCustomConfirm(
            t('alert.confirmDisconnectService', { service: t(`serviceName.${service}`) })
          );
          if (confirmDisconnect) {
            if (service === 'apple') {
              handleDisconnectAppleMusic();
            } else if (service === 'spotify') {
              handleDisconnectSpotify();
            } else if (service === 'youtube' || service === 'youtube_music') {
              handleDisconnectYoutube();
            }
          }
        }
      }
    });
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

    // Language Dropdown toggle click outside
    if (el.btnLangToggle && el.menuLangDropdown) {
      if (!el.btnLangToggle.contains(e.target) && !el.menuLangDropdown.contains(e.target)) {
        el.menuLangDropdown.classList.add('hidden');
        el.btnLangToggle.parentElement.classList.remove('open');
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

  // Collapsible cards header toggle listener
  document.querySelectorAll('.section-card.collapsible .card-header-toggle').forEach(header => {
    header.addEventListener('click', () => {
      const card = header.closest('.section-card.collapsible');
      if (card) {
        card.classList.toggle('collapsed');
      }
    });
  });

  // Playlist Name Modal listeners
  if (el.btnCloseNameModal) {
    el.btnCloseNameModal.addEventListener('click', () => el.modalPlaylistName.close());
  }
  if (el.btnCancelNameModal) {
    el.btnCancelNameModal.addEventListener('click', () => el.modalPlaylistName.close());
  }
  if (el.modalPlaylistName) {
    el.modalPlaylistName.addEventListener('click', (e) => {
      if (e.target === el.modalPlaylistName) {
        el.modalPlaylistName.close();
      }
    });
  }
  if (el.btnSaveNameModal) {
    el.btnSaveNameModal.addEventListener('click', () => {
      const newName = el.modalInputPlaylistName.value.trim();
      if (!newName || newName === "My Awesome Playlist") {
        showCustomAlert("Please enter a custom, unique playlist name.");
        return;
      }
      el.playlistName.value = newName;
      saveAppState();
      el.modalPlaylistName.close();
      executeCreatePlaylist();
    });
  }

  // Connect Service Modal listeners
  if (el.btnCloseConnectModal) {
    el.btnCloseConnectModal.addEventListener('click', () => el.modalConnectService.close());
  }
  if (el.modalConnectService) {
    el.modalConnectService.addEventListener('click', (e) => {
      if (e.target === el.modalConnectService) {
        el.modalConnectService.close();
      }
    });
  }
  if (el.btnConnectAppleModal) {
    el.btnConnectAppleModal.addEventListener('click', async () => {
      el.modalConnectService.close();
      await handleConnectAppleMusic();
    });
  }
  if (el.btnConnectSpotifyModal) {
    el.btnConnectSpotifyModal.addEventListener('click', () => {
      el.modalConnectService.close();
      handleConnectSpotify();
    });
  }
  if (el.btnConnectYoutubeModal) {
    el.btnConnectYoutubeModal.addEventListener('click', () => {
      el.modalConnectService.close();
      handleConnectYoutube();
    });
  }

  // YouTube Video Preview modal close & backdrop clicks to stop play
  if (el.btnCloseYoutubePreview) {
    el.btnCloseYoutubePreview.addEventListener('click', () => {
      if (el.iframeYoutubePreview) el.iframeYoutubePreview.src = '';
      el.modalYoutubePreview.close();
    });
  }
  if (el.modalYoutubePreview) {
    el.modalYoutubePreview.addEventListener('click', (e) => {
      if (e.target === el.modalYoutubePreview) {
        if (el.iframeYoutubePreview) el.iframeYoutubePreview.src = '';
        el.modalYoutubePreview.close();
      }
    });
  }

  // Custom Alert / Confirm modal listeners
  if (el.modalCustomAlert) {
    // OK button resolves true
    el.btnCustomAlertOk?.addEventListener('click', () => {
      resolveActiveAlert(true);
      el.modalCustomAlert.close();
    });
    // Cancel button resolves false
    el.btnCustomAlertCancel?.addEventListener('click', () => {
      resolveActiveAlert(false);
      el.modalCustomAlert.close();
    });
    // X close button resolves false
    el.btnCloseAlertModal?.addEventListener('click', () => {
      resolveActiveAlert(false);
      el.modalCustomAlert.close();
    });
    // Backdrop click resolves false
    el.modalCustomAlert.addEventListener('click', (e) => {
      if (e.target === el.modalCustomAlert) {
        resolveActiveAlert(false);
        el.modalCustomAlert.close();
      }
    });
    // Escape key resolves false (native 'cancel' event)
    el.modalCustomAlert.addEventListener('cancel', () => {
      resolveActiveAlert(false);
    });
  }

  // Initialize Drag & Drop events
  initDragAndDrop();
}
