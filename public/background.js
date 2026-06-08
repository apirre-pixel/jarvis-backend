/* ═══════════════════════════════════════════════
   J.A.R.V.I.S — Background / Always-On Mode
   Escucha continua via Web Speech API
   Comandos de ventana → local helper (localhost:5002)
   ═══════════════════════════════════════════════ */
class BackgroundMode {
  constructor(voiceModule, onCommand) {
    this.voice      = voiceModule;
    this.onCommand  = onCommand;
    this.active     = false;
    this.recognition = null;
    this.WAKE_WORD  = 'jarvis';
    this.HELPER     = 'http://localhost:5002';
    this._activated = false; // evita doble disparo
  }

  toggle() {
    if (this.active) this.stop();
    else this.start();
    return this.active;
  }

  start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Modo fondo requiere Chrome o Edge.');
      return false;
    }

    this.recognition = new SR();
    this.recognition.continuous      = true;
    this.recognition.interimResults  = true;
    this.recognition.lang            = 'es-ES';
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (e) => this._onResult(e);
    this.recognition.onerror  = (e) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('[BG]', e.error);
      }
    };
    this.recognition.onend = () => {
      if (this.active) {
        setTimeout(() => {
          try { this.recognition.start(); } catch (_) {}
        }, 400);
      }
    };

    try {
      this.recognition.start();
      this.active = true;
      this._updateBtn();
      this._notify('Modo fondo activado — di "Jarvis" para activarme');
      return true;
    } catch (e) {
      console.error('[BG start]', e);
      return false;
    }
  }

  stop() {
    this.active = false;
    try { this.recognition?.stop(); } catch (_) {}
    this.recognition = null;
    this._updateBtn();
    this._notify('Modo fondo desactivado');
  }

  _onResult(e) {
    if (this._activated) return;

    const results  = Array.from(e.results);
    const last     = results[results.length - 1];
    const transcript = last[0].transcript.toLowerCase().trim();

    if (transcript.includes(this.WAKE_WORD)) {
      const afterWake = transcript.split(this.WAKE_WORD).pop().trim();

      // Necesita al menos una palabra de comando tras el wake word
      if (afterWake.length > 2) {
        this._activated = true;
        setTimeout(() => { this._activated = false; }, 3000);
        this.recognition.stop();
        this._processCommand(afterWake);
      }
    }
  }

  async _processCommand(text) {
    console.log('[BG] Comando detectado:', text);
    this._pulse();

    const winCmd = this._parseWindowCommand(text);
    if (winCmd) {
      const ok = await this._execWindowCommand(winCmd);
      if (ok) return;
    }

    // Si no es comando de ventana → enviar a la IA
    this.onCommand(text);
  }

  _parseWindowCommand(text) {
    const t = text.toLowerCase().trim();

    if (/minimiz.? todo/.test(t))
      return { action: 'minimize_all' };

    let m;
    if ((m = t.match(/^(abre?|abrir|lanza?|ejecuta?|inicia?|open)\s+(.+)/)))
      return { action: 'open', app: m[2].trim() };
    if ((m = t.match(/^(cierra?|cerrar|close|kill|mata?)\s+(.+)/)))
      return { action: 'close', app: m[2].trim() };
    if ((m = t.match(/^(minimiz.?)\s+(.+)/)))
      return { action: 'minimize', app: m[2].trim() };
    if ((m = t.match(/^(maximiz.?)\s+(.+)/)))
      return { action: 'maximize', app: m[2].trim() };
    if ((m = t.match(/^(cambia a|switch to|pon en|enfoca?)\s+(.+)/)))
      return { action: 'focus', app: m[2].trim() };

    return null;
  }

  async _execWindowCommand(cmd) {
    try {
      const url  = `${this.HELPER}/cmd?action=${cmd.action}${cmd.app ? '&app=' + encodeURIComponent(cmd.app) : ''}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const data = await resp.json();
      if (data.speak && this.voice) this.voice.speak(data.speak);
      return !!data.ok;
    } catch (_) {
      // Helper no activo — la IA lo gestionará
      return false;
    }
  }

  _pulse() {
    const btn = document.getElementById('btn-background');
    btn?.classList.add('bg-activated');
    setTimeout(() => btn?.classList.remove('bg-activated'), 1200);
  }

  _updateBtn() {
    const btn = document.getElementById('btn-background');
    if (!btn) return;
    btn.classList.toggle('bg-active', this.active);
    btn.title = this.active
      ? 'Modo fondo ACTIVO — click para pausar'
      : 'Activar modo fondo (escucha "Jarvis")';
    const dot = document.getElementById('bg-dot');
    if (dot) dot.style.display = this.active ? 'block' : 'none';
  }

  _notify(msg) {
    const fn = window._jarvisToast;
    if (fn) fn(msg, 'info');
  }
}
