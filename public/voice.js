/* ═══════════════════════════════════════
   J.A.R.V.I.S — Voice Module (STT + TTS)
   ═══════════════════════════════════════ */
class VoiceModule {
  constructor(waveform) {
    this.waveform        = waveform;
    this.synth           = window.speechSynthesis;
    this.isListening     = false;
    this.isSpeaking      = false;
    this.ttsEnabled      = true;
    this.micStream       = null;
    this.mediaRecorder   = null;
    this.audioChunks     = [];
    this.onResult        = null;
    this.onError         = null;
    this._autoStopTimer  = null;

    if (this.synth) {
      this.synth.onvoiceschanged = () => {};
    }
  }

  /* ── Speech-to-Text (Groq Whisper via MediaRecorder) ── */
  async startListening() {
    if (this.isSpeaking) this.stopSpeaking();
    if (this.isListening) return;

    try {
      this.micStream   = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioChunks = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : '';

      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.micStream, { mimeType })
        : new MediaRecorder(this.micStream);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.audioChunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => this._transcribe();

      this.mediaRecorder.start(100);
      this.isListening = true;

      await this.waveform.setMode('listening', this.micStream);
      this._updateUI();

      this._autoStopTimer = setTimeout(() => {
        if (this.isListening) this.stopListening();
      }, 15000);

    } catch (err) {
      console.error('[JARVIS] Mic error:', err);
      this._releaseMic();
      if (this.onError) this.onError('mic_denied', err.message || 'Micrófono inaccesible');
    }
  }

  stopListening() {
    clearTimeout(this._autoStopTimer);
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.isListening = false;
    this.waveform.setMode('idle');
    this._updateUI();
  }

  async _transcribe() {
    this._releaseMic();

    if (this.audioChunks.length === 0) return;

    const lbl = document.getElementById('wave-label');
    if (lbl) lbl.textContent = 'PROCESANDO…';

    try {
      const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
      const blob     = new Blob(this.audioChunks, { type: mimeType });

      const formData = new FormData();
      formData.append('audio', blob, 'audio.webm');

      const resp = await fetch('/api/stt', { method: 'POST', body: formData });
      const data = await resp.json();

      if (data.error) throw new Error(data.error);
      const text = (data.text || '').trim();
      if (text && this.onResult) this.onResult(text);

    } catch (err) {
      console.error('[JARVIS STT]', err);
      if (this.onError) this.onError('stt_failed', err.message || 'Error desconocido');
    } finally {
      if (lbl) lbl.textContent = 'EN ESPERA';
      this._updateUI();
    }
  }

  _releaseMic() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null;
    }
  }

  /* ── TTS ──────────────────────────────────────── */
  async speak(text) {
    if (!this.ttsEnabled) return;

    const clean = text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g,     '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\n+/g, ' ')
      .trim();

    if (!clean) return;

    if (!this.audioQueue) {
      this.audioQueue      = [];
      this.isPlayingQueue  = false;
    }
    this.audioQueue.push(clean);
    this._playNext();
  }

  async _playNext() {
    if (this.isPlayingQueue || this.audioQueue.length === 0) return;
    this.isPlayingQueue = true;

    const text = this.audioQueue.shift();
    this.isSpeaking = true;
    this.waveform.setMode('speaking');
    this._updateUI();

    try {
      const response = await fetch('/api/tts', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ text }),
      });

      if (!response.ok) throw new Error('TTS fetch failed');

      const blob = await response.blob();
      const url  = URL.createObjectURL(blob);

      this.currentAudio = new Audio(url);

      const done = () => {
        URL.revokeObjectURL(url);
        this.isPlayingQueue = false;
        if (this.audioQueue.length > 0) {
          this._playNext();
        } else {
          this.isSpeaking = false;
          this.waveform.setMode('idle');
          this._updateUI();
        }
      };

      this.currentAudio.onended = done;
      this.currentAudio.onerror = done;
      await this.currentAudio.play();

    } catch (err) {
      console.error('[JARVIS TTS Error]', err);
      this.isPlayingQueue = false;
      this.isSpeaking     = false;
      this.waveform.setMode('idle');
      this._updateUI();
    }
  }

  stopSpeaking() {
    this.audioQueue     = [];
    this.isPlayingQueue = false;
    if (this.currentAudio) {
      this.currentAudio.pause();
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
