const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

// Generic HTTP request helper to communicate with the Last.fm API
async function callLastFm(method, params = {}) {
  const apiKey = process.env.LASTFM_API_KEY;
  if (!apiKey) {
    throw new Error('LASTFM_API_KEY is not defined in environment variables.');
  }

  const queryParams = new URLSearchParams({
    method,
    api_key: apiKey,
    format: 'json',
    ...params
  });

  const url = `${BASE_URL}?${queryParams.toString()}`;
  
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Last.fm API Request] ${method} params:`, JSON.stringify(params));
  }

  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Last.fm API ${method} failed with status ${res.status}: ${errText}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`Last.fm API Error ${data.error}: ${data.message}`);
  }

  return data;
}

/**
 * Fetch similar artists for a given artist name.
 * Method: artist.getsimilar
 */
export async function fetchSimilarArtists(artistName, limit = 10) {
  try {
    const data = await callLastFm('artist.getsimilar', { artist: artistName, limit });
    const artists = data.similarartists?.artist || [];
    return artists.slice(0, limit).map(a => a.name);
  } catch (err) {
    console.warn(`[Last.fm] fetchSimilarArtists failed for "${artistName}":`, err.message);
    return [];
  }
}

/**
 * Search for a track to resolve it to standard track details.
 * Method: track.search
 */
export async function searchTrack(trackName, limit = 1) {
  try {
    const data = await callLastFm('track.search', { track: trackName, limit });
    const tracks = data.results?.trackmatches?.track || [];
    return tracks[0] || null;
  } catch (err) {
    console.warn(`[Last.fm] searchTrack failed for "${trackName}":`, err.message);
    return null;
  }
}

/**
 * Fetch similar tracks for a track.
 * Method: track.getsimilar
 */
export async function fetchSimilarTracks(artistName, trackName, limit = 15) {
  try {
    const data = await callLastFm('track.getsimilar', { artist: artistName, track: trackName, limit });
    const tracks = data.similartracks?.track || [];
    return tracks.slice(0, limit).map(t => {
      const artist = typeof t.artist === 'string' ? t.artist : (t.artist?.name || artistName);
      return `${artist} - ${t.name}`;
    });
  } catch (err) {
    console.warn(`[Last.fm] fetchSimilarTracks failed for "${artistName} - ${trackName}":`, err.message);
    return [];
  }
}

/**
 * Fetch details for a track to retrieve its parent album name.
 * Method: track.getinfo
 */
export async function fetchTrackInfo(artistName, trackName) {
  try {
    const data = await callLastFm('track.getinfo', { artist: artistName, track: trackName });
    return data.track?.album?.title || null;
  } catch (err) {
    console.warn(`[Last.fm] fetchTrackInfo failed for "${artistName} - ${trackName}":`, err.message);
    return null;
  }
}

/**
 * Fetch top tracks for a tag/genre.
 * Method: tag.gettoptracks
 */
export async function fetchTopTracksForTag(tagName, limit = 15) {
  try {
    const data = await callLastFm('tag.gettoptracks', { tag: tagName, limit });
    const tracks = data.tracks?.track || [];
    return tracks.slice(0, limit).map(t => {
      const artist = typeof t.artist === 'string' ? t.artist : (t.artist?.name || 'Unknown Artist');
      return `${artist} - ${t.name}`;
    });
  } catch (err) {
    console.warn(`[Last.fm] fetchTopTracksForTag failed for tag "${tagName}":`, err.message);
    return [];
  }
}

/**
 * Fetch top albums for an artist.
 * Method: artist.gettopalbums
 */
export async function fetchTopAlbums(artistName, limit = 10) {
  try {
    const data = await callLastFm('artist.gettopalbums', { artist: artistName, limit });
    const albums = data.topalbums?.album || [];
    return albums.slice(0, limit).map(a => a.name);
  } catch (err) {
    console.warn(`[Last.fm] fetchTopAlbums failed for artist "${artistName}":`, err.message);
    return [];
  }
}

/**
 * Fetch top tracks for an artist.
 * Method: artist.gettoptracks
 */
export async function fetchArtistTopTracks(artistName, limit = 50) {
  try {
    const data = await callLastFm('artist.gettoptracks', { artist: artistName, limit });
    const tracks = data.toptracks?.track || [];
    return tracks.slice(0, limit).map(t => t.name);
  } catch (err) {
    console.warn(`[Last.fm] fetchArtistTopTracks failed for artist "${artistName}":`, err.message);
    return [];
  }
}

/**
 * Fetch all tracks on an album.
 * Method: album.getinfo
 */
export async function fetchAlbumTracks(artistName, albumName) {
  try {
    const data = await callLastFm('album.getinfo', { artist: artistName, album: albumName });
    const tracksData = data.album?.tracks?.track;
    if (!tracksData) return [];
    
    // Last.fm API can return a single track object instead of an array if the album only has 1 track
    const tracksArray = Array.isArray(tracksData) ? tracksData : [tracksData];
    
    return tracksArray.map(t => {
      const artist = typeof t.artist === 'string' ? t.artist : (t.artist?.name || artistName);
      return `${artist} - ${t.name}`;
    });
  } catch (err) {
    console.warn(`[Last.fm] fetchAlbumTracks failed for "${artistName} - ${albumName}":`, err.message);
    return [];
  }
}
