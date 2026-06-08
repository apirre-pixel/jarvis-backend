@echo off
title J.A.R.V.I.S Local
color 0B
echo.
echo  ==========================================
echo    J.A.R.V.I.S Local -- Iniciando...
echo  ==========================================
echo.
echo  Verificando dependencias...
pip install flask flask-cors groq google-generativeai edge-tts pygetwindow pywin32 --quiet --disable-pip-version-check
echo  Dependencias OK
echo.
python jarvis_local.py

if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Algo salio mal.
    pause
)
