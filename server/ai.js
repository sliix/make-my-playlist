import {
  fetchSimilarArtists,
  searchTrack,
  fetchSimilarTracks,
  fetchTrackInfo,
  fetchTopTracksForTag,
  fetchTopAlbums,
  fetchArtistTopTracks,
  fetchAlbumTracks
} from './lastfm.js';

// Helper to parse 'Artist Name::Album Title' format
function parseAlbumString(str) {
  const parts = str.split('::');
  if (parts.length >= 2) {
    const artist = parts[0].trim();
    const title = parts[1].trim();
    const isSimilar = artist.startsWith('*');
    const cleanArtist = isSimilar ? artist.substring(1).trim() : artist;
    return { artist: cleanArtist, title, isSimilar };
  }
  return null;
}

// Helper to parse a song name and find its artist/title on Last.fm
async function parseAndSearchSong(songQuery) {
  let cleanQuery = songQuery;
  if (cleanQuery.startsWith('*')) {
    cleanQuery = cleanQuery.substring(1).trim();
  }

  let artist = '';
  let track = cleanQuery;

  if (cleanQuery.includes(' - ')) {
    const parts = cleanQuery.split(' - ');
    artist = parts[0].trim();
    track = parts[1].trim();
  } else if (cleanQuery.includes('::')) {
    const parts = cleanQuery.split('::');
    artist = parts[0].trim();
    track = parts[1].trim();
  }

  if (artist) {
    return { artist, track };
  }

  // Search for the track on Last.fm to resolve the artist and name
  const matched = await searchTrack(cleanQuery, 1);
  if (matched) {
    return {
      artist: matched.artist,
      track: matched.name
    };
  }

  return { artist: '', track: cleanQuery };
}

// Intersect album tracks with artist's top tracks to determine the album's top song
async function getAlbumTopSong(artist, albumTitle, albumTracks) {
  if (!albumTracks || albumTracks.length === 0) return null;

  try {
    const topTracks = await fetchArtistTopTracks(artist, 50);
    if (topTracks.length > 0) {
      const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
      const albumTrackNamesNormalized = albumTracks.map(t => {
        const parts = t.split(' - ');
        const name = parts.length > 1 ? parts.slice(1).join(' - ') : t;
        return normalize(name);
      });

      for (const topTrack of topTracks) {
        const normalizedTop = normalize(topTrack);
        const index = albumTrackNamesNormalized.indexOf(normalizedTop);
        if (index !== -1) {
          const matchedTrack = albumTracks[index];
          const parts = matchedTrack.split(' - ');
          return {
            artist: parts.length > 1 ? parts[0] : artist,
            track: parts.length > 1 ? parts.slice(1).join(' - ') : matchedTrack
          };
        }
      }
    }
  } catch (err) {
    console.warn(`[Last.fm] Failed to intersect top tracks for "${artist} - ${albumTitle}":`, err.message);
  }

  // Fallback: take the first track of the album
  const firstTrackStr = albumTracks[0];
  const parts = firstTrackStr.split(' - ');
  return {
    artist: parts.length > 1 ? parts[0] : artist,
    track: parts.length > 1 ? parts.slice(1).join(' - ') : firstTrackStr
  };
}

