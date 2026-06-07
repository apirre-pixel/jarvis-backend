#!/bin/bash
set -e

if [ -z "$GITHUB_TOKEN" ]; then
  echo "Error: GITHUB_TOKEN no encontrado en los secretos de Replit"
  exit 1
fi

git remote set-url origin "https://${GITHUB_TOKEN}@github.com/apirre-pixel/jarvis-backend.git"

git config user.email "jarvis@replit.com"
git config user.name "J.A.R.V.I.S Replit"

git add .
git commit -m "${1:-Update desde Replit}" 2>/dev/null || echo "(sin cambios nuevos)"

git push origin main

echo ""
echo "Listo — cambios subidos a GitHub correctamente"
