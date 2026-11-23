#!/usr/bin/env bash
# Instalación en macOS / Linux
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Instala Node.js (LTS) desde https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install --omit=dev
node scripts/instalar-local.js "$@"
