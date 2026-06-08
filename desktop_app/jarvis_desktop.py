"""
J.A.R.V.I.S Desktop v2 — Windows
- Icono en bandeja del sistema (system tray)
- Voz Microsoft Neural (edge-tts)
- Configuración en config.json
- Wake word "Jarvis" → escucha → responde + controla ventanas
"""

import os, sys, json, time, threading, subprocess, re, tempfile, asyncio
import speech_recognition as sr
import pygetwindow as gw
import requests
import pygame
import edge_tts
import pystray
from PIL import Image, ImageDraw

# ── CONFIGURACIÓN ────────────────────────────────────────────────────────────
CONFIG_FILE = os.path.join(os.path.dirname(__file__), "config.json")

def load_config():
    defaults = {
        "backend_url": "",
        "groq_api_key": "",
        "voice": "es-ES-AlvaroNeural",
        "wake_word": "jarvis",
        "listen_timeout": 8
    }
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                saved = json.load(f)
                defaults.update(saved)
        except:
            pass
    return defaults

def save_config(cfg):
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)

cfg = load_config()

# Si no hay URL configurada, pedirla al arrancar
if not cfg["backend_url"]:
    print("=" * 55)
    print("  Primera ejecución — Configura J.A.R.V.I.S Desktop")
    print("=" * 55)
    url = input("URL de tu servidor Render (ej: https://mi-jarvis.onrender.com): ").strip()
    if url:
        cfg["backend_url"] = url.rstrip("/")
    key = input("Tu GROQ_API_KEY (Enter para omitir): ").strip()
    if key:
        cfg["groq_api_key"] = key
    save_config(cfg)

JARVIS_BACKEND = cfg["backend_url"]
GROQ_API_KEY   = cfg["groq_api_key"] or os.environ.get("GROQ_API_KEY", "")
VOICE          = cfg["voice"]
WAKE_WORD      = cfg["wake_word"].lower()
LISTEN_TIMEOUT = cfg["listen_timeout"]

KNOWN_APPS = {
    "chrome":        "chrome.exe",
    "google":        "chrome.exe",
    "opera":         "opera.exe",
    "firefox":       "firefox.exe",
    "edge":          "msedge.exe",
    "notepad":       "notepad.exe",
    "bloc de notas": "notepad.exe",
    "calculadora":   "calc.exe",
    "explorer":      "explorer.exe",
    "explorador":    "explorer.exe",
    "word":          "winword.exe",
    "excel":         "excel.exe",
    "spotify":       "Spotify.exe",
    "discord":       "Discord.exe",
    "code":          "Code.exe",
    "vscode":        "Code.exe",
    "terminal":      "cmd.exe",
    "cmd":           "cmd.exe",
    "paint":         "mspaint.exe",
    "vlc":           "vlc.exe",
    "whatsapp":      "WhatsApp.exe",
    "telegram":      "Telegram.exe",
    "steam":         "steam.exe",
}

# ── AUDIO (pygame) ───────────────────────────────────────────────────────────
pygame.mixer.init(frequency=22050, size=-16, channels=1, buffer=512)
_tts_lock = threading.Lock()

async def _edge_speak_async(text: str):
    tmp = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
    tmp.close()
    communicate = edge_tts.Communicate(text, VOICE)
    await communicate.save(tmp.name)
    return tmp.name

def speak(text: str):
    """TTS con voz Microsoft Neural (edge-tts)."""
    with _tts_lock:
        print(f"[JARVIS] {text}")
        try:
            path = asyncio.run(_edge_speak_async(text))
            pygame.mixer.music.load(path)
            pygame.mixer.music.play()
            while pygame.mixer.music.get_busy():
                time.sleep(0.05)
            pygame.mixer.music.unload()
            try: os.unlink(path)
            except: pass
        except Exception as e:
            print(f"[TTS error] {e}")

# ── SPEECH RECOGNITION ───────────────────────────────────────────────────────
recognizer = sr.Recognizer()
recognizer.energy_threshold = 3000
recognizer.dynamic_energy_threshold = True
mic = sr.Microphone()

