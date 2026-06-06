# J.A.R.V.I.S v1.12

> Just A Rather Very Intelligent System — Asistente IA holográfico con voz, chat en tiempo real y visualizador de audio.

## 🚀 Inicio rápido (local)

```bash
cd Jarvis_v1.12
npm install
npm start
```

Abre tu navegador en **http://localhost:3000**

---

## 🌐 Despliegue en internet (Railway)

Railway es la forma más fácil de tener Jarvis accesible desde cualquier lugar.

### Paso 1 — Instala Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### Paso 2 — Despliega

Desde la carpeta del proyecto:

```bash
railway init
railway up
```

### Paso 3 — Añade la API Key como variable de entorno

En el panel de Railway (https://railway.app/):
- Ve a tu proyecto → **Variables**
- Añade: `GROQ_API_KEY` = tu clave de Groq

### Paso 4 — Obtén la URL pública

Railway te dará una URL tipo `https://jarvis-xxx.up.railway.app` que puedes compartir con tus amigos.

---

## ⚙️ Variables de entorno

| Variable | Descripción |
|---|---|
| `GROQ_API_KEY` | Tu API Key de Groq (requerida) |
| `PORT` | Puerto del servidor (por defecto: 3000) |

---

## 🎙️ Funcionalidades

| Feature | Estado |
|---|---|
| Chat IA con Groq (LLaMA 3.3 70B) | ✅ |
| Streaming de respuestas en tiempo real | ✅ |
| Voz → Texto (Web Speech API) | ✅ Chrome/Edge |
| Texto → Voz (TTS) | ✅ |
| Waveform visualizer animado | ✅ |
| Arc Reactor animado | ✅ |
| Partículas de fondo | ✅ |
| Diseño holográfico (OpenJarvis style) | ✅ |
| Responsive móvil | ✅ |

---

## 📝 Notas

- El reconocimiento de voz (STT) funciona mejor en **Chrome** o **Edge**
- La voz TTS usa las voces instaladas en tu sistema operativo
- La API Key de Groq puede configurarse también desde el panel ⚙️ en la interfaz
- **Nunca subas el archivo `.env` a GitHub** — está en `.gitignore` por seguridad

---

*Jarvis v1.12 — Desarrollado con ❤️ y tecnología holográfica*
