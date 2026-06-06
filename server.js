process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const path = require('path');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are J.A.R.V.I.S (Just A Rather Very Intelligent System), the AI assistant originally created by Tony Stark, now serving the user. You are sophisticated, highly intelligent, and occasionally witty. You speak concisely but with precision and intelligence. You occasionally address the user as "Sir" or "Señor" depending on the language they use. You always detect the user's language and respond in the same language. You are an expert across all domains — science, technology, analysis, creativity, problem solving. Keep responses concise and impactful unless the user asks for more detail. Never mention being an AI or a language model — you are J.A.R.V.I.S.`;

// Helper: get API key from env or request header
function getApiKey(req) {
  return req.headers['x-api-key'] || process.env.GROQ_API_KEY;
}

// ── Chat endpoint with SSE streaming ──────────────
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid request: messages array required' });
  }

  const apiKey = getApiKey(req);
  if (!apiKey) {
    return res.status(401).json({ error: 'No API key configured' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const groq = new Groq({ apiKey });

    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      stream: true,
      max_tokens: 1024,
      temperature: 0.75,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[JARVIS ERROR]', err);
    res.write(`data: ${JSON.stringify({ error: err.message || err.toString() })}\n\n`);
    res.end();
  }
});

// ── ElevenLabs TTS endpoint ──────────────────────────
app.post('/api/tts', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided' });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    return res.status(500).json({ error: 'ElevenLabs credentials not configured' });
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=2`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`API error: ${response.status} - ${errText}`);
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[TTS ERROR]', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Status endpoint ────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.12',
    model: 'llama-3.3-70b-versatile',
    timestamp: new Date().toISOString(),
  });
});

// ── Start ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
⚡ ─────────────────────────────────── ⚡
   J.A.R.V.I.S  v1.12  —  Online
   http://localhost:${PORT}
⚡ ─────────────────────────────────── ⚡
  `);
});
