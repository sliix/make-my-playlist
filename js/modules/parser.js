import { state, el, saveAppState } from './state.js';
import { searchCatalogProxy, fetchCatalogPlaylistTracks, fetchCatalogAlbumTracks } from './api.js';
import { renderTracksList, updateCreatePlaylistButtonState } from './renderer.js';

export function parseSongLine(line) {
  let cleaned = line.trim();
  if (!cleaned) return null;

  // Strips list item markers at the beginning
  cleaned = cleaned.replace(/^(\d+[\.\-\)]\s*|\[\d+\]\s*|[\u2022\*\-]\s*)/, '');
  cleaned = cleaned.trim();

  // Replace multiple spaces with a single space
  cleaned = cleaned.replace(/\s+/g, ' ');

  return cleaned;
}

export function detectInputType(text) {
  const rawText = text.trim();
  if (!rawText) return 'list';

  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) return 'list';

  // Standard prompt keywords
  const promptKeywords = [
    // English keywords
    'want', 'playlist', 'best', 'essentials', 'like', 'similar', 'recommend', 'show', 'genre',
    'music', 'songs', 'tracks', 'album', 'decade', 'mix', 'collection', 'mood', 'vibe',
    'chill', 'workout', 'happy', 'sad', 'party', 'focus', 'study',
    // Hebrew keywords
    'רוצה', 'פלייליסט', 'הכי טוב', 'אמנים', 'כמו', 'בסגנון', 'סגנון', 'שירים', 'מוזיקה', 'מוסיקה', 'שנות', 'אלבום'
  ];

  const hasPromptKeyword = (line) => {
    const lower = line.toLowerCase();
    return promptKeywords.some(keyword => lower.includes(keyword));
  };

  let songLinesCount = 0;
  for (const line of lines) {
    const hasSeparator = line.includes('-') || /\bby\b/i.test(line);
    const hasKeywords = hasPromptKeyword(line);
    
    if (hasSeparator && !hasKeywords) {
      songLinesCount++;
    }
  }

  // If more than 50% of the non-empty lines look like songs, it's a song list
  const ratio = songLinesCount / lines.length;
  return ratio > 0.5 ? 'list' : 'natural';
}

export function updateInputAutoDetection() {
  const rawText = el.inputSongList.value.trim();
  if (!rawText) {
    el.detectionStatusContainer.classList.add('hidden');
    state.detectedMode = 'list';
    state.isModeOverridden = false;
    return;
  }

  // Remove existing reset buttons next to override button if any
  const existingReset = el.detectionStatusContainer.querySelector('.btn-reset-auto');
  if (existingReset) {
    existingReset.remove();
  }

  if (!state.isModeOverridden) {
    state.detectedMode = detectInputType(rawText);
  }

  el.detectionStatusContainer.classList.remove('hidden');

  if (state.detectedMode === 'list') {
    el.detectionBadge.className = 'badge badge-info';
    el.detectionBadge.textContent = '📄 List mode';
    el.detectionExplanation.textContent = state.isModeOverridden 
      ? 'Matching specific tracks.' 
      : 'We detected a list of specific tracks to search and match.';
    el.btnOverrideMode.textContent = 'Switch to AI mode';
  } else {
    el.detectionBadge.className = 'badge badge-purple';
    el.detectionBadge.textContent = '✨ AI mode';
    el.detectionExplanation.textContent = state.isModeOverridden 
      ? 'AI will build a playlist based on your prompt.' 
      : 'We detected a request to build a custom playlist with AI.';
    el.btnOverrideMode.textContent = 'Switch to List mode';
  }

  if (state.isModeOverridden) {
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'btn-override-mode btn-reset-auto';
    resetBtn.style.marginLeft = '8px';
    resetBtn.style.color = 'var(--text-muted)';
    resetBtn.textContent = '(Reset to Auto)';
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.isModeOverridden = false;
      updateInputAutoDetection();
      saveAppState();
    });
    el.btnOverrideMode.after(resetBtn);
  }
}

