import express from 'express';
import { generateDeveloperToken } from './apple.js';
import {
  mapSpotifyTrackToStandard,
  mapSpotifyPlaylistToStandard,
  mapSpotifyAlbumToStandard,
  getSpotifyErrorMessage,
  handleSpotifyLogin,
  handleSpotifyCallback,
  handleSpotifyRefresh
} from './spotify.js';
import { handleParsePrompt } from './ai.js';
import {
  handleYoutubeLogin,
  handleYoutubeCallback,
  handleYoutubeRefresh,
  mapYoutubeVideoToStandard,
  mapYoutubePlaylistItemToStandard,
  mapYoutubePlaylistToStandard
} from './youtube.js';

const router = express.Router();

// Helper to parse service ID and token from headers or fallback to request body/query
function getServiceConfig(req) {
  const service = req.headers['x-service-id'] || 'apple';
  const userToken = req.headers['x-user-token'] || req.query.musicUserToken || req.body.musicUserToken || req.body.spotifyAccessToken;
  return { service, userToken };
}

// API Route: Vend short-lived token to configure frontend MusicKit instances
router.get('/session/config', (req, res) => {
  try {
    const token = generateDeveloperToken('5m'); // 5 minutes validity
    res.json({ developerToken: token });
  } catch (error) {
    console.error("Error generating session configuration token:", error.message);
    res.status(500).json({ error: "Failed to generate session configuration." });
  }
});

