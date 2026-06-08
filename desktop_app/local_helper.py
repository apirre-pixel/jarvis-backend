"""
J.A.R.V.I.S Local Helper — Windows
Servidor local que recibe comandos del navegador para controlar apps.
Puerto: 5002   (se abre solo cuando lo ejecutas)
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import subprocess, json, sys

try:
    import pygetwindow as gw
    HAS_GW = True
except ImportError:
    HAS_GW = False
    print("[AVISO] pygetwindow no instalado — minimizar/maximizar no disponible")

KNOWN_APPS = {
    "chrome":        "chrome.exe",
    "google":        "chrome.exe",
    "opera":         "opera.exe",
    "operagx":       "opera.exe",
    "opera gx":      "opera.exe",
    "firefox":       "firefox.exe",
    "edge":          "msedge.exe",
    "notepad":       "notepad.exe",
    "bloc de notas": "notepad.exe",
    "calculadora":   "calc.exe",
    "calculator":    "calc.exe",
    "explorador":    "explorer.exe",
    "explorer":      "explorer.exe",
    "word":          "winword.exe",
    "excel":         "excel.exe",
    "powerpoint":    "powerpnt.exe",
    "spotify":       "Spotify.exe",
    "discord":       "Discord.exe",
    "whatsapp":      "WhatsApp.exe",
    "telegram":      "Telegram.exe",
    "steam":         "steam.exe",
    "code":          "Code.exe",
    "vscode":        "Code.exe",
    "visual studio code": "Code.exe",
    "terminal":      "cmd.exe",
    "cmd":           "cmd.exe",
    "paint":         "mspaint.exe",
    "vlc":           "vlc.exe",
    "taskmgr":       "taskmgr.exe",
    "administrador de tareas": "taskmgr.exe",
}

def find_window(name):
    if not HAS_GW:
        return None
    name_lower = name.lower()
    for w in gw.getAllWindows():
        if w.title and name_lower in w.title.lower():
            return w
    return None

def handle(action, app=None):
    try:
        if action == "minimize_all":
            if HAS_GW:
                for w in gw.getAllWindows():
                    try: w.minimize()
                    except: pass
            return {"ok": True, "speak": "Todo minimizado."}

        if action == "open" and app:
            exe = KNOWN_APPS.get(app.lower())
            if exe:
                subprocess.Popen(exe, shell=True)
            else:
                subprocess.Popen(app, shell=True)
            return {"ok": True, "speak": f"Abriendo {app}."}

        if action == "close" and app:
            win = find_window(app)
            if win:
                try: win.close(); return {"ok": True, "speak": f"{app} cerrado."}
                except: pass
            exe = KNOWN_APPS.get(app.lower(), app + ".exe")
            subprocess.run(f"taskkill /f /im {exe}", shell=True, capture_output=True)
            return {"ok": True, "speak": f"Cerrando {app}."}

        if action == "minimize" and app:
            win = find_window(app)
            if win:
                win.minimize()
                return {"ok": True, "speak": f"{app} minimizado."}
            return {"ok": False, "speak": f"No encontré {app}."}

        if action == "maximize" and app:
            win = find_window(app)
            if win:
                win.maximize()
                return {"ok": True, "speak": f"{app} maximizado."}
            return {"ok": False, "speak": f"No encontré {app}."}

        if action == "focus" and app:
            win = find_window(app)
            if win:
                try: win.activate()
                except: win.minimize(); win.maximize()
                return {"ok": True, "speak": f"Cambiando a {app}."}
            return {"ok": False, "speak": f"No encontré {app}."}

        return {"ok": False, "speak": "Acción no reconocida."}

    except Exception as e:
        return {"ok": False, "error": str(e), "speak": "Error al ejecutar el comando."}


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)

        action = params.get("action", [""])[0]
        app    = params.get("app",    [None])[0]

        result = handle(action, app)
        print(f"[CMD] {action} {app or ''} → {'OK' if result.get('ok') else 'FAIL'}")

        self.send_response(200)
        self.send_header("Content-Type",                "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(result).encode())

    def log_message(self, *args):
        pass  # silenciar logs HTTP por defecto


if __name__ == "__main__":
    port = 5002
    try:
        server = HTTPServer(("localhost", port), Handler)
        print("=" * 50)
        print(f"  J.A.R.V.I.S Local Helper")
        print(f"  Escuchando en http://localhost:{port}")
        print(f"  Ventanas: {'✅' if HAS_GW else '❌ instala pygetwindow'}")
        print("  Minimiza esta ventana — no la cierres")
        print("=" * 50)
        server.serve_forever()
    except OSError:
        print(f"[ERROR] Puerto {port} en uso. ¿Ya está corriendo el helper?")
        sys.exit(1)