def listen_once(timeout=5, phrase_limit=12) -> str:
    with mic as source:
        recognizer.adjust_for_ambient_noise(source, duration=0.3)
        try:
            audio = recognizer.listen(source, timeout=timeout, phrase_time_limit=phrase_limit)
        except sr.WaitTimeoutError:
            return ""

    if GROQ_API_KEY:
        try:
            wav = audio.get_wav_data()
            resp = requests.post(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                files={"file": ("audio.wav", wav, "audio/wav")},
                data={"model": "whisper-large-v3-turbo", "language": "es"},
                timeout=10,
            )
            if resp.ok:
                return resp.json().get("text", "").strip().lower()
        except Exception as e:
            print(f"[Whisper error] {e}")

    try:
        return recognizer.recognize_google(audio, language="es-ES").lower()
    except Exception:
        return ""

# ── CONTROL DE VENTANAS ──────────────────────────────────────────────────────
def get_window(name: str):
    name_lower = name.lower()
    for w in gw.getAllWindows():
        if w.title and name_lower in w.title.lower():
            return w
    return None

def open_app(name: str) -> bool:
    exe = KNOWN_APPS.get(name.lower())
    if exe:
        try:
            subprocess.Popen(exe, shell=True)
            return True
        except Exception as e:
            print(f"[open_app error] {e}")
    # Intentar directamente por nombre
    try:
        subprocess.Popen(name, shell=True)
        return True
    except:
        return False

def handle_window_command(text: str) -> bool:
    t = text.lower()

    if re.search(r"minimiz.? todo|minimiza todo", t):
        for w in gw.getAllWindows():
            try: w.minimize()
            except: pass
        speak("Todo minimizado.")
        return True

    if re.search(r"(muestra|ir al|ve al)\s+(escritorio|desktop)", t):
        subprocess.run("explorer shell:::{3080F90D-D7AD-11D9-BD98-0000947B0257}", shell=True)
        speak("Mostrando el escritorio.")
        return True

    m = re.search(r"(abre?|abrir|lanza?|ejecuta?|inicia?|open)\s+(.+)", t)
    if m:
        app_name = m.group(2).strip()
        if open_app(app_name):
            speak(f"Abriendo {app_name}.")
            return True

    m = re.search(r"(cierra?|cerrar|close|kill)\s+(.+)", t)
    if m:
        app_name = m.group(2).strip()
        win = get_window(app_name)
        if win:
            try:
                win.close()
                speak(f"{app_name} cerrado.")
                return True
            except: pass
        exe = KNOWN_APPS.get(app_name.lower(), app_name + ".exe")
        subprocess.run(f"taskkill /f /im {exe}", shell=True, capture_output=True)
        speak(f"Cerrando {app_name}.")
        return True

    m = re.search(r"(minimiz.?)\s+(.+)", t)
    if m:
        win = get_window(m.group(2).strip())
        if win:
            try: win.minimize(); speak(f"{m.group(2).strip()} minimizado."); return True
            except: pass

    m = re.search(r"(maximiz.?)\s+(.+)", t)
    if m:
        win = get_window(m.group(2).strip())
        if win:
            try: win.maximize(); speak(f"{m.group(2).strip()} maximizado."); return True
            except: pass

    m = re.search(r"(cambia a|switch to|enfoca?|pon)\s+(.+)", t)
    if m:
        win = get_window(m.group(2).strip())
        if win:
            try: win.activate(); speak(f"Cambiando a {m.group(2).strip()}."); return True
            except: pass

    return False

# ── LLAMAR A LA IA ───────────────────────────────────────────────────────────
conversation_history = []

