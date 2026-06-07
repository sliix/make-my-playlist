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
}
