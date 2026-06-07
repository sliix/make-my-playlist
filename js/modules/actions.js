import { state, el, saveAppState } from './state.js';
import { 
  checkAndRefreshSpotifyToken, 
  handleConnectSpotify, 
  refreshMusicKitConfiguration, 
  getAuthHeaders 
} from './api.js';
import { 
  renderTracksList, 
  updateCreatePlaylistButtonState, 
  updateTracksCounter 
} from './renderer.js';
import { 
  updateInputAutoDetection, 
  parseSongLine, 
  executeCatalogSearches,
  executeNaturalLanguageGeneration,
  parseNaturalLanguagePrompt
} from './parser.js';
import { 
  getResponseError, 
  showSuccessToast, 
  showWarningToast, 
  showErrorToast 
} from './utils.js';

// Parsing & Analyze Actions
export function handleAnalyzeSongList() {
  if (state.activeService === 'apple' && !state.musicKit) {
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
    alert(state.detectedMode === 'natural' ? "Please enter a prompt describing your playlist." : "Please paste or write a list of songs first.");
    return;
  }

  if (state.detectedMode === 'natural') {
    // Show searching/parsing progress indicator
    el.resultsEmptyState.classList.add('hidden');
    el.tracksList.classList.add('hidden');
    el.searchProgressCard.classList.remove('hidden');
    el.btnApproveAll.disabled = true;

    el.btnAnalyze.disabled = true;
    el.spinnerAnalyze.classList.remove('hidden');
    el.btnAnalyzeText.textContent = "Analyzing prompt...";
    el.progressStatusText.textContent = "Sending prompt to AI parser...";
    el.progressPercentage.textContent = "0%";
    el.progressBarFill.style.width = "0%";

    // Send prompt to AI backend route
    fetch('/api/parse-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt: rawText })
    })
    .then(async response => {
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`LLM endpoint failed: ${errText}`);
      }
      return response.json();
    })
    .then(parsedPrompt => {
      executeNaturalLanguageGeneration(parsedPrompt);
    })
    .catch(err => {
      console.warn("AI prompt parsing failed, falling back to local regex parser:", err);
      const parsedPrompt = parseNaturalLanguagePrompt(rawText);
      executeNaturalLanguageGeneration(parsedPrompt);
    });
    return;
  }

  // Parse lines
  const lines = rawText.split('\n');
  const newTracks = [];
  const currentTracks = el.chkAppendMode.checked ? [] : [...state.tracks];
  const existingSearchQueries = new Set(
    (el.chkAppendMode.checked ? state.tracks : []).map(t => t.searchQuery.toLowerCase())
  );
  const seenNewQueries = new Set();
  
  let nextId = Math.max(0, ...state.tracks.map(t => t.id)) + 1;

  for (const line of lines) {
    const cleanedQuery = parseSongLine(line);
    if (cleanedQuery) {
      const qLower = cleanedQuery.toLowerCase();
      
      // Prevent duplicates in the newly parsed batch or against existing tracks (if appending)
      if (existingSearchQueries.has(qLower) || seenNewQueries.has(qLower)) {
        continue;
      }
      seenNewQueries.add(qLower);

      // Find an existing track that matches this line (by originalQuery or searchQuery)
      const existingIndex = currentTracks.findIndex(t =>
        t.originalQuery.toLowerCase() === line.trim().toLowerCase() ||
        t.searchQuery.toLowerCase() === qLower
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
    alert("No new or unique songs found to add to the list.");
    return;
  }

  if (el.chkAppendMode.checked) {
    state.tracks = [...state.tracks, ...newTracks];
  } else {
    state.tracks = newTracks;
  }

  // Find tracks that actually need searching
  const pendingTracks = state.tracks.filter(t => t.status === 'pending');

  if (pendingTracks.length === 0) {
    // No new tracks to search! Just re-render the list and save
    renderTracksList();
    updateCreatePlaylistButtonState();
    if (el.cardInputSongs) {
      el.cardInputSongs.classList.add('collapsed');
    }
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

export function handleApproveAll() {
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
  updateTracksCounter();
  saveAppState();
}

// Global Playlist Export Operations
export async function handleCreatePlaylist() {
  if (state.activeService === 'apple') {
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
  } else {
    // Spotify
    const valid = await checkAndRefreshSpotifyToken();
    if (!valid || !state.spotifyAccessToken) {
      handleConnectSpotify();
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
      if (state.activeService === 'apple') {
        // Apple Music does not support PATCHing metadata, so we force-create a new playlist
        await executeCreatePlaylist();
      } else if (el.modalExportOptions) {
        // Spotify supports metadata update, so we let the user choose in the modal
        el.modalExportOptions.showModal();
      } else {
        await executeCreatePlaylist();
      }
    } else if (el.modalExportOptions) {
      el.modalExportOptions.showModal();
    } else {
      await executeCreatePlaylist();
    }
  } else {
    const name = el.playlistName.value.trim();
    if (name === "My Awesome Playlist") {
      if (el.modalPlaylistName) {
        el.modalInputPlaylistName.value = "My Awesome Playlist";
        el.modalPlaylistName.showModal();
        el.modalInputPlaylistName.select(); // Highlight for quick replacement
      } else {
        const newName = prompt("Please enter a custom playlist name:", "My Awesome Playlist");
        if (newName && newName.trim() && newName.trim() !== "My Awesome Playlist") {
          el.playlistName.value = newName.trim();
          saveAppState();
          await executeCreatePlaylist();
        }
      }
    } else {
      await executeCreatePlaylist();
    }
  }
}

export async function executeCreatePlaylist() {
  const approvedTracks = state.tracks.filter(t => t.approved && t.status === 'matched');
  const name = el.playlistName.value.trim() || "My Imported Playlist";
  const desc = el.playlistDesc.value.trim() || "Created with MakeMyPlaylist";

  // Set create button to active loading state
  el.btnCreatePlaylist.disabled = true;
  el.spinnerCreate.classList.remove('hidden');
  el.btnCreateText.textContent = "Creating...";

  try {
    // Step 1: Create playlist through our backend proxy
    const createResponse = await fetch('/api/playlists', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        name: name,
        description: desc
      })
    });

    if (!createResponse.ok) {
      const errMsg = await getResponseError(createResponse);
      throw new Error(errMsg);
    }

    const createData = await createResponse.json();
    if (!createData.data || !createData.data[0]) {
      throw new Error(`Invalid playlist creation response from ${state.activeService === 'apple' ? 'Apple Music' : 'Spotify'} proxy.`);
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
        'Content-Type': 'application/json',
        ...getAuthHeaders()
      },
      body: JSON.stringify({
        tracks: trackPayload
      })
    });

    if (!addResponse.ok) {
      const errMsg = await getResponseError(addResponse);
      throw new Error(errMsg);
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

export async function handleUpdatePlaylist() {
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
    // Check if the user tried to change name or description
    const hasMetadataChanges = (name !== state.loadedPlaylistName || desc !== state.loadedPlaylistDesc);

    // If Spotify, support metadata updates
    if (state.activeService === 'spotify' && hasMetadataChanges) {
      const patchResponse = await fetch(`/api/playlists/${playlistId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          name: name,
          description: desc
        })
      });

      if (!patchResponse.ok) {
        const errMsg = await getResponseError(patchResponse);
        throw new Error(errMsg);
      }

      state.loadedPlaylistName = name;
      state.loadedPlaylistDesc = desc;
      showSuccessToast("Playlist details updated successfully!");
    }

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
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          tracks: trackPayload
        })
      });

      if (!addResponse.ok) {
        const errMsg = await getResponseError(addResponse);
        throw new Error(errMsg);
      }

      // Add newly appended IDs to state.loadedPlaylistOriginalTrackIds
      newTracks.forEach(track => {
        const activeSong = track.results[track.selectedIndex];
        state.loadedPlaylistOriginalTrackIds.push(activeSong.id);
      });

      saveAppState();
      showSuccessToast(`Successfully appended ${trackPayload.length} new songs to the playlist!`);
    } else {
      if (state.activeService === 'apple' && hasMetadataChanges) {
        showWarningToast("Note: Apple Music API does not support editing playlist name/description via web app.");
      } else if (!hasMetadataChanges) {
        showSuccessToast("Playlist is up-to-date (no new songs to append).");
      }
    }

    if (state.activeService === 'apple' && hasMetadataChanges && newTracks.length > 0) {
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

export function handleResetApp() {
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
    state.detectedMode = 'list';
    state.isModeOverridden = false;

    // 3. Reset UI inputs to defaults
    el.inputSongList.value = "";
    el.playlistName.value = "My Awesome Playlist";
    el.playlistDesc.value = "";
    el.playlistPublic.checked = false;
    el.chkAppendMode.checked = false;
    if (el.cardInputSongs) {
      el.cardInputSongs.classList.remove('collapsed');
    }
    updateInputAutoDetection();
    updateTracksCounter();

    // 4. Do not clear the fetched library playlists or importer selector selection

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
    localStorage.removeItem('makemyplaylist_detected_mode');
    localStorage.removeItem('makemyplaylist_is_mode_overridden');
    localStorage.removeItem('makemyplaylist_append_mode');
    localStorage.removeItem('makemyplaylist_details');
    localStorage.removeItem('makemyplaylist_tracks');
    localStorage.removeItem('makemyplaylist_loaded_playlist_id');
    localStorage.removeItem('makemyplaylist_loaded_playlist_name');
    localStorage.removeItem('makemyplaylist_loaded_playlist_desc');
    localStorage.removeItem('makemyplaylist_loaded_playlist_original_track_ids');

    showSuccessToast("Editor cleared successfully!");
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// Fetch user's library playlists via proxy
export async function handleFetchLibraryPlaylists() {
  if (state.activeService === 'apple') {
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
  } else {
    // Spotify
    const valid = await checkAndRefreshSpotifyToken();
    if (!valid || !state.spotifyAccessToken) {
      handleConnectSpotify();
      return;
    }
  }

  // UI loading state
  el.btnFetchPlaylists.disabled = true;
  el.spinnerFetch.classList.remove('hidden');
  el.btnFetchText.textContent = "Fetching Playlists...";

  try {
    const response = await fetch('/api/library/playlists', {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      const errMsg = await getResponseError(response);
      throw new Error(errMsg);
    }

    const data = await response.json();
    if (!data.data || data.data.length === 0) {
      alert(`No playlists found in your ${state.activeService === 'apple' ? 'Apple Music' : 'Spotify'} library.`);
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
export async function handleLoadSelectedPlaylist() {
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
    if (state.activeService === 'spotify') {
      await checkAndRefreshSpotifyToken();
    }
    const response = await fetch(`/api/library/playlists/${playlistId}/tracks`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      const errMsg = await getResponseError(response);
      throw new Error(errMsg);
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

      const catalogSong = track.relationships?.catalog?.data?.[0] || (state.activeService === 'spotify' ? track : null);
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
    if (el.cardInputSongs) {
      el.cardInputSongs.classList.add('collapsed');
    }
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
