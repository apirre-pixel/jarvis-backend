# J.A.R.V.I.S Expo Go

App Android para Expo Go conectada al backend:

`https://jarvis-backend-3c4z.onrender.com`

## Abrir en Android con Expo Go

1. Instala Expo Go en el telefono Android.
2. Entra en esta carpeta:

   ```bash
   cd mobile-expo
   ```

3. Instala dependencias:

   ```bash
   npm install
   ```

4. Arranca Expo:

   ```bash
   npm start
   ```

5. Escanea el QR con Expo Go.

## Que incluye

- Pantalla de chat nativa.
- Comprobacion de estado con `/api/status`.
- Envio de mensajes a `/api/chat`.
- Lectura de respuestas SSE del backend.
- Boton para limpiar la conversacion.

## Backend

La URL esta definida en `App.js` como `BACKEND_URL`.
