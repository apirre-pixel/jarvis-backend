@echo off
title Instalar dependencias J.A.R.V.I.S
color 0B
echo.
echo  Instalando dependencias de J.A.R.V.I.S Local...
echo.

pip install flask flask-cors groq google-generativeai edge-tts pygetwindow pywin32

echo.
echo  Listo. Ahora puedes ejecutar start.bat
pause
