"""
J.A.R.V.I.S Desktop — Windows
Wake word "Jarvis" → escucha → responde + controla ventanas
"""

import os, sys, json, time, threading, subprocess, re
import speech_recognition as sr
import pyttsx3
import requests
import pygetwindow as gw

# ── CONFIGURACIÓN ───────────────────────────────────────────────────────────
JARVIS_BACKEND = "https://jarvis-backend.onrender.com"  # ← cambia por tu URL de Render
GROQ_API_KEY   = os.environ.get("GROQ_API_KEY", "")     # ← o ponla aquí directamente
WAKE_WORD      = "jarvis"
LISTEN_TIMEOUT = 8   # segundos esperando comando tras wake word
ENERGY_THRESHOLD = 3000

# Apps comunes para abrir (nombre → ejecutable)
KNOWN_APPS = {
    "chrome":     "chrome.exe",
    "google":     "chrome.exe",
    "firefox":    "firefox.exe",
    "edge":       "msedge.exe",
    "notepad":    "notepad.exe",
    "bloc de notas": "notepad.exe",
    "calculadora": "calc.exe",
    "explorer":   "explorer.exe",
    "explorador": "explorer.exe",
    "word":       "winword.exe",
    "excel":      "excel.exe",
    "spotify":    "spotify.exe",
    "discord":    "discord.exe",
    "code":       "code.exe",
    "vscode":     "code.exe",
    "terminal":   "cmd.exe",
    "cmd":        "cmd.exe",
    "paint":      "mspaint.exe",
    "vlc":        "vlc.exe",
}

# ── TTS ENGINE ──────────────────────────────────────────────────────────────
tts_engine = pyttsx3.init()
tts_engine.setProperty("rate", 165)

# Intenta usar voz en español si existe
voices = tts_engine.getProperty("voices")
for v in voices:
    if "spanish" in v.name.lower() or "es_" in v.id.lower():
        tts_engine.setProperty("voice", v.id)
        break

tts_lock = threading.Lock()

def speak(text: str):
    """Lee en voz alta el texto dado."""
    with tts_lock:
        print(f"[JARVIS] {text}")
        tts_engine.say(text)
        tts_engine.runAndWait()


# ── SPEECH RECOGNITION ──────────────────────────────────────────────────────
recognizer = sr.Recognizer()
recognizer.energy_threshold = ENERGY_THRESHOLD
recognizer.dynamic_energy_threshold = True
mic = sr.Microphone()

def listen_once(timeout=5, phrase_limit=10) -> str:
    """Escucha un fragmento y devuelve el texto reconocido (o '')."""
    with mic as source:
        recognizer.adjust_for_ambient_noise(source, duration=0.3)
        try:
            audio = recognizer.listen(source, timeout=timeout, phrase_time_limit=phrase_limit)
        except sr.WaitTimeoutError:
            return ""

    # Primero intenta Groq Whisper (más preciso)
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

    # Fallback: Google free STT
    try:
        return recognizer.recognize_google(audio, language="es-ES").lower()
    except Exception:
        return ""


# ── CONTROL DE VENTANAS ─────────────────────────────────────────────────────
def get_window(name: str):
    """Busca una ventana cuyo título contenga 'name'."""
    name_lower = name.lower()
    for w in gw.getAllWindows():
        if name_lower in w.title.lower():
            return w
    return None

def open_app(name: str) -> bool:
    """Abre una aplicación conocida."""
    exe = KNOWN_APPS.get(name.lower())
    if exe:
        try:
            subprocess.Popen(exe, shell=True)
            return True
        except Exception as e:
            print(f"[open_app error] {e}")
    return False

