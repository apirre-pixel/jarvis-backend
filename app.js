/* ═══════════════════════════════════════════════════
   J.A.R.V.I.S v1.12 — Main Application Logic
   ═══════════════════════════════════════════════════ */
(() => {
  /* ── State ──────────────────────────────────────── */
  let messages   = [];
  let streaming  = false;
  let waveform   = null;
  let voice      = null;
  let cameraStream = null;
  let cameraVideo  = null;
  let cameraStatus = null;
  let detectionModel = null;
  let detectorReady = false;

  /* ── Boot ───────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    waveform = new WaveformVisualizer('waveform-canvas');
    voice    = new VoiceModule(waveform);

    voice.onResult = (text) => {
      const inp = $('chat-input');
      inp.value = text;
      autoResize(inp);
      setTimeout(sendMessage, 250);
    };
    voice.onError = (code, detail) => {
      if (code === 'mic_denied') {
        toast('Acceso al micrófono denegado' + (detail ? `: ${detail}` : ''), 'error');
      } else if (code === 'stt_failed') {
        toast('Falló el reconocimiento de voz' + (detail ? `: ${detail}` : ''), 'error');
      } else {
        toast('Error de micrófono: ' + code + (detail ? ` (${detail})` : ''), 'error');
      }
    };

    cameraVideo  = $('camera-video');
    cameraStatus = $('camera-status');

    initParticles();
    initClock();
    initMetrics();
    initDate();
    bindEvents();
    loadSettings();
    initObjectDetector();

    $('boot-time').textContent = fmtTime(new Date());
  });

  /* ── Helpers ─────────────────────────────────────── */
  const $ = id => document.getElementById(id);
  const fmtTime = d => d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  const esc = s => { const d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; };

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 110) + 'px';
  }

  function scrollBottom() {
    const c = $('chat-messages');
    c.scrollTop = c.scrollHeight;
  }

  /* ── Toast ───────────────────────────────────────── */
  function toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    $('toast-container').appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  /* ── Clock / Date ────────────────────────────────── */
  function initClock() {
    const tick = () => {
      const now = new Date();
      $('header-clock').textContent = now.toLocaleTimeString('es-ES', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    };
    tick();
    setInterval(tick, 1000);
  }

  function initDate() {
    $('panel-date').textContent = new Date().toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  /* ── Metrics animation ───────────────────────────── */
  function initMetrics() {
    const rows = document.querySelectorAll('.metric-row');
    rows.forEach(row => {
      const base = parseInt(row.dataset.base, 10) || 50;
      setBar(row, base);
    });

    setInterval(() => {
      rows.forEach(row => {
        const base    = parseInt(row.dataset.base, 10) || 50;
        const delta   = (Math.random() - 0.5) * 18;
        const newVal  = Math.max(8, Math.min(97, base + delta));
        setBar(row, newVal);
      });
    }, 2200);
  }

  function setBar(row, pct) {
    row.querySelector('.mfill').style.width = pct + '%';
    row.querySelector('.mv').textContent    = Math.round(pct) + '%';
  }

  /* ── Particles / Background ──────────────────────── */
  function initParticles() {
    const canvas = $('bg-canvas');
    const ctx    = canvas.getContext('2d');
    let W, H;

    const resize = () => {
      canvas.width  = W = window.innerWidth;
      canvas.height = H = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const N = 70;
    const pts = Array.from({ length: N }, () => ({
      x:  Math.random() * window.innerWidth,
      y:  Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r:  Math.random() * 1.4 + 0.4,
      a:  Math.random() * 0.35 + 0.08,
      c:  Math.random() > 0.65 ? '#0066ff' : '#00d4ff',
    }));

    const LINK_DIST = 110;

    (function frame() {
      requestAnimationFrame(frame);
      ctx.clearRect(0, 0, W, H);

      // Subtle grid
      ctx.strokeStyle = 'rgba(0,212,255,0.025)';
      ctx.lineWidth   = 1;
      const gs = 70;
      for (let x = 0; x < W + gs; x += gs) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
      for (let y = 0; y < H + gs; y += gs) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      // Particles + links
      pts.forEach((p, i) => {
        p.x = (p.x + p.vx + W) % W;
        p.y = (p.y + p.vy + H) % H;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.c + Math.floor(p.a * 255).toString(16).padStart(2, '0');
        ctx.fill();

        for (let j = i + 1; j < N; j++) {
          const q  = pts[j];
          const dx = p.x - q.x, dy = p.y - q.y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < LINK_DIST) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(0,212,255,${(1 - d / LINK_DIST) * 0.07})`;
            ctx.lineWidth   = 0.5;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
      });
    })();
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast('Tu navegador no soporta cámara.', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      cameraStream = stream;
      cameraVideo.srcObject = stream;
      cameraVideo.play().catch(() => {});
      $('btn-camera').textContent = 'DETENER CÁMARA';
      cameraStatus.textContent = 'Cámara activa. Pulsa ESCANEAR para analizar el entorno.';
    } catch (err) {
      console.error('[CAM]', err);
      toast('No se pudo iniciar la cámara: ' + (err.message || 'error desconocido'), 'error');
    }
  }

  function stopCamera() {
    if (!cameraStream) return;
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
    cameraVideo.srcObject = null;
    $('btn-camera').textContent = 'INICIAR CÁMARA';
    cameraStatus.textContent = 'Cámara inactiva';
  }

  async function initObjectDetector() {
    if (!window.cocoSsd) {
      toast('Detector de objetos no disponible.', 'info');
      return;
    }

    cameraStatus.textContent = 'Cargando modelo de detección...';
    try {
      detectionModel = await cocoSsd.load();
      detectorReady = true;
      cameraStatus.textContent = 'Cámara inactiva';
      toast('Detector de objetos listo.', 'success');
    } catch (err) {
      console.error('[DETECTOR]', err);
      cameraStatus.textContent = 'Cámara inactiva';
      toast('No se pudo cargar el detector de objetos.', 'error');
    }
  }

  async function scanEnvironment() {
    if (!cameraStream) {
      toast('Activa la cámara primero.', 'error');
      return;
    }
    if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
      toast('Espera a que la cámara esté lista.', 'error');
      return;
    }

    const canvas = document.createElement('canvas');
    const width  = Math.min(320, cameraVideo.videoWidth);
    const height = Math.round(width * (cameraVideo.videoHeight / cameraVideo.videoWidth));
    canvas.width  = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(cameraVideo, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;

    let r = 0, g = 0, b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const pixels = data.length / 4;
    const avgR = r / pixels;
    const avgG = g / pixels;
    const avgB = b / pixels;
    const brightness = (avgR + avgG + avgB) / 3;

    const lightLevel = brightness > 180 ? 'muy iluminado' : brightness > 110 ? 'bien iluminado' : 'oscuro';
    const dominantColor = avgR > avgG && avgR > avgB ? 'rojo' : avgG >= avgR && avgG > avgB ? 'verde' : 'azul';

    let objectObservation = '';
    if (detectorReady && detectionModel) {
      try {
        const predictions = await detectionModel.detect(cameraVideo);
        const visible = predictions
          .filter(p => p.score > 0.35)
          .map(p => p.class)
          .filter((v, i, a) => a.indexOf(v) === i);

        if (visible.length) {
          if (visible.includes('remote')) {
            objectObservation = 'Parece que hay un mando o control remoto en la escena.';
          } else {
            objectObservation = `Detectado: ${visible.join(', ')}.`;
          }
        }
      } catch (err) {
        console.warn('[DETECTOR]', err);
      }
    }

    const observation = `Entorno ${lightLevel} con dominante ${dominantColor}.` + (objectObservation ? ` ${objectObservation}` : '');

    cameraStatus.textContent = 'Entorno detectado: ' + observation;
    toast('Entorno escaneado: ' + lightLevel, 'info');

    messages.push({ role: 'user', content: `Analiza este entorno: ${observation}` });
    appendMsg('user', `Escaneo de cámara: ${observation}`);
    addRecent(`Escaneo de cámara: ${observation}`);
    await fetchResponse();
  }

  /* ── Events ─────────────────────────────────────── */
  function bindEvents() {
    const input      = $('chat-input');
    const sendBtn    = $('btn-send');
    const micBtn     = $('btn-mic');
    const settingsBtn= $('settings-btn');
    const modal      = $('settings-modal');
    const modalClose = $('modal-close');
    const saveKeyBtn = $('btn-save-key');
    const clearBtn   = $('btn-clear');
    const ttsToggle  = $('tts-toggle');
    const camBtn     = $('btn-camera');
    const scanBtn    = $('btn-camera-scan');

    // Send
    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    input.addEventListener('input', () => autoResize(input));

    // Mic toggle
    micBtn.addEventListener('click', () => {
      if (voice.isListening) voice.stopListening();
      else voice.startListening();
    });

    // Settings modal
    settingsBtn.addEventListener('click', () => modal.classList.remove('hidden'));
    modalClose.addEventListener('click',  () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

    // Save API key
    saveKeyBtn.addEventListener('click', () => {
      const key = $('api-key-input').value.trim();
      if (!key) { toast('Introduce una API Key válida', 'error'); return; }
      localStorage.setItem('jarvis_api_key', key);
      toast('API Key guardada correctamente', 'success');
      modal.classList.add('hidden');
    });

    // Clear chat
    clearBtn.addEventListener('click', () => {
      messages = [];
      $('chat-messages').innerHTML = `
        <div class="msg msg-jarvis">
          <div class="msg-avatar">J</div>
          <div class="msg-body">
            <div class="msg-meta">
              <span class="msg-name">J.A.R.V.I.S</span>
              <span class="msg-time">${fmtTime(new Date())}</span>
            </div>
            <div class="msg-text">Conversación reiniciada. ¿En qué puedo asistirle, Señor?</div>
          </div>
        </div>`;
      $('recent-list').innerHTML = '<span class="empty-hint">Sin historial</span>';
      modal.classList.add('hidden');
      toast('Chat limpiado', 'info');
    });

    // TTS toggle
    ttsToggle.addEventListener('change', () => {
      voice.setTTS(ttsToggle.checked);
      localStorage.setItem('jarvis_tts', ttsToggle.checked);
    });

    camBtn?.addEventListener('click', () => cameraStream ? stopCamera() : startCamera());
    scanBtn?.addEventListener('click', scanEnvironment);
  }

  /* ── Settings persistence ────────────────────────── */
  function loadSettings() {
    const savedTTS = localStorage.getItem('jarvis_tts');
    if (savedTTS !== null) {
      const on = savedTTS === 'true';
      $('tts-toggle').checked = on;
      voice.setTTS(on);
    }
    const savedKey = localStorage.getItem('jarvis_api_key');
    if (savedKey) $('api-key-input').value = savedKey;
  }

  /* ── Send message ────────────────────────────────── */
  async function sendMessage() {
    const input = $('chat-input');
    const text  = input.value.trim();
    if (!text || streaming) return;

    input.value = '';
    autoResize(input);

    messages.push({ role: 'user', content: text });
    appendMsg('user', text);
    addRecent(text);

    await fetchResponse();
  }

  /* ── Stream response ─────────────────────────────── */
  async function fetchResponse() {
    streaming = true;
    $('btn-send').disabled = true;
    voice.stopSpeaking();

    const thinkEl = appendThinking();

    try {
      const key = localStorage.getItem('jarvis_api_key');
      const headers = { 'Content-Type': 'application/json' };
      if (key) headers['X-API-Key'] = key;

      const resp = await fetch('/api/chat', {
        method:  'POST',
        headers,
        body: JSON.stringify({ messages }),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      thinkEl.remove();

      const { textEl } = appendStreamMsg();
      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let full = '', buf = '', sentenceBuf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') break;
          try {
            const { content, error } = JSON.parse(raw);
            if (error) throw new Error(error);
            if (content) {
              full += content;
              sentenceBuf += content;
              textEl.textContent = full;
              textEl.classList.add('streaming');
              scrollBottom();
              
              // Split into sentences
              const splitRegex = /([.!?\n]+(?:\s+|$))/;
              const parts = sentenceBuf.split(splitRegex);
              if (parts.length > 2) {
                 sentenceBuf = parts.pop();
                 let readySentence = '';
                 for(let i=0; i < parts.length; i+=2) {
                    readySentence += parts[i] + (parts[i+1] || '');
                 }
                 if (readySentence.trim()) {
                     voice.speak(readySentence.trim());
                 }
              }
            }
          } catch (_) { /* skip parse errors */ }
        }
      }

      textEl.classList.remove('streaming');
      messages.push({ role: 'assistant', content: full });
      if (sentenceBuf.trim()) {
          voice.speak(sentenceBuf.trim());
      }

    } catch (err) {
      thinkEl?.remove();
      console.error('[JARVIS]', err);
      appendMsg('jarvis', `⚠ Error: ${err.message}\n\nVerifica tu API Key en Configuración ⚙`);
    } finally {
      streaming = false;
      $('btn-send').disabled = false;
    }
  }

  /* ── DOM helpers ─────────────────────────────────── */
  function appendMsg(role, text) {
    const isJ  = role === 'jarvis';
    const div  = document.createElement('div');
    div.className = `msg msg-${isJ ? 'jarvis' : 'user'}`;
    div.innerHTML = `
      <div class="msg-avatar">${isJ ? 'J' : 'U'}</div>
      <div class="msg-body">
        <div class="msg-meta">
          <span class="msg-name">${isJ ? 'J.A.R.V.I.S' : 'Tú'}</span>
          <span class="msg-time">${fmtTime(new Date())}</span>
        </div>
        <div class="msg-text">${esc(text)}</div>
      </div>`;
    $('chat-messages').appendChild(div);
    scrollBottom();
    return div;
  }

  function appendStreamMsg() {
    const div = document.createElement('div');
    div.className = 'msg msg-jarvis';
    div.innerHTML = `
      <div class="msg-avatar">J</div>
      <div class="msg-body">
        <div class="msg-meta">
          <span class="msg-name">J.A.R.V.I.S</span>
          <span class="msg-time">${fmtTime(new Date())}</span>
        </div>
        <div class="msg-text streaming"></div>
      </div>`;
    $('chat-messages').appendChild(div);
    scrollBottom();
    return { msgEl: div, textEl: div.querySelector('.msg-text') };
  }

  function appendThinking() {
    const div = document.createElement('div');
    div.className = 'msg msg-jarvis';
    div.innerHTML = `
      <div class="msg-avatar">J</div>
      <div class="msg-body">
        <div class="msg-meta">
          <span class="msg-name">J.A.R.V.I.S</span>
          <span class="msg-time">${fmtTime(new Date())}</span>
        </div>
        <div class="thinking"><span></span><span></span><span></span></div>
      </div>`;
    $('chat-messages').appendChild(div);
    scrollBottom();
    return div;
  }

  function addRecent(text) {
    const container = $('recent-list');
    container.querySelector('.empty-hint')?.remove();

    const item = document.createElement('div');
    item.className = 'cmd-item';
    item.title     = text;
    item.textContent = text.length > 32 ? text.slice(0, 32) + '…' : text;
    container.insertBefore(item, container.firstChild);

    // Keep max 6
    const items = container.querySelectorAll('.cmd-item');
    if (items.length > 6) items[items.length - 1].remove();
  }

})();
