@echo off
title J.A.R.V.I.S Local
color 0B
echo.
echo  ==========================================
echo    J.A.R.V.I.S Local -- Iniciando...
echo  ==========================================
echo.

python jarvis_local.py

if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Algo salió mal. ¿Tienes Python instalado?
    pause
)