// API Route: Proxy Catalog searches to keep Developer Token invisible
router.get('/search', async (req, res) => {
  const service = req.headers['x-service-id'];
  const userToken = req.headers['x-user-token'];

  if (!service) {
    return res.status(400).json({ error: "Missing required X-Service-Id header." });
  }

  const { term, storefront = 'us', limit = 5, types = 'songs' } = req.query;
  if (!term) {
    return res.status(400).json({ error: "Missing query term parameter" });
  }

  let parsedLimit = parseInt(limit, 10);
  if (isNaN(parsedLimit) || parsedLimit < 1) {
    parsedLimit = 5;
  } else if (parsedLimit > 50) {
    parsedLimit = 50;
  }

  if (service === 'spotify') {
    if (!userToken) {
      return res.status(400).json({ error: "Missing required X-User-Token header for Spotify search." });
    }
    try {
      const typeMapping = {
        'songs': 'track',
        'playlists': 'playlist',
        'albums': 'album'
      };
      const spotifyType = types.split(',').map(t => typeMapping[t] || t).join(',');
      const market = storefront === 'us' ? 'US' : storefront.toUpperCase();

      const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(term)}&type=${spotifyType}&limit=${parsedLimit}&market=${market}`, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });

      if (!response.ok) {
        const errMsg = await getSpotifyErrorMessage(response, "Spotify Search failed");
        throw new Error(errMsg);
      }

      const data = await response.json();
      const results = {};

      if (data.tracks) {
        results.songs = {
          data: data.tracks.items.map(mapSpotifyTrackToStandard).filter(t => t !== null)
        };
      }
      if (data.playlists) {
        results.playlists = {
          data: data.playlists.items.map(mapSpotifyPlaylistToStandard).filter(t => t !== null)
        };
      }
      if (data.albums) {
        results.albums = {
          data: data.albums.items.map(mapSpotifyAlbumToStandard).filter(t => t !== null)
        };
      }

      return res.json({ results });
    } catch (error) {
      console.error(`Spotify catalog search failed for term "${term}":`, error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  if (service === 'youtube' || service === 'youtube_music') {
    if (!userToken) {
      return res.status(400).json({ error: `Missing required X-User-Token header for ${service === 'youtube' ? 'YouTube' : 'YouTube Music'} search.` });
    }
    try {
      const isMusic = service === 'youtube_music';
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(term)}&maxResults=${parsedLimit}&type=video${isMusic ? '&videoCategoryId=10' : ''}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${userToken}`
        }
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'YouTube search failed');
      }
      
      const results = {
        songs: {
          data: (data.items || []).map(mapYoutubeVideoToStandard).filter(t => t !== null)
        }
      };
      
      return res.json({ results });
    } catch (error) {
      console.error(`${service === 'youtube' ? 'YouTube' : 'YouTube Music'} catalog search failed for term "${term}":`, error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  try {
    const token = generateDeveloperToken('2m'); // Short-lived single-transaction token
    
    // If limit is > 25, we make two parallel paginated requests due to Apple Music's max limit of 25
    if (parsedLimit > 25) {
      const limit1 = 25;
      const limit2 = parsedLimit - 25;
      
      const url1 = `https://api.music.apple.com/v1/catalog/${storefront}/search?term=${encodeURIComponent(term)}&types=${encodeURIComponent(types)}&limit=${limit1}`;
      const url2 = `https://api.music.apple.com/v1/catalog/${storefront}/search?term=${encodeURIComponent(term)}&types=${encodeURIComponent(types)}&limit=${limit2}&offset=25`;
      
      const [resp1, resp2] = await Promise.all([
        fetch(url1, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(url2, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);

      let mergedResults = {};
      
      const mergeData = (data) => {
        if (!data || !data.results) return;
        for (const type of Object.keys(data.results)) {
          if (!mergedResults[type]) {
            mergedResults[type] = { data: [] };
          }
          if (data.results[type] && data.results[type].data) {
            mergedResults[type].data = mergedResults[type].data.concat(data.results[type].data);
          }
        }
      };

      if (resp1.ok) mergeData(await resp1.json());
      if (resp2.ok) mergeData(await resp2.json());

      return res.json({ results: mergedResults });
    }

    // Standard case: limit <= 25
    const url = `https://api.music.apple.com/v1/catalog/${storefront}/search?term=${encodeURIComponent(term)}&types=${encodeURIComponent(types)}&limit=${parsedLimit}`;
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`Apple Music API Search returned HTTP status ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error(`Proxy catalog search failed for term "${term}":`, error.message);
    res.status(500).json({ error: "Failed to query catalog search via backend proxy." });
  }
});

// API Route: Proxy Catalog Playlist Tracks
router.get('/catalog/playlists/:id/tracks', async (req, res) => {
  const service = req.headers['x-service-id'];
  const userToken = req.headers['x-user-token'];

  if (!service) {
    return res.status(400).json({ error: "Missing required X-Service-Id header." });
  }

  const { id } = req.params;
  const { storefront = 'us' } = req.query;

  if (service === 'spotify') {
    if (!userToken) {
      return res.status(400).json({ error: "Missing required X-User-Token header for Spotify." });
    }
    try {
      const response = await fetch(`https://api.spotify.com/v1/playlists/${id}/tracks?limit=100`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (!response.ok) {
        const errMsg = await getSpotifyErrorMessage(response, "Spotify Playlist Tracks API failed");
        throw new Error(errMsg);
      }
      const data = await response.json();
      const mapped = {
        data: data.items.filter(item => item.track).map(item => mapSpotifyTrackToStandard(item.track)).filter(t => t !== null)
      };
      return res.json(mapped);
    } catch (error) {
      console.error(`Spotify catalog playlist tracks failed:`, error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  if (service === 'youtube' || service === 'youtube_music') {
    if (!userToken) {
      return res.status(400).json({ error: "Missing required X-User-Token header for YouTube." });
    }
    try {
      const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${id}&maxResults=100`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'YouTube Playlist Items API failed');
      }
      const mapped = {
        data: (data.items || []).map(mapYoutubePlaylistItemToStandard).filter(t => t !== null)
      };
      return res.json(mapped);
    } catch (error) {
      console.error(`${service} catalog playlist tracks failed:`, error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  try {
    const token = generateDeveloperToken('2m');
    const url = `https://api.music.apple.com/v1/catalog/${storefront}/playlists/${id}/tracks?limit=100`;
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Apple Music API returned HTTP ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error(`Catalog playlist tracks failed:`, error.message);
    res.status(500).json({ error: "Failed to fetch catalog playlist tracks." });
  }
});

// API Route: Proxy Catalog Album Tracks
router.get('/catalog/albums/:id/tracks', async (req, res) => {
  const service = req.headers['x-service-id'];
  const userToken = req.headers['x-user-token'];

  if (!service) {
    return res.status(400).json({ error: "Missing required X-Service-Id header." });
  }

  const { id } = req.params;
  const { storefront = 'us' } = req.query;

  if (service === 'spotify') {
    if (!userToken) {
      return res.status(400).json({ error: "Missing required X-User-Token header for Spotify." });
    }
    try {
      const response = await fetch(`https://api.spotify.com/v1/albums/${id}/tracks?limit=100`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (!response.ok) {
        const errMsg = await getSpotifyErrorMessage(response, "Spotify Album Tracks API failed");
        throw new Error(errMsg);
      }
      const data = await response.json();
      const mapped = {
        data: data.items.map(mapSpotifyTrackToStandard).filter(t => t !== null)
      };
      return res.json(mapped);
    } catch (error) {
      console.error(`Spotify catalog album tracks failed:`, error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  if (service === 'youtube' || service === 'youtube_music') {
    return res.json({ data: [] });
  }

  try {
    const token = generateDeveloperToken('2m');
    const url = `https://api.music.apple.com/v1/catalog/${storefront}/albums/${id}/tracks?limit=100`;
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Apple Music API returned HTTP ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error(`Catalog album tracks failed:`, error.message);
    res.status(500).json({ error: "Failed to fetch catalog album tracks." });
  }
});

// API Route: Proxy User Library Playlist creation
router.post('/playlists', async (req, res) => {
  const { service, userToken } = getServiceConfig(req);
  const { name, description } = req.body;

  if (!userToken) {
    return res.status(400).json({ error: "Missing required User Token (X-User-Token or musicUserToken)." });
  }

  if (service === 'spotify') {
    try {
      // Get Spotify user profile to fetch user ID
      const meResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      if (!meResponse.ok) {
        const errMsg = await getSpotifyErrorMessage(meResponse, "Failed to fetch Spotify user profile");
        throw new Error(errMsg);
      }
      const meData = await meResponse.json();
      const userId = meData.id;

      // Create playlist
      const createResponse = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name || "My Imported Playlist",
          description: description || "Created with MakeMyPlaylist",
          public: false
        })
      });

      if (!createResponse.ok) {
        const errMsg = await getSpotifyErrorMessage(createResponse, "Spotify Playlist Creation failed");
        throw new Error(errMsg);
      }

      const playlistData = await createResponse.json();
      
      // Standardized format:
      return res.json({
        data: [
          {
            id: playlistData.id,
            type: 'library-playlists',
            attributes: {
              name: playlistData.name,
              description: playlistData.description || ''
            }
          }
        ]
      });
    } catch (error) {
      console.error("Spotify playlist creation failed:", error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  if (service === 'youtube' || service === 'youtube_music') {
    try {
      const response = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet,status', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          snippet: {
            title: name || "My Imported Playlist",
            description: description || "Created with MakeMyPlaylist"
          },
          status: {
            privacyStatus: 'private'
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'YouTube Playlist Creation failed');
      }

      return res.json({
        data: [
          {
            id: data.id,
            type: 'library-playlists',
            attributes: {
              name: data.snippet.title,
              description: data.snippet.description || ''
            }
          }
        ]
      });
    } catch (error) {
      console.error("YouTube playlist creation failed:", error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  // Apple Music
  try {
    const token = generateDeveloperToken('2m');
    const url = 'https://api.music.apple.com/v1/me/library/playlists';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Music-User-Token': userToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        attributes: {
          name: name || "My Imported Playlist",
          description: description || "Created with MakeMyPlaylist"
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Apple Music API Playlist Creation returned HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Proxy playlist creation failed:", error.message);
    res.status(500).json({ error: "Failed to create playlist via backend proxy." });
  }
});

// API Route: Proxy adding track items to library playlist
router.post('/playlists/:id/tracks', async (req, res) => {
  const { id } = req.params;
  const { service, userToken } = getServiceConfig(req);
  const { tracks } = req.body;

  if (!userToken || !tracks) {
    return res.status(400).json({ error: "Missing userToken or tracks array." });
  }

  if (service === 'spotify') {
    try {
      const uris = tracks.map(track => `spotify:track:${track.id}`);
      
      // Spotify allows up to 100 tracks per request.
      const chunkSize = 100;
      for (let i = 0; i < uris.length; i += chunkSize) {
        const chunk = uris.slice(i, i + chunkSize);
        const response = await fetch(`https://api.spotify.com/v1/playlists/${id}/tracks`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ uris: chunk })
        });

        if (!response.ok) {
          const errMsg = await getSpotifyErrorMessage(response, "Spotify Add Tracks failed");
          throw new Error(errMsg);
        }
      }

      return res.json({ success: true });
    } catch (error) {
      console.error(`Spotify add tracks failed for playlist "${id}":`, error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  if (service === 'youtube' || service === 'youtube_music') {
    try {
      for (const track of tracks) {
        const insertResponse = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?part=snippet', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${userToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            snippet: {
              playlistId: id,
              resourceId: {
                kind: 'youtube#video',
                videoId: track.id
              }
            }
          })
        });

        if (!insertResponse.ok) {
          const data = await insertResponse.json();
          throw new Error(data.error?.message || `Failed to add track ${track.id} to YouTube playlist.`);
        }
      }
      return res.json({ success: true });
    } catch (error) {
      console.error(`YouTube add tracks failed for playlist "${id}":`, error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  // Apple Music
  try {
    const token = generateDeveloperToken('2m');
    const url = `https://api.music.apple.com/v1/me/library/playlists/${id}/tracks`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Music-User-Token': userToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        data: tracks // Array of { id, type: 'songs' }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Apple Music API Add Tracks returned HTTP ${response.status}: ${errText}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error(`Proxy add tracks failed for playlist "${id}":`, error.message);
    res.status(500).json({ error: "Failed to add tracks via backend proxy." });
  }
});

// API Route: Proxy library playlist details update (PATCH)
router.patch('/playlists/:id', async (req, res) => {
  const { id } = req.params;
  const { service, userToken } = getServiceConfig(req);
  const { name, description } = req.body;

  if (!userToken) {
    return res.status(400).json({ error: "Missing userToken." });
  }

  if (service === 'spotify') {
    try {
      const response = await fetch(`https://api.spotify.com/v1/playlists/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: name,
          description: description
        })
      });

      if (!response.ok) {
        const errMsg = await getSpotifyErrorMessage(response, "Spotify Playlist Update failed");
        throw new Error(errMsg);
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("Spotify playlist update failed:", error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  if (service === 'youtube' || service === 'youtube_music') {
    try {
      const response = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: id,
          snippet: {
            title: name,
            description: description || ''
          }
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'YouTube Playlist Update failed');
      }

      return res.json({ success: true });
    } catch (error) {
      console.error("YouTube playlist update failed:", error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  // Apple Music
  try {
    const token = generateDeveloperToken('2m');
    const url = `https://api.music.apple.com/v1/me/library/playlists/${id}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Music-User-Token': userToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        attributes: {
          name: name,
          description: description
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Apple Music API Playlist Update returned HTTP ${response.status}: ${errText}`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Proxy playlist update failed:", error.message);
    res.status(500).json({ error: "Failed to update playlist via backend proxy." });
  }
});

// API Route: Proxy fetching user's library playlists
router.get('/library/playlists', async (req, res) => {
  const { service, userToken } = getServiceConfig(req);

  if (!userToken) {
    return res.status(400).json({ error: "Missing required User Token." });
  }

  if (service === 'spotify') {
    try {
      const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      if (!response.ok) {
        const errMsg = await getSpotifyErrorMessage(response, "Spotify me/playlists failed");
        throw new Error(errMsg);
      }

      const data = await response.json();
      const mapped = {
        data: data.items.map(playlist => ({
          id: playlist.id,
          type: 'library-playlists',
          attributes: {
            name: playlist.name,
            description: playlist.description || ''
          }
        }))
      };
      return res.json(mapped);
    } catch (error) {
      console.error("Spotify fetch library playlists failed:", error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  if (service === 'youtube' || service === 'youtube_music') {
    try {
      const response = await fetch('https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50', {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'YouTube library playlists fetch failed');
      }
      const mapped = {
        data: (data.items || []).map(mapYoutubePlaylistToStandard).filter(t => t !== null)
      };
      return res.json(mapped);
    } catch (error) {
      console.error("YouTube fetch library playlists failed:", error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  // Apple Music
  try {
    const token = generateDeveloperToken('2m');
    const url = 'https://api.music.apple.com/v1/me/library/playlists?limit=100';
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Music-User-Token': userToken
      }
    });

    if (!response.ok) {
      throw new Error(`Apple Music API library-playlists returned status ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Proxy fetch library playlists failed:", error.message);
    res.status(500).json({ error: "Failed to fetch library playlists via backend proxy." });
  }
});

// API Route: Proxy fetching tracks from a library playlist
router.get('/library/playlists/:id/tracks', async (req, res) => {
  const { id } = req.params;
  const { service, userToken } = getServiceConfig(req);

  if (!userToken) {
    return res.status(400).json({ error: "Missing required User Token." });
  }

  if (service === 'spotify') {
    try {
      const response = await fetch(`https://api.spotify.com/v1/playlists/${id}/tracks?limit=100`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });

      if (!response.ok) {
        const errMsg = await getSpotifyErrorMessage(response, "Spotify playlist tracks failed");
        throw new Error(errMsg);
      }

      const data = await response.json();
      const mapped = {
        data: data.items.filter(item => item.track).map(item => {
          const trackItem = mapSpotifyTrackToStandard(item.track);
          if (trackItem) {
            trackItem.type = 'library-songs'; // Match Apple Music exact structure for library tracks
          }
          return trackItem;
        }).filter(t => t !== null)
      };

      return res.json(mapped);
    } catch (error) {
      console.error(`Spotify fetch tracks failed for playlist "${id}":`, error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  if (service === 'youtube' || service === 'youtube_music') {
    try {
      const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${id}&maxResults=100`, {
        headers: { 'Authorization': `Bearer ${userToken}` }
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'YouTube playlist tracks fetch failed');
      }
      const mapped = {
        data: (data.items || []).map(item => {
          const trackItem = mapYoutubePlaylistItemToStandard(item);
          if (trackItem) {
            trackItem.type = 'library-songs';
          }
          return trackItem;
        }).filter(t => t !== null)
      };
      return res.json(mapped);
    } catch (error) {
      console.error(`YouTube fetch tracks failed for playlist "${id}":`, error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  // Apple Music
  try {
    const token = generateDeveloperToken('2m');
    const url = `https://api.music.apple.com/v1/me/library/playlists/${id}/tracks?limit=100&include=catalog`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Music-User-Token': userToken
      }
    });

    if (!response.ok) {
      throw new Error(`Apple Music API library-playlist-tracks returned status ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error(`Proxy fetch tracks failed for playlist "${id}":`, error.message);
    res.status(500).json({ error: "Failed to fetch playlist tracks via backend proxy." });
  }
});

// Prompt parsing LLM route
router.post('/parse-prompt', handleParsePrompt);

// Spotify OAuth routes
router.get('/spotify/login', handleSpotifyLogin);
router.get('/spotify/callback', handleSpotifyCallback);
router.get('/spotify/refresh', handleSpotifyRefresh);

// YouTube OAuth routes
router.get('/youtube/login', handleYoutubeLogin);
router.get('/youtube/callback', handleYoutubeCallback);
router.get('/youtube/refresh', handleYoutubeRefresh);

export default router;