export function parseNaturalLanguagePrompt(text) {
  const lowercaseText = text.toLowerCase();
  
  // 1. Extract Playlist Size (look for numbers)
  let size = 20;
  const numbers = text.match(/\b\d+\b/g);
  if (numbers) {
    for (const numStr of numbers) {
      const num = parseInt(numStr, 10);
      if (num >= 5 && num <= 100) {
        size = num;
        break;
      }
    }
  }

  // 2. Extract Genres
  const knownGenres = [
    'synthwave', 'pop', 'rock', 'jazz', 'hip hop', 'rap', 'r&b', 'soul', 'reggae',
    'classical', 'metal', 'lofi', 'country', 'electronic', 'house', 'techno', 'edm',
    'indie', 'folk', 'punk', 'blues', 'disco', 'ambient', 'vaporwave', 'chillwave'
  ];
  const genres = [];
  knownGenres.forEach(genre => {
    const regex = new RegExp(`\\b${genre}\\b`, 'i');
    if (regex.test(lowercaseText)) {
      genres.push(genre);
    }
  });

  // 3. Extract Artists (after standard search cues)
  const artists = [];
  const artistPatterns = [
    /artists\s+like\s+([^,\.\n\?]+)/gi,
    /artist\s+like\s+([^,\.\n\?]+)/gi,
    /artists\s+such\s+as\s+([^,\.\n\?]+)/gi,
    /artists?:\s*([^,\.\n\?]+)/gi,
    /similar\s+to\s+([^,\.\n\?]+)/gi,
    /featuring\s+([^,\.\n\?]+)/gi,
    /songs?\s+by\s+([^,\.\n\?]+)/gi
  ];

  artistPatterns.forEach(pattern => {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const artistGroup = match[1];
      const names = artistGroup.split(/\band\b|\bor\b|,/gi);
      names.forEach(name => {
        const cleanedName = name.trim().replace(/^(like|such as|featuring|artists?)\s+/i, '').trim();
        if (cleanedName && cleanedName.length > 1 && !/^(playlist|songs|tracks|music|genre)$/i.test(cleanedName)) {
          if (!artists.includes(cleanedName)) {
            artists.push(cleanedName);
          }
        }
      });
    }
  });

  // 4. Extract Seed Songs (after starting cues)
  const songs = [];
  const songPatterns = [
    /songs?\s+like\s+([^,\.\n\?]+)/gi,
    /starting\s+with\s+([^,\.\n\?]+)/gi,
    /seed\s+songs?:\s*([^,\.\n\?]+)/gi
  ];
  songPatterns.forEach(pattern => {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const songGroup = match[1];
      const names = songGroup.split(/\band\b|\bor\b|,/gi);
      names.forEach(name => {
        const cleanedName = name.trim();
        if (cleanedName && cleanedName.length > 1 && !/^(playlist|songs|tracks|music)$/i.test(cleanedName)) {
          if (!songs.includes(cleanedName)) {
            songs.push(cleanedName);
          }
        }
      });
    }
  });

  return {
    size,
    genres,
    artists,
    songs
  };
}

