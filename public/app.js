/* ═══════════════════════════════════════════════════
   J.A.R.V.I.S v1.12 — Main Application Logic
   ═══════════════════════════════════════════════════ */
(() => {
  /* ── State ──────────────────────────────────────── */
  let messages   = [];
  let streaming  = false;
  let waveform   = null;
  let voice      = null;

  const MEMORY_KEY   = 'jarvis_memory';
  const MAX_MESSAGES = 40;

  /* ── Memory helpers ─────────────────────────────── */
  function saveMemory() {
    const trimmed = messages.slice(-MAX_MESSAGES);
    localStorage.setItem(MEMORY_KEY, JSON.stringify(trimmed));
  }

  function loadMemory() {
    try {
      const raw = localStorage.getItem(MEMORY_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!Array.isArray(saved) || saved.length === 0) return;

      messages = saved;

      const container = $('chat-messages');
      container.innerHTML = '';

      saved.forEach(m => {
        const role = m.role === 'user' ? 'user' : 'jarvis';
        const div  = document.createElement('div');
        div.className = `msg msg-${role === 'jarvis' ? 'jarvis' : 'user'}`;
        div.innerHTML = `
          <div class="msg-avatar">${role === 'jarvis' ? 'J' : 'U'}</div>
          <div class="msg-body">
            <div class="msg-meta">
              <span class="msg-name">${role === 'jarvis' ? 'J.A.R.V.I.S' : 'Tú'}</span>
            </div>
            <div class="msg-text">${esc(m.content)}</div>
          </div>`;
        container.appendChild(div);
      });

      const recent = saved.filter(m => m.role === 'user').slice(-6).reverse();
      const recentList = $('recent-list');
      recentList.innerHTML = '';
      recent.forEach(m => {
        const item = document.createElement('div');
        item.className  = 'cmd-item';
        item.title      = m.content;
        item.textContent = m.content.length > 32 ? m.content.slice(0, 32) + '…' : m.content;
        recentList.appendChild(item);
      });

      scrollBottom();
    } catch (_) {
      localStorage.removeItem(MEMORY_KEY);
    }
  }

  function clearMemory() {
    localStorage.removeItem(MEMORY_KEY);
    messages = [];
  }

  /* ── Boot ───────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', () => {
    waveform = new WaveformVisualizer('waveform-canvas');
    voice    = new VoiceModule(waveform);

    // Expose toast globally so BackgroundMode can use it
    window._jarvisToast = toast;

    voice.onResult = (text) => {
      const inp = $('chat-input');
      inp.value = text;
      autoResize(inp);
      setTimeout(sendMessage, 250);
    };
    voice.onError = (code) => {
      if (code === 'mic_denied') toast('Acceso al micrófono denegado', 'error');
      else toast('Error de micrófono: ' + code, 'error');
    };

    // Background mode — injects command into chat and sends
    const bgMode = new BackgroundMode(voice, (text) => {
      const inp = $('chat-input');
      inp.value = text;
      autoResize(inp);
      toast(`"${text}"`, 'info');
      setTimeout(sendMessage, 200);
    });

    $('btn-background')?.addEventListener('click', () => bgMode.toggle());

    initParticles();
    initClock();
    initMetrics();
    initDate();
    bindEvents();
    loadSettings();
    loadMemory();

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
      clearMemory();
      $('chat-messages').innerHTML = `
        <div class="msg msg-jarvis">
          <div class="msg-avatar">J</div>
          <div class="msg-body">
            <div class="msg-meta">
              <span class="msg-name">J.A.R.V.I.S</span>
              <span class="msg-time">${fmtTime(new Date())}</span>
            </div>
            <div class="msg-text">Memoria borrada. Empezamos desde cero, Señor.</div>
          </div>
        </div>`;
      $('recent-list').innerHTML = '<span class="empty-hint">Sin historial</span>';
      modal.classList.add('hidden');
      toast('Memoria borrada', 'info');
    });

    // TTS toggle
    ttsToggle.addEventListener('change', () => {
      voice.setTTS(ttsToggle.checked);
      localStorage.setItem('jarvis_tts', ttsToggle.checked);
    });
  }

  /* ── Settings persistence ────────────────────────── */
  function loadSettings() {
    const savedTTS = localStorage.getItem('jarvis_tts');
    if (savedTTS !== null) {
      const on = savedTTS === 'true';
      $('tts-toggle').checked = on;
      voice.setTTS(on);
    }
    localStorage.removeItem('jarvis_api_key');
    loadContacts();
  }

  /* ── WhatsApp contacts ───────────────────────────── */
  const WA_KEY = 'jarvis_wa_contacts';

  function getContacts() {
    try { return JSON.parse(localStorage.getItem(WA_KEY) || '[]'); }
    catch { return []; }
  }

  function saveContacts(list) {
    localStorage.setItem(WA_KEY, JSON.stringify(list));
  }

  function loadContacts() {
    const list = $('contact-list');
    if (!list) return;
    const contacts = getContacts();
    list.innerHTML = contacts.length ? '' : '<span class="empty-hint">Sin contactos</span>';
    contacts.forEach((c, i) => {
      const row = document.createElement('div');
      row.className = 'contact-row';
      row.innerHTML = `
        <span class="contact-name">${esc(c.name)}</span>
        <span class="contact-phone">${esc(c.phone)}</span>
        <button class="contact-del" data-i="${i}" title="Eliminar">✕</button>`;
      list.appendChild(row);
    });
    list.querySelectorAll('.contact-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const contacts = getContacts();
        contacts.splice(+btn.dataset.i, 1);
        saveContacts(contacts);
        loadContacts();
      });
    });

    // Bind add button once
    const addBtn = $('btn-add-contact');
    if (addBtn && !addBtn._bound) {
      addBtn._bound = true;
      addBtn.addEventListener('click', () => {
        const name  = $('wa-name').value.trim();
        const phone = $('wa-phone').value.trim().replace(/\s+/g, '');
        if (!name || !phone) { toast('Escribe nombre y número', 'error'); return; }
        const contacts = getContacts();
        contacts.push({ name, phone });
        saveContacts(contacts);
        $('wa-name').value = '';
        $('wa-phone').value = '';
        loadContacts();
        toast(`${name} añadido`, 'success');
      });
    }
  }

  /* ── WhatsApp command parser ─────────────────────── */
  function parseWhatsAppCommand(text) {
    const t = text.toLowerCase();
    // Detecta: "manda(r)/envía(r) (un) whatsapp/mensaje/wasa a [NOMBRE] diciendo/que/: [MENSAJE]"
    const m = t.match(
      /(?:manda(?:r)?|env[ií]a(?:r)?)\s+(?:un\s+)?(?:whatsapp|wasa(?:p)?|mensaje)\s+a\s+(.+?)\s+(?:diciendo|que|:)\s+(.+)/i
    );
    if (!m) return null;

    const nameRaw = m[1].trim();
    const msgText = m[2].trim();

    // Buscar contacto por nombre (búsqueda parcial)
    const contacts = getContacts();
    const contact  = contacts.find(c =>
      c.name.toLowerCase().includes(nameRaw) || nameRaw.includes(c.name.toLowerCase())
    );

    return { name: nameRaw, contact, message: msgText };
  }

  function handleWhatsApp(text) {
    const result = parseWhatsAppCommand(text);
    if (!result) return false;

    const { name, contact, message } = result;

    if (!contact) {
      // No está en los contactos — mostrar aviso
      appendJarvisMsg(
        `No tengo el número de <strong>${esc(name)}</strong> guardado. Añádelo en ⚙ Configuración → Contactos WhatsApp.`
      );
      if (voice.ttsEnabled) voice.speak(`No tengo el número de ${name}. Añádelo en la configuración.`);
      return true;
    }

    // Construir link wa.me
    const phone   = contact.phone.replace(/[^\d]/g, '');
    const waUrl   = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const preview = message.length > 60 ? message.slice(0, 60) + '…' : message;

    appendJarvisMsg(
      `Mensaje listo para <strong>${esc(contact.name)}</strong>:<br>
       <em>"${esc(preview)}"</em><br><br>
       <a class="wa-btn" href="${waUrl}" target="_blank" rel="noopener">
         📱 Abrir en WhatsApp
       </a>`
    );

    if (voice.ttsEnabled) voice.speak(`Mensaje preparado para ${contact.name}. Toca el botón para enviarlo.`);

    // En móvil/desktop abre WhatsApp directamente
    setTimeout(() => window.open(waUrl, '_blank'), 400);
    return true;
  }

  function appendJarvisMsg(html) {
    const container = $('chat-messages');
    const div = document.createElement('div');
    div.className = 'msg msg-jarvis';
    div.innerHTML = `
      <div class="msg-avatar">J</div>
      <div class="msg-body">
        <div class="msg-meta">
          <span class="msg-name">J.A.R.V.I.S</span>
          <span class="msg-time">${fmtTime(new Date())}</span>
        </div>
        <div class="msg-text">${html}</div>
      </div>`;
    container.appendChild(div);
    scrollBottom();
  }

  /* ── Send message ────────────────────────────────── */
  async function sendMessage() {
    const input = $('chat-input');
    const text  = input.value.trim();
    if (!text || streaming) return;

    input.value = '';
    autoResize(input);

    appendMsg('user', text);
    addRecent(text);

    // Interceptar comando WhatsApp antes de llamar a la IA
    if (handleWhatsApp(text)) return;

    messages.push({ role: 'user', content: text });
    await fetchResponse();
  }

  /* ── Stream response ─────────────────────────────── */
  async function fetchResponse() {
    streaming = true;
    $('btn-send').disabled = true;
    voice.stopSpeaking();

    const thinkEl = appendThinking();

    try {
      const resp = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
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
            const parsed = JSON.parse(raw);
            if (parsed.error) {
              textEl.textContent = '⚠ ' + parsed.error;
              textEl.classList.remove('streaming');
              scrollBottom();
              return;
            }
            const content = parsed.content || '';
            if (content) {
              full += content;
              sentenceBuf += content;
              textEl.textContent = full;
              textEl.classList.add('streaming');
              scrollBottom();

              const splitRegex = /([.!?\n]+(?:\s+|$))/;
              const parts = sentenceBuf.split(splitRegex);
              if (parts.length > 2) {
                sentenceBuf = parts.pop();
                let readySentence = '';
                for (let i = 0; i < parts.length; i += 2) {
                  readySentence += parts[i] + (parts[i + 1] || '');
                }
                if (readySentence.trim()) voice.speak(readySentence.trim());
              }
            }
          } catch (_) { /* skip malformed JSON lines */ }
        }
      }

      textEl.classList.remove('streaming');
      messages.push({ role: 'assistant', content: full });
      saveMemory();
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

  // ── Version announcement modal (shows once) ──────
  const VERSION_KEY = 'jarvis-seen-v1.2';
  if (!localStorage.getItem(VERSION_KEY)) {
    const vModal = document.getElementById('version-modal');
    const vBtn   = document.getElementById('version-ok-btn');
    if (vModal && vBtn) {
      setTimeout(() => vModal.classList.remove('hidden'), 800);
      vBtn.addEventListener('click', () => {
        vModal.classList.add('hidden');
        localStorage.setItem(VERSION_KEY, '1');
      });
    }
  }

})();