def ask_jarvis(user_text: str) -> str:
    conversation_history.append({"role": "user", "content": user_text})
    try:
        resp = requests.post(
            f"{JARVIS_BACKEND}/api/chat",
            json={"messages": conversation_history},
            stream=True,
            timeout=30,
        )
        full_response = ""
        for line in resp.iter_lines():
            if not line: continue
            line = line.decode("utf-8")
            if line.startswith("data: "):
                data_str = line[6:]
                if data_str == "[DONE]": break
                try:
                    obj = json.loads(data_str)
                    if "content" in obj:
                        full_response += obj["content"]
                    elif "error" in obj:
                        return obj["error"]
                except: pass
        if full_response:
            conversation_history.append({"role": "assistant", "content": full_response})
        return full_response or "No obtuve respuesta del servidor."
    except requests.exceptions.ConnectionError:
        return "No puedo conectar con el servidor. Compruebe que Render esté activo, Señor."
    except Exception as e:
        return f"Error: {e}"

# ── ESTADO GLOBAL ────────────────────────────────────────────────────────────
state = {"listening": True, "icon": None}

# ── BUCLE DE ESCUCHA ─────────────────────────────────────────────────────────
def listening_loop():
    speak("J.A.R.V.I.S en línea. A su servicio, Señor.")
    print(f"\n[JARVIS] Escuchando wake word '{WAKE_WORD}'...\n")

    while True:
        try:
            if not state["listening"]:
                time.sleep(0.5)
                continue

            text = listen_once(timeout=None, phrase_limit=5)
            if not text:
                continue

            if WAKE_WORD in text:
                speak("Le escucho, Señor.")
                print("[JARVIS] Activado — esperando comando...")
                if state["icon"]:
                    state["icon"].notify("J.A.R.V.I.S activado", "Le escucho, Señor.")

                command = listen_once(timeout=LISTEN_TIMEOUT, phrase_limit=15)

                if not command:
                    speak("No le he escuchado, Señor.")
                    continue

                print(f"[COMANDO] {command}")

                if handle_window_command(command):
                    continue

                response = ask_jarvis(command)
                speak(response)

        except KeyboardInterrupt:
            speak("Apagando sistemas.")
            sys.exit(0)
        except Exception as e:
            print(f"[ERROR] {e}")
            time.sleep(1)

# ── SYSTEM TRAY ──────────────────────────────────────────────────────────────
def create_icon_image():
    """Crea el icono de la bandeja — círculo azul estilo arc-reactor."""
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    draw.ellipse([2, 2, 62, 62], fill=(0, 20, 40, 255), outline=(0, 212, 255, 255), width=3)
    draw.ellipse([14, 14, 50, 50], fill=None, outline=(0, 212, 255, 200), width=2)
    draw.ellipse([24, 24, 40, 40], fill=(0, 212, 255, 255))
    return img

def toggle_listening(icon, item):
    state["listening"] = not state["listening"]
    status = "activado" if state["listening"] else "pausado"
    speak(f"Micrófono {status}.")
    icon.title = f"J.A.R.V.I.S — {'Escuchando' if state['listening'] else 'Pausado'}"

def open_config(icon, item):
    subprocess.Popen(f'notepad "{CONFIG_FILE}"', shell=True)

def exit_app(icon, item):
    speak("Hasta luego, Señor.")
    time.sleep(1)
    icon.stop()
    os._exit(0)

def run_tray():
    image = create_icon_image()
    menu = pystray.Menu(
        pystray.MenuItem(
            lambda text, item: "⏸ Pausar micrófono" if state["listening"] else "▶ Reanudar micrófono",
            toggle_listening
        ),
        pystray.MenuItem("⚙ Editar configuración", open_config),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("✕ Salir", exit_app),
    )
    icon = pystray.Icon("JARVIS", image, "J.A.R.V.I.S — Escuchando", menu)
    state["icon"] = icon
    icon.run()

# ── ENTRADA ──────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 55)
    print("   J.A.R.V.I.S Desktop v2")
    print(f"   Backend: {JARVIS_BACKEND or '⚠ NO CONFIGURADO'}")
    print(f"   Groq STT: {'✅' if GROQ_API_KEY else '❌ usando Google gratuito'}")
    print("=" * 55)

    t = threading.Thread(target=listening_loop, daemon=True)
    t.start()

    run_tray()
