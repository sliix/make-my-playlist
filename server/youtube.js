import { URLSearchParams } from 'url';

// Normalize YouTube search video result to standard MakeMyPlaylist format
export function mapYoutubeVideoToStandard(item) {
  if (!item || !item.id || item.id.kind !== 'youtube#video' || !item.id.videoId) return null;
  const videoId = item.id.videoId;
  const snippet = item.snippet || {};
  const artworkUrl = snippet.thumbnails && snippet.thumbnails.high ? snippet.thumbnails.high.url : 
                     (snippet.thumbnails && snippet.thumbnails.default ? snippet.thumbnails.default.url : '');

  // Strip the ' - Topic' suffix YouTube appends to auto-generated artist Topic channels
  const rawChannel = snippet.channelTitle || 'Unknown Creator';
  const artistName = rawChannel.endsWith(' - Topic') ? rawChannel.slice(0, -' - Topic'.length).trim() : rawChannel;

  return {
    id: videoId,
    type: 'songs',
    attributes: {
      name: snippet.title || 'Unknown Title',
      artistName,
      albumName: '', // YouTube Data API v3 doesn't return album names in search
      durationInMillis: 0, // Fallback, search does not include durations
      artwork: {
        url: artworkUrl
      },
      previews: [{ url: `youtube:${videoId}` }],
      isExplicit: false
    }
  };
}

// Normalize YouTube playlist item track to standard format
export function mapYoutubePlaylistItemToStandard(item) {
  if (!item || !item.snippet || !item.snippet.resourceId || item.snippet.resourceId.kind !== 'youtube#video') return null;
  const videoId = item.snippet.resourceId.videoId;
  const snippet = item.snippet || {};
  const artworkUrl = snippet.thumbnails && snippet.thumbnails.high ? snippet.thumbnails.high.url : 
                     (snippet.thumbnails && snippet.thumbnails.default ? snippet.thumbnails.default.url : '');

  return {
    id: videoId,
    type: 'songs',
    attributes: {
      name: snippet.title || 'Unknown Title',
      artistName: snippet.videoOwnerChannelTitle || snippet.channelTitle || 'Unknown Creator',
      albumName: '',
      durationInMillis: 0,
      artwork: {
        url: artworkUrl
      },
      previews: [{ url: `youtube:${videoId}` }],
      isExplicit: false
    }
  };
}

// Normalize YouTube playlist metadata to standard format
export function mapYoutubePlaylistToStandard(playlist) {
  if (!playlist || !playlist.id) return null;
  const snippet = playlist.snippet || {};
  return {
    id: playlist.id,
    type: 'playlists',
    attributes: {
      name: snippet.title || 'Untitled Playlist',
      description: snippet.description || ''
    }
  };
}

// Google OAuth: Redirect User to Google Authentication URL
export function handleYoutubeLogin(req, res) {
  const scope = 'https://www.googleapis.com/auth/youtube';
  const state = Math.random().toString(36).substring(2, 15);

  const params = new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID,
    redirect_uri: process.env.YOUTUBE_REDIRECT_URI,
    response_type: 'code',
    scope: scope,
    access_type: 'offline', // Requests refresh_token
    prompt: 'consent',       // Forces approval prompt to ensure refresh_token is sent
    state: state
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

// Google OAuth: Handle Callback & Redirect to Frontend with query params
export async function handleYoutubeCallback(req, res) {
  const code = req.query.code || null;

  const frontendUrl = process.env.NODE_ENV === 'production' 
    ? '/' 
    : 'http://localhost:5173/';

  if (code === null) {
    return res.redirect(`${frontendUrl}#youtube_error=auth_failed`);
  }

  try {
    const params = new URLSearchParams({
      code: code,
      client_id: process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      redirect_uri: process.env.YOUTUBE_REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error_description || data.error || 'Token exchange failed');
    }

    const { access_token, refresh_token, expires_in } = data;

    // Redirect user back to frontend client dashboard
    const redirectUrl = `${frontendUrl}#youtube_access_token=${access_token}&youtube_refresh_token=${refresh_token || ''}&youtube_expires_in=${expires_in}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("Google OAuth token exchange failed:", error.message);
    res.redirect(`${frontendUrl}#youtube_error=${encodeURIComponent(error.message)}`);
  }
}

// Google OAuth: Refresh Access Token
export async function handleYoutubeRefresh(req, res) {
  const refreshToken = req.query.refresh_token;

  if (!refreshToken) {
    return res.status(400).json({ error: "Missing refresh_token parameter" });
  }

  try {
    const params = new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error_description || data.error || 'Token refresh failed');
    }

    res.json({
      access_token: data.access_token,
      expires_in: data.expires_in
    });
  } catch (error) {
    console.error("Google OAuth token refresh failed:", error.message);
    res.status(500).json({ error: error.message });
  }
}
