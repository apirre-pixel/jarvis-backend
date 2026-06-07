#!/bin/bash
set -e

if [ -z "$GITHUB_TOKEN" ]; then
  echo "Error: GITHUB_TOKEN no encontrado en los secretos de Replit"
  exit 1
fi

echo "Configurando acceso a GitHub..."
git remote set-url origin "https://${GITHUB_TOKEN}@github.com/apirre-pixel/jarvis-backend.git"

git config user.email "jarvis@replit.com"
git config user.name "J.A.R.V.I.S Replit"

PENDING=$(git rev-list origin/main..main 2>/dev/null | wc -l | tr -d ' ')
echo "Commits pendientes de subir: $PENDING"

echo "Subiendo a GitHub..."
git push origin main

echo ""
echo "Listo — GitHub actualizado correctamente"
