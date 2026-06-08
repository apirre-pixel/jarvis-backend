"""
J.A.R.V.I.S Local — App completa para tu PC
100% local, sin Render, sin nube
Puerto: 5000
"""

import os, sys, json, tempfile, asyncio, subprocess, re, threading, time
from pathlib import Path

from flask import Flask, request, Response, send_from_directory, jsonify
from flask_cors import CORS

# ── Config ───────────────────────────────────────────────────────────────────
BASE_DIR    = Path(__file__).parent
PUBLIC_DIR  = BASE_DIR / "public"
CONFIG_FILE = BASE_DIR / "config.json"

def load_config():
    defaults = {"groq_api_key": "", "gemini_api_key": "", "voice": "es-ES-AlvaroNeural"}
    if CONFIG_FILE.exists():
        try:
            saved = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
            defaults.update(saved)
        except: pass
    return defaults

def save_config(cfg):
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")

cfg = load_config()

# Si faltan claves, pedirlas al arrancar
if not cfg["groq_api_key"]:
    print("=" * 50)
    print("  J.A.R.V.I.S Local — Primera configuración")
    print("=" * 50)
    key = input("Tu GROQ_API_KEY (necesaria para voz y chat): ").strip()
    if key:
        cfg["groq_api_key"] = key
    gkey = input("Tu GEMINI_API_KEY (opcional, mejor calidad): ").strip()
    if gkey:
        cfg["gemini_api_key"] = gkey
    save_config(cfg)

GROQ_KEY   = cfg["groq_api_key"]   or os.environ.get("GROQ_API_KEY", "")
GEMINI_KEY = cfg["gemini_api_key"] or os.environ.get("GEMINI_API_KEY", "")
VOICE      = cfg.get("voice", "es-ES-AlvaroNeural")

SYSTEM_PROMPT = (
    "You are J.A.R.V.I.S (Just A Rather Very Intelligent System), the AI assistant originally "
    "created by Tony Stark, now serving the user. You are sophisticated, highly intelligent, and "
    "occasionally witty. You speak concisely but with precision and intelligence. You occasionally "
    "address the user as 'Sir' or 'Señor' depending on the language they use. You always detect "
    "the user's language and respond in the same language. You are an expert across all domains — "
    "science, technology, analysis, creativity, problem solving. Keep responses concise and "
    "impactful unless the user asks for more detail. Never mention being an AI or a language model "
    "— you are J.A.R.V.I.S. CRITICAL: Never repeat yourself, never contradict yourself, never "
    "change your answer mid-response. Give one clear, direct, confident answer and stop."
)

# ── Flask ─────────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder=str(PUBLIC_DIR))
CORS(app)

@app.route("/")
def index():
    return send_from_directory(str(PUBLIC_DIR), "index.html")

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(str(PUBLIC_DIR), filename)

# ── Chat (SSE streaming — Gemini → Groq fallback) ───────────────────────────
@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    messages = data.get("messages", [])
    if not messages:
        return jsonify({"error": "No messages"}), 400

    def generate():
        # — Intentar Gemini —
        if GEMINI_KEY:
            try:
                import google.generativeai as genai
                genai.configure(api_key=GEMINI_KEY)
                model = genai.GenerativeModel(
                    "gemini-2.0-flash-lite",
                    system_instruction=SYSTEM_PROMPT
                )
                history = [
                    {"role": "model" if m["role"] == "assistant" else "user",
                     "parts": [m["content"]]}
                    for m in messages[:-1]
                ]
                chat_session = model.start_chat(history=history)
                response = chat_session.send_message(messages[-1]["content"], stream=True)
                has_content = False
                for chunk in response:
                    text = chunk.text
                    if text:
                        has_content = True
                        yield f"data: {json.dumps({'content': text})}\n\n"
                if has_content:
                    yield "data: [DONE]\n\n"
                    return
            except Exception as e:
                is_quota = "429" in str(e) or "quota" in str(e).lower()
                if not is_quota:
                    yield f"data: {json.dumps({'error': str(e)[:120]})}\n\n"
                    return

        # — Fallback Groq —
        if not GROQ_KEY:
            yield f"data: {json.dumps({'error': 'Configura GROQ_API_KEY en config.json'})}\n\n"
            return
        try:
            from groq import Groq
            client = Groq(api_key=GROQ_KEY)
            stream = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[{"role": "system", "content": SYSTEM_PROMPT}, *messages],
                stream=True,
                max_tokens=800,
                temperature=0.4,
            )
            for chunk in stream:
                content = chunk.choices[0].delta.content or ""
                if content:
                    yield f"data: {json.dumps({'content': content})}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(generate(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ── STT (Groq Whisper) ───────────────────────────────────────────────────────
