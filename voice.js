/* ═══════════════════════════════════════
   J.A.R.V.I.S — Voice Module (STT + TTS)
   ═══════════════════════════════════════ */
class VoiceModule {
  constructor(waveform) {
    this.waveform    = waveform;
    this.synth       = window.speechSynthesis;
    this.recognition = null;
    this.isListening = false;
    this.isSpeaking  = false;
    this.ttsEnabled  = true;
    this.micStream   = null;
    this.onResult    = null;
    this.onError     = null;

    // Audio queue state
    this.audioQueue      = [];
    this.isPlayingQueue  = false;
    this.currentAudio    = null;

    this._initSTT();
  }

  /* ── Speech Recognition ───────────────────────── */
  _initSTT() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.warn('[JARVIS] STT not supported in this browser');
      return;
    }

    this.recognition = new SR();
    this.recognition.continuous      = false;
    this.recognition.interimResults  = true;
    this.recognition.lang            = navigator.language || 'es-ES';
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      this._updateUI();
    };

    this.recognition.onresult = (e) => {
      let transcript = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      if (e.results[e.results.length - 1].isFinal) {
        const text = transcript.trim();
        if (text && this.onResult) this.onResult(text);
        this.stopListening();
      }
    };

    this.recognition.onerror = (e) => {
      console.error('[JARVIS STT]', e.error);
      this.stopListening();
      if (this.onError) this.onError(e.error);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this._updateUI();
      this._releaseMic();
    };
  }

  async startListening() {
    if (this.isSpeaking) this.stopSpeaking();
    if (this.isListening || !this.recognition) return;

    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await this.waveform.setMode('listening', this.micStream);
      this.recognition.start();
    } catch (err) {
      console.error('[JARVIS] Mic error:', err);
      this._releaseMic();
      if (this.onError) this.onError('mic_denied');
    }
  }

  stopListening() {
    if (this.recognition && this.isListening) {
      try { this.recognition.stop(); } catch (_) {}
    }
    this._releaseMic();
    this.isListening = false;
    this.waveform.setMode('idle');
    this._updateUI();
  }

  _releaseMic() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
  }

  /* ── TTS ──────────────────────────────────────── */
  speak(text) {
    if (!this.ttsEnabled || !text) return;

    // Strip markdown
    const clean = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g,     '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n+/g, ' ')
      .trim();

    if (!clean) return;

    this.audioQueue.push(clean);
    this._playNext();
  }

  async _playNext() {
    // Guard: don't start if already playing or queue empty
    if (this.isPlayingQueue || this.audioQueue.length === 0) return;

    this.isPlayingQueue = true;
    const text = this.audioQueue.shift();

    this.isSpeaking = true;
    this.waveform.setMode('speaking');
    this._updateUI();

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`TTS ${response.status}: ${errText}`);
      }

      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);

      await new Promise((resolve) => {
        this.currentAudio = new Audio(url);

        const cleanup = () => {
          URL.revokeObjectURL(url);
          this.currentAudio = null;
          resolve();
        };

        this.currentAudio.onended = cleanup;
        this.currentAudio.onerror = (e) => {
          console.error('[JARVIS TTS] Audio play error:', e);
          cleanup();
        };

        this.currentAudio.play().catch(e => {
          console.error('[JARVIS TTS] play() failed:', e);
          cleanup();
        });
      });

    } catch (err) {
      console.error('[JARVIS TTS Error]', err.message);
    } finally {
      // Always reset playing flag
      this.isPlayingQueue = false;

      if (this.audioQueue.length > 0) {
        // More items — continue
        this._playNext();
      } else {
        // Queue empty — back to idle
        this.isSpeaking = false;
        this.waveform.setMode('idle');
        this._updateUI();
      }
    }
  }

  stopSpeaking() {
    // Clear queue and stop current audio
    this.audioQueue     = [];
    this.isPlayingQueue = false;

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.src = '';
      this.currentAudio = null;
    }

    if (this.synth) this.synth.cancel();

    this.isSpeaking = false;
    this.waveform.setMode('idle');
    this._updateUI();
  }

  setTTS(enabled) {
    this.ttsEnabled = enabled;
    if (!enabled) this.stopSpeaking();
  }

  /* ── UI helpers ───────────────────────────────── */
  _updateUI() {
    document.getElementById('listening-ind')?.classList.toggle('hidden', !this.isListening);
    document.getElementById('speaking-ind')?.classList.toggle('hidden',  !this.isSpeaking);
    document.getElementById('btn-mic')?.classList.toggle('active', this.isListening);
  }
}
