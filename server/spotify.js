// Spotify Mapping Helper Functions to standardise catalog format
export function mapSpotifyTrackToStandard(track) {
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

export function mapSpotifyPlaylistToStandard(playlist) {
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

export function mapSpotifyAlbumToStandard(album) {
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
export async function getSpotifyErrorMessage(response, defaultMsg) {
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

// Spotify OAuth: Login
export function handleSpotifyLogin(req, res) {
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
}

// Spotify OAuth: Callback
export async function handleSpotifyCallback(req, res) {
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

    const frontendUrl = (process.env.NODE_ENV === 'production' || process.env.NETLIFY)
      ? '/'
      : 'http://localhost:5173/';
      
    res.redirect(`${frontendUrl}?spotify_access_token=${accessToken}&spotify_refresh_token=${refreshToken}&spotify_expires_in=${expiresIn}`);
  } catch (error) {
    console.error("Spotify token exchange failed:", error.message);
    res.redirect(`/#spotify_error=${encodeURIComponent(error.message)}`);
  }
}

// Spotify OAuth: Refresh Token
export async function handleSpotifyRefresh(req, res) {
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
}

// Spotify Client Credentials flow cache
let clientCredentialsToken = null;
let clientCredentialsTokenExpiresAt = 0;

export async function getSpotifyClientCredentialsToken() {
  if (clientCredentialsToken && Date.now() < clientCredentialsTokenExpiresAt) {
    return clientCredentialsToken;
  }

  console.log("Spotify client credentials token missing or expired, fetching a new one...");
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(process.env.SPOTIFY_CLIENT_ID + ':' + process.env.SPOTIFY_CLIENT_SECRET).toString('base64')
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Spotify client credentials fetch failed with status ${response.status}: ${errText}`);
  }

  const data = await response.json();
  clientCredentialsToken = data.access_token;
  clientCredentialsTokenExpiresAt = Date.now() + (data.expires_in * 1000) - (60 * 1000); // 1 minute buffer
  return clientCredentialsToken;
}

