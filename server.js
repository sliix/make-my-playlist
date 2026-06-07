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

// API Route: Proxy Catalog searches to keep Developer Token invisible
router.get('/search', async (req, res) => {
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
  const { id } = req.params;
  const { storefront = 'us' } = req.query;
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
  const { id } = req.params;
  const { storefront = 'us' } = req.query;
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
  const { name, description, musicUserToken } = req.body;
  if (!musicUserToken) {
    return res.status(400).json({ error: "Missing required Music-User-Token in request body." });
  }

  try {
    const token = generateDeveloperToken('2m');
    const url = 'https://api.music.apple.com/v1/me/library/playlists';
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Music-User-Token': musicUserToken,
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
  const { tracks, musicUserToken } = req.body;
  if (!musicUserToken || !tracks) {
    return res.status(400).json({ error: "Missing musicUserToken or tracks array in request body." });
  }

  try {
    const token = generateDeveloperToken('2m');
    const url = `https://api.music.apple.com/v1/me/library/playlists/${id}/tracks`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Music-User-Token': musicUserToken,
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
  const { name, description, musicUserToken } = req.body;
  if (!musicUserToken) {
    return res.status(400).json({ error: "Missing required Music-User-Token in request body." });
  }

  try {
    const token = generateDeveloperToken('2m');
    const url = `https://api.music.apple.com/v1/me/library/playlists/${id}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Music-User-Token': musicUserToken,
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
  const { musicUserToken } = req.query;
  if (!musicUserToken) {
    return res.status(400).json({ error: "Missing required Music-User-Token query parameter." });
  }

  try {
    const token = generateDeveloperToken('2m');
    const url = 'https://api.music.apple.com/v1/me/library/playlists?limit=100';
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Music-User-Token': musicUserToken
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
  const { musicUserToken } = req.query;
  if (!musicUserToken) {
    return res.status(400).json({ error: "Missing required Music-User-Token query parameter." });
  }

  try {
    const token = generateDeveloperToken('2m');
    const url = `https://api.music.apple.com/v1/me/library/playlists/${id}/tracks?limit=100&include=catalog`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Music-User-Token': musicUserToken
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
    return res.status(400).json({ error: "Gemini API key is not configured on the server." });
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