// Main Wildcard Resolver using Last.fm API
async function resolveWildcards(parsedData) {
  // 1. Resolve size wildcard
  let targetSize = 20;
  if (parsedData.size === '*') {
    targetSize = 50; // Cap at 50 tracks
  } else if (typeof parsedData.size === 'number') {
    targetSize = parsedData.size;
  }

  // 2. Resolve Similar Artists (*Artist Name)
  if (parsedData.artists && parsedData.artists.length > 0) {
    const resolvedArtists = [];
    for (const artist of parsedData.artists) {
      if (artist.startsWith('*')) {
        const cleanArtist = artist.substring(1).trim();
        // Seed Inclusion: Add the seed artist first
        resolvedArtists.push(cleanArtist);

        // Fetch up to 10 similar artists
        const related = await fetchSimilarArtists(cleanArtist, 10);
        resolvedArtists.push(...related);
      } else {
        resolvedArtists.push(artist);
      }
    }
    parsedData.artists = [...new Set(resolvedArtists)];
  }

  // 3. Resolve Similar Songs (*Song Title)
  if (parsedData.songs && parsedData.songs.length > 0) {
    const resolvedSongs = [];
    for (const song of parsedData.songs) {
      if (song.startsWith('*')) {
        const { artist, track } = await parseAndSearchSong(song);
        if (artist && track) {
          // Seed Inclusion: Add the seed song first (formatted standard)
          resolvedSongs.push(`${artist} - ${track}`);

          // Fetch up to 15 similar tracks
          const similar = await fetchSimilarTracks(artist, track, 15);
          resolvedSongs.push(...similar);
        } else {
          resolvedSongs.push(song.substring(1).trim());
        }
      } else {
        resolvedSongs.push(song);
      }
    }
    parsedData.songs = [...new Set(resolvedSongs)];
  }

  // 4. Resolve Similar Genres (*genre)
  if (parsedData.genres && parsedData.genres.length > 0) {
    const resolvedGenres = [];
    for (const genre of parsedData.genres) {
      if (genre.startsWith('*')) {
        const cleanGenre = genre.substring(1).trim();
        // Seed Inclusion: Add genre to resolved list
        resolvedGenres.push(cleanGenre);

        // Fetch up to 15 tracks for the genre/tag
        const tagTracks = await fetchTopTracksForTag(cleanGenre, 15);
        if (tagTracks.length > 0) {
          parsedData.songs.push(...tagTracks);
        }
      } else {
        resolvedGenres.push(genre);
      }
    }
    parsedData.genres = [...new Set(resolvedGenres)];
  }

  // 5. Resolve Albums ('Artist Name::Album Title' and indicators)
  if (parsedData.albums && parsedData.albums.length > 0) {
    const resolvedSongsForAlbums = [];
    const remainingAlbums = [];

    for (const albumStr of parsedData.albums) {
      const parsed = parseAlbumString(albumStr);
      if (!parsed) {
        remainingAlbums.push(albumStr);
        continue;
      }

      const { artist, title, isSimilar } = parsed;

      if (isSimilar) {
        // Resolve similar albums
        const albumTracks = await fetchAlbumTracks(artist, title);
        if (albumTracks.length > 0) {
          // Seed Inclusion: Add original album tracks first
          resolvedSongsForAlbums.push(...albumTracks);

          const topSong = await getAlbumTopSong(artist, title, albumTracks);
          if (topSong) {
            // Find up to 5 similar tracks
            const similarTracks = await fetchSimilarTracks(topSong.artist, topSong.track, 5);

            // Fetch the parent album for each similar track
            const resolvedAlbums = new Set();
            for (const simTrack of similarTracks) {
              const parts = simTrack.split(' - ');
              if (parts.length >= 2) {
                const simArtist = parts[0].trim();
                const simTitle = parts.slice(1).join(' - ').trim();
                const albumName = await fetchTrackInfo(simArtist, simTitle);
                if (albumName) {
                  resolvedAlbums.add(JSON.stringify({ artist: simArtist, album: albumName }));
                }
              }
            }

            // Retrieve all tracks for each of the top 5 similar albums
            for (const albJson of resolvedAlbums) {
              const { artist: simArtist, album: simAlbum } = JSON.parse(albJson);
              const tracks = await fetchAlbumTracks(simArtist, simAlbum);
              resolvedSongsForAlbums.push(...tracks);
            }
          }
        }
      } else if (title === '[*]') {
        // All albums: Fetch artist's top albums (up to 10) and get their tracks
        const albums = await fetchTopAlbums(artist, 10);
        for (const alb of albums) {
          const tracks = await fetchAlbumTracks(artist, alb);
          resolvedSongsForAlbums.push(...tracks);
        }
      } else if (title === '[1]') {
        // Best album: Fetch top album and get its tracks
        const albums = await fetchTopAlbums(artist, 1);
        if (albums.length > 0) {
          const tracks = await fetchAlbumTracks(artist, albums[0]);
          resolvedSongsForAlbums.push(...tracks);
        }
      } else if (title.startsWith('[') && title.endsWith(']')) {
        // Top N albums: Fetch top N albums and get their tracks
        const nStr = title.substring(1, title.length - 1);
        const n = parseInt(nStr, 10);
        if (!isNaN(n)) {
          const albums = await fetchTopAlbums(artist, n);
          for (const alb of albums) {
            const tracks = await fetchAlbumTracks(artist, alb);
            resolvedSongsForAlbums.push(...tracks);
          }
        }
      } else {
        // Specific album title
        const tracks = await fetchAlbumTracks(artist, title);
        if (tracks.length > 0) {
          resolvedSongsForAlbums.push(...tracks);
        } else {
          remainingAlbums.push(albumStr);
        }
      }
    }

    parsedData.songs.push(...resolvedSongsForAlbums);
    parsedData.albums = remainingAlbums;
  }

  // Deduplicate and cap final resolved songs list
  parsedData.songs = [...new Set(parsedData.songs)];
  if (parsedData.songs.length > targetSize) {
    parsedData.songs = parsedData.songs.slice(0, targetSize);
  }
  
  parsedData.size = targetSize;
  return parsedData;
}

// API Handler: Parse natural language prompt using Google Gemini LLM API (free tier)
export async function handleParsePrompt(req, res) {
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
- size: number of tracks requested (default to 20 if not specified). If the request implies an indefinite or large quantity (e.g., "all albums," "many songs"), use "*" as the value.
- genres: list of music genres, styles, vibes, or time periods/decades mentioned (translated to English). If the request is for similar genres, or "X and similar genres", prefix with "*".
- artists: list of musicians/bands mentioned (standard English spelling/names). Do not include the artist name here if the request is specifically for an album. If the request asks for similar artists to X, or "X and similar artists", prefix with "*" (e.g., "*Pink Floyd").
- albums: list of album titles mentioned (standard English spelling/names). When an album is requested, format as 'Artist Name::Album Title'. If requesting "all albums", use '[*]'. If requesting "best album", use '[1]'. If requesting a specific number of albums, use '[n]' where n is the number. If the request is for similar albums, prefix with "*".
- songs: list of song titles mentioned (standard English spelling/names). If the request asks for similar songs to X, or "X and similar songs", prefix with "*" (e.g., "*Get Lucky").

Respond ONLY with a valid JSON object matching this schema:
{
  "size": number or "*",
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

    if (process.env.NODE_ENV !== 'production') {
      console.log("[parse-prompt] Raw LLM parsed JSON:", JSON.stringify(parsedData, null, 2));
    }

    // Resolve wildcards and similarities on the server before returning
    const resolvedData = await resolveWildcards(parsedData);

    if (process.env.NODE_ENV !== 'production') {
      console.log("[parse-prompt] Resolved AI metadata JSON:", JSON.stringify(resolvedData, null, 2));
    }

    res.json(resolvedData);
  } catch (error) {
    console.error("Gemini prompt parsing failed:", error.message);
    res.status(500).json({ error: `Prompt parsing failed: ${error.message}` });
  }
}