@app.route("/api/stt", methods=["POST"])
def stt():
    if "audio" not in request.files:
        return jsonify({"error": "No audio"}), 400
    if not GROQ_KEY:
        return jsonify({"error": "GROQ_API_KEY no configurada"}), 401

    audio_file = request.files["audio"]
    tmp = tempfile.NamedTemporaryFile(suffix=".webm", delete=False)
    audio_file.save(tmp.name)
    tmp.close()

    try:
        from groq import Groq
        client = Groq(api_key=GROQ_KEY)
        with open(tmp.name, "rb") as f:
            result = client.audio.transcriptions.create(
                file=("audio.webm", f),
                model="whisper-large-v3-turbo",
                response_format="json",
            )
        return jsonify({"text": result.text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        try: os.unlink(tmp.name)
        except: pass

# ── TTS (edge-tts → mp3) ─────────────────────────────────────────────────────
@app.route("/api/tts", methods=["POST"])
def tts():
    text = request.get_json().get("text", "")
    if not text:
        return jsonify({"error": "No text"}), 400

    async def make_audio():
        tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        tmp.close()
        communicate = edge_tts.Communicate(text, VOICE)
        await communicate.save(tmp.name)
        return tmp.name

    try:
        import edge_tts
        path = asyncio.run(make_audio())
        with open(path, "rb") as f:
            audio = f.read()
        os.unlink(path)
        return Response(audio, mimetype="audio/mpeg")
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Cmd (control de ventanas) ────────────────────────────────────────────────
KNOWN_APPS = {
    "chrome": "chrome.exe", "google": "chrome.exe",
    "opera": "opera.exe",   "operagx": "opera.exe", "opera gx": "opera.exe",
    "firefox": "firefox.exe", "edge": "msedge.exe",
    "notepad": "notepad.exe", "bloc de notas": "notepad.exe",
    "calculadora": "calc.exe", "explorador": "explorer.exe",
    "word": "winword.exe", "excel": "excel.exe",
    "spotify": "Spotify.exe", "discord": "Discord.exe",
    "whatsapp": "WhatsApp.exe", "telegram": "Telegram.exe",
    "steam": "steam.exe", "code": "Code.exe", "vscode": "Code.exe",
    "terminal": "cmd.exe", "cmd": "cmd.exe",
    "paint": "mspaint.exe", "vlc": "vlc.exe",
}

def find_win(name):
    try:
        import pygetwindow as gw
        for w in gw.getAllWindows():
            if w.title and name.lower() in w.title.lower():
                return w
    except: pass
    return None

@app.route("/cmd")
def cmd():
    action = request.args.get("action", "")
    app_name = request.args.get("app", "")
    try:
        import pygetwindow as gw
        if action == "minimize_all":
            for w in gw.getAllWindows():
                try: w.minimize()
                except: pass
            return jsonify({"ok": True, "speak": "Todo minimizado."})
        if action == "open":
            exe = KNOWN_APPS.get(app_name.lower(), app_name + ".exe")
            subprocess.Popen(exe, shell=True)
            return jsonify({"ok": True, "speak": f"Abriendo {app_name}."})
        if action == "close":
            w = find_win(app_name)
            if w: w.close()
            else:
                exe = KNOWN_APPS.get(app_name.lower(), app_name + ".exe")
                subprocess.run(f"taskkill /f /im {exe}", shell=True, capture_output=True)
            return jsonify({"ok": True, "speak": f"{app_name} cerrado."})
        if action == "minimize":
            w = find_win(app_name)
            if w: w.minimize()
            return jsonify({"ok": True, "speak": f"{app_name} minimizado."})
        if action == "maximize":
            w = find_win(app_name)
            if w: w.maximize()
            return jsonify({"ok": True, "speak": f"{app_name} maximizado."})
        if action == "focus":
            w = find_win(app_name)
            if w: w.activate()
            return jsonify({"ok": True, "speak": f"Cambiando a {app_name}."})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)})
    return jsonify({"ok": False})

# ── Status ───────────────────────────────────────────────────────────────────
@app.route("/api/status")
def status():
    return jsonify({"status": "online", "version": "1.12", "mode": "local"})

# ── Abrir ventana del navegador ───────────────────────────────────────────────
def open_browser():
    time.sleep(1.5)
    url = "http://localhost:5000"
    # Intentar Edge en modo app (ventana limpia sin barra de navegador)
    for edge_path in [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]:
        if os.path.exists(edge_path):
            subprocess.Popen([edge_path, f"--app={url}", "--window-size=1200,820"])
            return
    # Fallback: Chrome en modo app
    for chrome_path in [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]:
        if os.path.exists(chrome_path):
            subprocess.Popen([chrome_path, f"--app={url}"])
            return
    # Fallback: abrir en navegador por defecto
    import webbrowser
    webbrowser.open(url)

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 50)
    print("  J.A.R.V.I.S Local")
    print(f"  Groq:   {'✅' if GROQ_KEY   else '❌ falta en config.json'}")
    print(f"  Gemini: {'✅' if GEMINI_KEY else '— (opcional)'}")
    print(f"  Voz:    {VOICE}")
    print("=" * 50)

    threading.Thread(target=open_browser, daemon=True).start()

    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