def handle_window_command(text: str) -> bool:
    """
    Detecta comandos de ventana en el texto.
    Devuelve True si el comando fue ejecutado (no hace falta llamar a la IA).
    """
    t = text.lower()

    # — Minimizar todo ————————————————————————
    if re.search(r"minimiz.? todo", t):
        for w in gw.getAllWindows():
            try: w.minimize()
            except: pass
        speak("Todo minimizado, Señor.")
        return True

    # — Mostrar escritorio ————————————————————
    if re.search(r"(escritorio|desktop)", t) and re.search(r"(muestra|show|ve al|go to)", t):
        subprocess.run("explorer shell:::{3080F90D-D7AD-11D9-BD98-0000947B0257}", shell=True)
        speak("Mostrando el escritorio.")
        return True

    # — Abrir app ————————————————————————————
    m = re.search(r"(abre?|abrir|lanza?|ejecuta?|inicia?|open|start)\s+(.+)", t)
    if m:
        app_name = m.group(2).strip()
        if open_app(app_name):
            speak(f"Abriendo {app_name}.")
            return True

    # — Cerrar ventana ———————————————————————
    m = re.search(r"(cierra?|cerrar|close|mata?|kill)\s+(.+)", t)
    if m:
        app_name = m.group(2).strip()
        win = get_window(app_name)
        if win:
            try:
                win.close()
                speak(f"{app_name} cerrado.")
                return True
            except: pass
        # Intentar cerrar por nombre de proceso
        subprocess.run(f"taskkill /f /im {KNOWN_APPS.get(app_name, app_name + '.exe')}", shell=True)
        speak(f"Intentando cerrar {app_name}.")
        return True

    # — Minimizar ventana ————————————————————
    m = re.search(r"(minimiz.?)\s+(.+)", t)
    if m:
        app_name = m.group(2).strip()
        win = get_window(app_name)
        if win:
            try:
                win.minimize()
                speak(f"{app_name} minimizado.")
                return True
            except: pass

    # — Maximizar ventana ————————————————————
    m = re.search(r"(maximiz.?)\s+(.+)", t)
    if m:
        app_name = m.group(2).strip()
        win = get_window(app_name)
        if win:
            try:
                win.maximize()
                speak(f"{app_name} maximizado.")
                return True
            except: pass

    # — Cambiar/enfocar ventana ——————————————
    m = re.search(r"(cambia a|switch to|enfoca?|ponme|pon)\s+(.+)", t)
    if m:
        app_name = m.group(2).strip()
        win = get_window(app_name)
        if win:
            try:
                win.activate()
                speak(f"Cambiando a {app_name}.")
                return True
            except: pass

    return False


# ── LLAMAR A LA IA ──────────────────────────────────────────────────────────
conversation_history = []

def ask_jarvis(user_text: str) -> str:
    """Envía el mensaje al backend de J.A.R.V.I.S y devuelve la respuesta."""
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
            if not line:
                continue
            line = line.decode("utf-8")
            if line.startswith("data: "):
                data_str = line[6:]
                if data_str == "[DONE]":
                    break
                try:
                    obj = json.loads(data_str)
                    if "content" in obj:
                        full_response += obj["content"]
                    elif "error" in obj:
                        return obj["error"]
                except:
                    pass

        if full_response:
            conversation_history.append({"role": "assistant", "content": full_response})

        return full_response or "No obtuve respuesta del servidor."

    except requests.exceptions.ConnectionError:
        return "No puedo conectar con el servidor. Verifique su conexión, Señor."
    except Exception as e:
        return f"Error al contactar con J.A.R.V.I.S: {e}"


# ── BUCLE PRINCIPAL ─────────────────────────────────────────────────────────
def main_loop():
    speak("J.A.R.V.I.S en línea. Estoy escuchando.")
    print(f"\n[JARVIS] Escuchando wake word '{WAKE_WORD}'...\n")

    while True:
        try:
            text = listen_once(timeout=None, phrase_limit=5)

            if not text:
                continue

            if WAKE_WORD in text:
                speak("Le escucho, Señor.")
                print("[JARVIS] Wake word detectada — esperando comando...")

                command = listen_once(timeout=LISTEN_TIMEOUT, phrase_limit=15)

                if not command:
                    speak("No le he escuchado bien. Puede repetirlo.")
                    continue

                print(f"[COMANDO] {command}")

                # Intentar comando de ventana primero
                if handle_window_command(command):
                    continue

                # Si no es comando de ventana → preguntar a la IA
                response = ask_jarvis(command)
                speak(response)

        except KeyboardInterrupt:
            speak("Apagando sistemas. Hasta luego, Señor.")
            sys.exit(0)
        except Exception as e:
            print(f"[ERROR] {e}")
            time.sleep(1)


# ── ENTRADA ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 55)
    print("   J.A.R.V.I.S Desktop — Windows")
    print("   Di 'Jarvis' para activar")
    print("=" * 55)

    if not GROQ_API_KEY:
        print("[AVISO] GROQ_API_KEY no configurada — usando Google STT gratuito")
    if JARVIS_BACKEND == "https://jarvis-backend.onrender.com":
        print("[AVISO] Cambia JARVIS_BACKEND por tu URL real de Render en el script")

    main_loop()
