process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const https = require('https');
const multer = require('multer');
const fs = require('fs');
const os = require('os');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT = `You are J.A.R.V.I.S (Just A Rather Very Intelligent System), the AI assistant originally created by Tony Stark, now serving the user. You are sophisticated, highly intelligent, and occasionally witty. You speak concisely but with precision and intelligence. You occasionally address the user as "Sir" or "Señor" depending on the language they use. You always detect the user's language and respond in the same language. You are an expert across all domains — science, technology, analysis, creativity, problem solving. Keep responses concise and impactful unless the user asks for more detail. Never mention being an AI or a language model — you are J.A.R.V.I.S.`;

// ── Chat endpoint with SSE streaming (Gemini) ──────
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid request: messages array required' });
  }

  const apiKey = process.env.GEMINI_API_KEY || req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({ error: 'No Gemini API key configured' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    });

    // Gemini uses 'user' and 'model' roles; history excludes last message
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const lastMessage = messages[messages.length - 1].content;

    const chat = model.startChat({ history });
    const result = await chat.sendMessageStream(lastMessage);

    for await (const chunk of result.stream) {
      const content = chunk.text();
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('[JARVIS GEMINI ERROR]', err.message);
    let userMsg = err.message || err.toString();
    if (err.message?.includes('429') || err.message?.includes('quota')) {
      userMsg = 'Cupo de Gemini agotado. Espera unos minutos e intenta de nuevo.';
    } else if (err.message?.includes('401') || err.message?.includes('API key')) {
      userMsg = 'GEMINI_API_KEY inválida o no configurada en el servidor.';
    }
    res.write(`data: ${JSON.stringify({ error: userMsg })}\n\n`);
    res.end();
  }
});

// ── ElevenLabs TTS endpoint ──────────────────────────
app.post('/api/tts', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided' });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  console.log('[TTS] API Key present:', !!apiKey, '| Voice ID:', voiceId);

  if (!apiKey || !voiceId) {
    return res.status(500).json({ error: 'ElevenLabs credentials not configured. Check .env file.' });
  }

  try {
    // Use https module to bypass TLS issues in Node
    const postData = JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75
      }
    });

    const audioBuffer = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.elevenlabs.io',
        path: `/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=2`,
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        },
        rejectUnauthorized: false
      };

      const chunks = [];
      const request = https.request(options, (response) => {
        console.log('[TTS] ElevenLabs response status:', response.statusCode);
        if (response.statusCode !== 200) {
          let errBody = '';
          response.on('data', d => errBody += d);
          response.on('end', () => reject(new Error(`ElevenLabs ${response.statusCode}: ${errBody}`)));
          return;
        }
        response.on('data', chunk => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
      });

      request.on('error', reject);
      request.write(postData);
      request.end();
    });

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.send(audioBuffer);

  } catch (err) {
    console.error('[TTS ERROR]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Groq Whisper STT endpoint ─────────────────────
app.post('/api/stt', upload.single('audio'), async (req, res) => {
  const tmpPath = path.join(os.tmpdir(), `jarvis-stt-${Date.now()}.webm`);
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file received' });

    const apiKey = getApiKey(req);
    if (!apiKey) return res.status(401).json({ error: 'No API key configured' });

    fs.writeFileSync(tmpPath, req.file.buffer);

    const groq = new Groq({ apiKey });
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: 'whisper-large-v3-turbo',
      response_format: 'json',
    });

    res.json({ text: transcription.text });
  } catch (err) {
    console.error('[STT ERROR]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
  }
});

// ── Status endpoint ────────────────────────────────
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.12',
    model: 'gemini-1.5-flash',
    gemini: !!process.env.GEMINI_API_KEY,
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// ── Start ──────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n⚡ ─────────────────────────────────── ⚡`);
  console.log(`   J.A.R.V.I.S  v1.12  —  Online`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Gemini Key: ${process.env.GEMINI_API_KEY ? '✅ configurada' : '❌ NO ENCONTRADA'}`);
  console.log(`   ElevenLabs Key: ${process.env.ELEVENLABS_API_KEY ? '✅ configurada' : '❌ NO ENCONTRADA'}`);
  console.log(`⚡ ─────────────────────────────────── ⚡\n`);
});
