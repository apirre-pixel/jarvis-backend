/* ═══════════════════════════════════════
   J.A.R.V.I.S — Waveform Visualizer
   ═══════════════════════════════════════ */
class WaveformVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx    = this.canvas.getContext('2d');
    this.mode   = 'idle';   // 'idle' | 'listening' | 'speaking'
    this.t      = 0;
    this.raf    = null;
    this.audioCtx  = null;
    this.analyser  = null;
    this.dataArray = null;
    this.micStream = null;

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._render();
  }

  _resize() {
    const dpr  = window.devicePixelRatio || 1;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width  = rect.width  * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.W = rect.width;
    this.H = rect.height;
  }

  async setMode(mode, stream = null) {
    this.mode = mode;

    if (mode === 'listening' && stream) {
      await this._connectMic(stream);
    } else {
      this._disconnectMic();
    }

    const lbl = document.getElementById('wave-label');
    if (lbl) lbl.textContent = { idle:'EN ESPERA', listening:'ESCUCHANDO', speaking:'HABLANDO' }[mode] ?? 'EN ESPERA';
  }

  async _connectMic(stream) {
    this._disconnectMic();
    this.audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
    this.analyser  = this.audioCtx.createAnalyser();
    this.analyser.fftSize = 256;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.audioCtx.createMediaStreamSource(stream).connect(this.analyser);
    this.micStream = stream;
  }

  _disconnectMic() {
    if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null; }
    this.analyser = null; this.dataArray = null; this.micStream = null;
  }

  _render() {
    this.raf = requestAnimationFrame(() => this._render());
    this.t += 0.05;
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);

    const BARS = 64;
    const bw   = W / BARS;
    const cy   = H / 2;

    if (this.mode === 'idle') {
      this._drawIdle(BARS, bw, cy);
    } else if (this.mode === 'listening' && this.analyser) {
      this._drawMic(BARS, bw, cy);
    } else if (this.mode === 'listening') {
      this._drawFake(BARS, bw, cy, '#ff3355', 0.45);
    } else if (this.mode === 'speaking') {
      this._drawFake(BARS, bw, cy, '#00d4ff', 1.0);
    }
  }

  _drawIdle(bars, bw, cy) {
    const { ctx, W, t } = this;
    ctx.strokeStyle = 'rgba(0,212,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.stroke();

    for (let i = 0; i < bars; i++) {
      const x   = i * bw + bw * 0.5;
      const amp = Math.sin(t + i * 0.25) * 2.5;
      ctx.fillStyle = 'rgba(0,212,255,0.2)';
      ctx.fillRect(x - bw * 0.28, cy - Math.abs(amp), bw * 0.56, Math.abs(amp) * 2);
    }
  }

  _drawFake(bars, bw, cy, hex, intensity) {
    const { ctx, H, t } = this;
    for (let i = 0; i < bars; i++) {
      const x    = i * bw + bw * 0.5;
      const tt   = t * 2 + i * 0.32;
      const raw  = Math.sin(tt) * Math.cos(tt * 0.65 + 1.1) * Math.sin(tt * 0.29 + 2.3);
      const amp  = (0.18 + Math.abs(raw) * 0.82) * intensity;
      const barH = amp * H * 0.44;
      const alpha= 0.35 + amp * 0.65;

      const g = ctx.createLinearGradient(x, cy - barH, x, cy + barH);
      g.addColorStop(0,   hex + '00');
      g.addColorStop(0.5, hex + this._hex(alpha));
      g.addColorStop(1,   hex + '00');

      ctx.fillStyle = g;
      ctx.fillRect(x - bw * 0.34, cy - barH, bw * 0.68, barH * 2);
    }
  }

  _drawMic(bars, bw, cy) {
    const { ctx, H } = this;
    this.analyser.getByteFrequencyData(this.dataArray);
    const len = this.dataArray.length;

    for (let i = 0; i < bars; i++) {
      const idx  = Math.floor((i / bars) * len);
      const v    = this.dataArray[idx] / 255;
      const barH = v * H * 0.44;
      const x    = i * bw + bw * 0.5;

      const g = ctx.createLinearGradient(x, cy - barH, x, cy + barH);
      g.addColorStop(0,   'rgba(255,51,85,0)');
      g.addColorStop(0.5, `rgba(255,51,85,${0.35 + v * 0.65})`);
      g.addColorStop(1,   'rgba(255,51,85,0)');

      ctx.fillStyle = g;
      ctx.fillRect(x - bw * 0.34, cy - barH, bw * 0.68, barH * 2);
    }
  }

  _hex(alpha) {
    return Math.floor(Math.min(1, Math.max(0, alpha)) * 255)
      .toString(16).padStart(2, '0');
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this._disconnectMic();
  }
}