export async function executeNaturalLanguageGeneration(parsedPrompt) {
  console.log("[Just Say It] Starting generation with parsed parameters:", parsedPrompt);

  // Show progress card
  el.resultsEmptyState.classList.add('hidden');
  el.tracksList.classList.add('hidden');
  el.searchProgressCard.classList.remove('hidden');
  el.btnApproveAll.disabled = true;

  el.btnAnalyze.disabled = true;
  el.spinnerAnalyze.classList.remove('hidden');
  el.btnAnalyzeText.textContent = "Analyzing prompt...";
  
  const serviceLabel = state.activeService === 'apple' ? 'Apple Music' : 'Spotify';
  el.progressStatusText.textContent = `Searching ${serviceLabel} Catalog...`;
  el.progressPercentage.textContent = "0%";
  el.progressBarFill.style.width = "0%";

  // 1. Generate search and fetch tasks
  const queries = [];
  
  // Count standard song queries to calculate limitPerQuery
  let songsSearchCount = 0;
  if (parsedPrompt.artists) {
    songsSearchCount += parsedPrompt.artists.length;
  }
  if (parsedPrompt.genres) {
    songsSearchCount += parsedPrompt.genres.length;
  }
  if (parsedPrompt.songs) {
    songsSearchCount += parsedPrompt.songs.length;
  }

  // Calculate dynamic limit per query for standard song queries to satisfy the requested playlist size
  let limitPerQuery = 5;
  if (songsSearchCount > 0) {
    limitPerQuery = Math.ceil((parsedPrompt.size / songsSearchCount) * 1.3) + 3;
    if (limitPerQuery < 5) limitPerQuery = 5;
    if (limitPerQuery > 50) limitPerQuery = 50;
  }

  // Add artist tasks: essentials playlist, best playlist, plain artist songs
  if (parsedPrompt.artists) {
    parsedPrompt.artists.forEach(artist => {
      queries.push({
        type: 'playlist_search',
        term: `${artist} essentials`,
        run: async () => {
          const playlists = await searchCatalogProxy(`${artist} essentials`, 1, 'playlists');
          if (playlists && playlists.length > 0) {
            return await fetchCatalogPlaylistTracks(playlists[0].id);
          }
          return [];
        }
      });
      queries.push({
        type: 'playlist_search',
        term: `${artist} best`,
        run: async () => {
          const playlists = await searchCatalogProxy(`${artist} best`, 1, 'playlists');
          if (playlists && playlists.length > 0) {
            return await fetchCatalogPlaylistTracks(playlists[0].id);
          }
          return [];
        }
      });
      queries.push({
        type: 'songs_search',
        term: artist,
        run: async () => {
          return await searchCatalogProxy(artist, limitPerQuery, 'songs');
        }
      });
    });
  }

  // Add genre tasks: essentials playlist, best playlist, plain genre songs
  if (parsedPrompt.genres) {
    parsedPrompt.genres.forEach(genre => {
      queries.push({
        type: 'playlist_search',
        term: `${genre} essentials`,
        run: async () => {
          const playlists = await searchCatalogProxy(`${genre} essentials`, 1, 'playlists');
          if (playlists && playlists.length > 0) {
            return await fetchCatalogPlaylistTracks(playlists[0].id);
          }
          return [];
        }
      });
      queries.push({
        type: 'playlist_search',
        term: `${genre} best`,
        run: async () => {
          const playlists = await searchCatalogProxy(`${genre} best`, 1, 'playlists');
          if (playlists && playlists.length > 0) {
            return await fetchCatalogPlaylistTracks(playlists[0].id);
          }
          return [];
        }
      });
      queries.push({
        type: 'songs_search',
        term: genre,
        run: async () => {
          return await searchCatalogProxy(genre, limitPerQuery, 'songs');
        }
      });
    });
  }

  // Add album tasks: retrieve entire album in order
  if (parsedPrompt.albums) {
    parsedPrompt.albums.forEach(album => {
      queries.push({
        type: 'album_search',
        term: album,
        run: async () => {
          const albums = await searchCatalogProxy(album, 1, 'albums');
          if (albums && albums.length > 0) {
            return await fetchCatalogAlbumTracks(albums[0].id);
          }
          return [];
        }
      });
    });
  }

  // Add seed song tasks
  if (parsedPrompt.songs) {
    parsedPrompt.songs.forEach(song => {
      queries.push({
        type: 'songs_search',
        term: song,
        run: async () => {
          return await searchCatalogProxy(song, 5, 'songs');
        }
      });
    });
  }

  // Fallback if no specific keywords are parsed or LLM failed
  if (queries.length === 0) {
    const rawText = el.inputSongList.value.trim();
    // Clean prompt by stripping common filler words
    let cleanPrompt = rawText.toLowerCase()
      .replace(/\b(best|tracks|songs|essentials|playlist|music|want|like|similar to|featuring|by|show|me|make|a|an|the|playlist of)\b/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    if (!cleanPrompt) {
      cleanPrompt = rawText.slice(0, 100).replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
    }

    console.log("[Just Say It] Fallback active. Cleaned prompt:", cleanPrompt);

    if (cleanPrompt) {
      queries.push({
        type: 'songs_search',
        term: cleanPrompt,
        run: async () => {
          return await searchCatalogProxy(cleanPrompt, limitPerQuery || 15, 'songs');
        }
      });
      queries.push({
        type: 'playlist_search',
        term: `${cleanPrompt} essentials`,
        run: async () => {
          const playlists = await searchCatalogProxy(`${cleanPrompt} essentials`, 1, 'playlists');
          if (playlists && playlists.length > 0) {
            return await fetchCatalogPlaylistTracks(playlists[0].id);
          }
          return [];
        }
      });
      queries.push({
        type: 'playlist_search',
        term: `${cleanPrompt} best`,
        run: async () => {
          const playlists = await searchCatalogProxy(`${cleanPrompt} best`, 1, 'playlists');
          if (playlists && playlists.length > 0) {
            return await fetchCatalogPlaylistTracks(playlists[0].id);
          }
          return [];
        }
      });
    }
  }

  if (queries.length === 0) {
    alert("Invalid natural language prompt. Please write something descriptive.");
    el.searchProgressCard.classList.add('hidden');
    el.btnAnalyze.disabled = false;
    el.spinnerAnalyze.classList.add('hidden');
    el.btnAnalyzeText.textContent = "Analyze & Search Catalog";
    return;
  }

  console.log("[Just Say It] Generated search queries queue:", queries.map(q => ({ type: q.type, term: q.term })));

  // 2. Execute searches in parallel
  const totalQueries = queries.length;
  let completedQueries = 0;
  
  const updateProgress = () => {
    const pct = Math.floor((completedQueries / totalQueries) * 100);
    el.progressStatusText.textContent = `Searching ${serviceLabel} Catalog...`;
    el.progressPercentage.textContent = `${pct}%`;
    el.progressBarFill.style.width = `${pct}%`;
  };

  updateProgress();

  const queryResults = [];
  const albumResults = [];
  const maxConcurrency = 5;
  const pool = Array.from({ length: Math.min(maxConcurrency, totalQueries) }, async (_, i) => {
    let index = i;
    while (index < totalQueries) {
      const queryItem = queries[index];
      try {
        const results = await queryItem.run();
        console.log(`[Just Say It] Sub-query "${queryItem.term}" (${queryItem.type}) returned ${results ? results.length : 0} results.`);
        if (results && results.length > 0) {
          if (queryItem.type === 'album_search') {
            albumResults.push(results);
          } else {
            queryResults.push(results);
          }
        }
      } catch (err) {
        console.warn(`[Just Say It] Search failed for sub-query "${queryItem.term}":`, err);
      }
      completedQueries++;
      updateProgress();
      index += maxConcurrency;
    }
  });

  await Promise.all(pool);

  console.log(`[Just Say It] Sub-queries complete. queryResults batches: ${queryResults.length}, albumResults batches: ${albumResults.length}`);

  // Assemble final results: albums contiguous and in-order first, then mixed songs
  const finalSongs = [];
  const seenIds = new Set();
  
  // 1. Add album tracks first to keep them in order
  for (const albumTracks of albumResults) {
    for (const song of albumTracks) {
      if (!seenIds.has(song.id)) {
        seenIds.add(song.id);
        finalSongs.push(song);
      }
    }
  }

  // 2. Round-Robin Mix & Deduplicate non-album songs directly into finalSongs
  const maxResultsLength = Math.max(0, ...queryResults.map(arr => arr.length));
  for (let step = 0; step < maxResultsLength; step++) {
    for (const resultsArray of queryResults) {
      if (step < resultsArray.length) {
        const song = resultsArray[step];
        if (!seenIds.has(song.id)) {
          seenIds.add(song.id);
          finalSongs.push(song);
        }
      }
    }
  }

  // Deduplicate and filter finalSongs against state.tracks and duplicates within the batch
  const existingSongIds = new Set(
    (el.chkAppendMode.checked ? state.tracks : [])
      .filter(t => t.status === 'matched' && t.results[t.selectedIndex])
      .map(t => t.results[t.selectedIndex].id)
  );
  const existingSearchQueries = new Set(
    (el.chkAppendMode.checked ? state.tracks : []).map(t => t.searchQuery.toLowerCase())
  );

  const uniqueSongsPool = [];
  const seenQueries = new Set();
  const seenMappedIds = new Set();

  for (const song of finalSongs) {
    const songId = song.id;
    const qName = `${song.attributes.artistName} - ${song.attributes.name}`;
    const qLower = qName.toLowerCase();

    const isDup = (songId && (existingSongIds.has(songId) || seenMappedIds.has(songId))) ||
                  existingSearchQueries.has(qLower) ||
                  seenQueries.has(qLower);

    if (!isDup) {
      if (songId) seenMappedIds.add(songId);
      seenQueries.add(qLower);
      uniqueSongsPool.push(song);
    }
  }

  // Slice unique songs pool to target playlist size
  const slicedSongs = uniqueSongsPool.slice(0, parsedPrompt.size);

  if (slicedSongs.length === 0) {
    alert(`No new matching songs found on ${serviceLabel} for this request. Try different keywords.`);
    el.searchProgressCard.classList.add('hidden');
    el.resultsEmptyState.classList.remove('hidden');
    el.btnAnalyze.disabled = false;
    el.spinnerAnalyze.classList.add('hidden');
    el.btnAnalyzeText.textContent = "Analyze & Search Catalog";
    return;
  }

  // Map into state.tracks format
  let nextId = el.chkAppendMode.checked ? Math.max(0, ...state.tracks.map(t => t.id)) + 1 : 1;
  const mappedTracks = slicedSongs.map((song, idx) => ({
    id: nextId + idx,
    originalQuery: `${song.attributes.artistName} - ${song.attributes.name}`,
    searchQuery: `${song.attributes.artistName} - ${song.attributes.name}`,
    status: 'matched',
    results: [song],
    selectedIndex: 0,
    approved: true,
    errorMessage: ''
  }));

  if (el.chkAppendMode.checked) {
    state.tracks = [...state.tracks, ...mappedTracks];
  } else {
    state.tracks = mappedTracks;
  }

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

// Execute searches using a simple concurrent worker queue
export async function executeCatalogSearches(pendingTracks) {
  const maxConcurrency = 5;
  const total = pendingTracks.length;
  let completed = 0;

  // Function to update progress bar status
  const updateProgress = () => {
    const pct = Math.floor((completed / total) * 100);
    const serviceLabel = state.activeService === 'apple' ? 'Apple Music' : 'Spotify';
    el.progressStatusText.textContent = `Searching ${serviceLabel} Catalog (${completed}/${total})...`;
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
