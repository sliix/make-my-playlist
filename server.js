import express from 'express';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
dotenv.config();

const app = express();
app.use(express.json());

// Helper to resolve and parse the Apple Private Key (PEM/p8)
function getPrivateKey() {
  let privateKey = process.env.APPLE_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("APPLE_PRIVATE_KEY is missing from environment variables.");
  }
  
  // If it's a file path, load it from disk
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    try {
      const resolvedPath = path.resolve(privateKey);
      return fs.readFileSync(resolvedPath, 'utf8');
    } catch (err) {
      throw new Error(`Failed to read private key from file path "${privateKey}": ${err.message}`);
    }
  }
  
  // Otherwise, treat it as a direct PEM string and replace escaped newlines
  return privateKey.replace(/\\n/g, '\n');
}

// Generate short-lived Developer Token (JWT signed with ES256)
function generateDeveloperToken(expiresIn = '5m') {
  const privateKey = getPrivateKey();
  const keyId = process.env.APPLE_KEY_ID;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!keyId || !teamId) {
    throw new Error("Missing APPLE_KEY_ID or APPLE_TEAM_ID in environment variables.");
  }

  // Apple Music developer JWT specification
  return jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: expiresIn,
    issuer: teamId,
    header: {
      alg: 'ES256',
      kid: keyId
    }
  });
}

// Create Router for API endpoints
const router = express.Router();

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

// Spotify Mapping Helper Functions to standardise catalog format
function mapSpotifyTrackToStandard(track) {
  if (!track || !track.id) return null;
  return {
    id: track.id,
    type: 'songs',
    attributes: {
      name: track.name || 'Unknown Track',
      artistName: track.artists ? track.artists.map(a => a.name).filter(Boolean).join(', ') : 'Unknown Artist',
      albumName: track.album ? track.album.name || '' : '',
      durationInMillis: track.duration_ms || 0,
      artwork: track.album && track.album.images && track.album.images[0] && track.album.images[0].url ? {
        url: track.album.images[0].url
      } : { url: '' },
      previews: track.preview_url ? [{ url: track.preview_url }] : [],
      isExplicit: track.explicit || false
    }
  };
}

function mapSpotifyPlaylistToStandard(playlist) {
  if (!playlist) return null;
  return {
    id: playlist.id,
    type: 'playlists',
    attributes: {
      name: playlist.name,
      description: playlist.description || ''
    }
  };
}

function mapSpotifyAlbumToStandard(album) {
  if (!album) return null;
  return {
    id: album.id,
    type: 'albums',
    attributes: {
      name: album.name,
      artistName: album.artists ? album.artists.map(a => a.name).join(', ') : ''
    }
  };
}

// Helper to extract a clean Spotify error message from a fetch response
async function getSpotifyErrorMessage(response, defaultMsg) {
  try {
    const errText = await response.text();
    try {
      const errJson = JSON.parse(errText);
      if (errJson && errJson.error && errJson.error.message) {
        return errJson.error.message;
      }
    } catch (_) {}
    return errText || defaultMsg || `HTTP ${response.status}`;
  } catch (e) {
    return defaultMsg || `HTTP ${response.status}`;
  }
}

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

// Helper to parse service ID and token from headers or fallback to request body/query
function getServiceConfig(req) {
  const service = req.headers['x-service-id'] || 'apple';
  const userToken = req.headers['x-user-token'] || req.query.musicUserToken || req.body.musicUserToken || req.body.spotifyAccessToken;
  return { service, userToken };
}

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

// API Route: Parse natural language prompt using Google Gemini LLM API (free tier)
router.post('/parse-prompt', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    console.warn("[parse-prompt] 400 Bad Request: Missing 'prompt' in request body.", req.body);
    return res.status(400).json({ error: "Missing required prompt parameter in request body." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[parse-prompt] 400 Bad Request: GEMINI_API_KEY environment variable is not defined on the server.");
    return res.status(400).json({ error: "AI API key is not configured on the server." });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `You are a music playlist request parser. Parse this user playlist request (which could be in any language): "${prompt}"

Extract:
- size: number of tracks requested (default to 20 if not specified).
- genres: list of music genres, styles, vibes, or time periods/decades mentioned (translated to English if in another language. Keep descriptive modifiers, styles, or decades attached to the genre/style, e.g., 'מוסיקה ישראלית של שנות ה-80' -> '80s Israeli music', 'רוק כבד' -> 'hard rock', 'chill pop' -> 'chill pop', '90s dance' -> '90s dance').
- artists: list of musicians/bands mentioned (standard English spelling/names, e.g., 'קאווינסקי' -> 'Kavinsky').
- albums: list of album titles mentioned (standard English spelling/names).
- songs: list of song titles mentioned (standard English spelling/names).

Respond ONLY with a valid JSON object matching this schema:
{
  "size": number,
  "genres": string[],
  "artists": string[],
  "albums": string[],
  "songs": string[]
}`
          }]
        }],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API returned status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) {
      throw new Error("Empty response from Gemini API");
    }

    const parsedData = JSON.parse(jsonText.trim());
    res.json(parsedData);
  } catch (error) {
    console.error("Gemini prompt parsing failed:", error.message);
    res.status(500).json({ error: `Prompt parsing failed: ${error.message}` });
  }
});

// Spotify OAuth: Login
router.get('/spotify/login', (req, res) => {
  const scope = 'playlist-modify-public playlist-modify-private playlist-read-private user-library-read';
  const state = Math.random().toString(36).substring(2, 15);
  
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: scope,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    state: state
  });
  
  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

// Spotify OAuth: Callback
router.get('/spotify/callback', async (req, res) => {
  const code = req.query.code || null;

  if (code === null) {
    return res.redirect('/#spotify_error=state_mismatch');
  }

  try {
    const params = new URLSearchParams({
      code: code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Spotify token exchange returned status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const accessToken = data.access_token;
    const refreshToken = data.refresh_token;
    const expiresIn = data.expires_in;

    const frontendUrl = process.env.NODE_ENV === 'production' 
      ? '/' 
      : 'http://localhost:5173/';
      
    res.redirect(`${frontendUrl}?spotify_access_token=${accessToken}&spotify_refresh_token=${refreshToken}&spotify_expires_in=${expiresIn}`);
  } catch (error) {
    console.error("Spotify token exchange failed:", error.message);
    res.redirect(`/#spotify_error=${encodeURIComponent(error.message)}`);
  }
});

// Spotify OAuth: Refresh Token
router.get('/spotify/refresh', async (req, res) => {
  const { refresh_token } = req.query;
  if (!refresh_token) {
    return res.status(400).json({ error: "Missing refresh_token query parameter." });
  }

  try {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refresh_token
    });

    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Spotify token refresh returned status ${response.status}: ${errText}`);
    }

    const data = await response.json();
    res.json({
      access_token: data.access_token,
      expires_in: data.expires_in,
      refresh_token: data.refresh_token || refresh_token
    });
  } catch (error) {
    console.error("Spotify token refresh failed:", error.message);
    res.status(500).json({ error: `Token refresh failed: ${error.message}` });
  }
});

// Mount router on both direct and netlify function paths
app.use('/api', router);
app.use('/.netlify/functions/api', router);

// Serve frontend build output when running in production environment
if (process.env.NODE_ENV === 'production' && !process.env.NETLIFY) {
  app.use(express.static(path.resolve('dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve('dist/index.html'));
  });
}

// Startup
if (process.env.NODE_ENV !== 'production' || !process.env.NETLIFY) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`MakeMyPlaylist secure backend server running on http://localhost:${PORT}`);
  });
}

export default app;
