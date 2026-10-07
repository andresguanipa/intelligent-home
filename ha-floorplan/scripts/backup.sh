#!/usr/bin/env bash
# Copia de seguridad del estado de HA que NO está en Git (.storage, base de datos,
# custom_components, secrets). Uso: ./scripts/backup.sh [carpeta-destino]
# Programa con cron, p. ej.:  0 3 * * *  /ruta/ha-floorplan/scripts/backup.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$ROOT/backups}"
KEEP="${KEEP:-14}"   # nº de copias a conservar
mkdir -p "$DEST"
FILE="$DEST/ha-state-$(date +%Y%m%d-%H%M%S).tar.gz"
cd "$ROOT/config"
tar -czf "$FILE" \
  $( [ -d .storage ] && echo .storage ) \
  $( [ -f secrets.yaml ] && echo secrets.yaml ) \
  $( [ -d custom_components ] && echo custom_components ) \
  $(ls home-assistant_v2.db 2>/dev/null || true)
chmod 600 "$FILE"
echo "✔ $FILE"
# Rotación
ls -1t "$DEST"/ha-state-*.tar.gz | tail -n +"$((KEEP + 1))" | xargs -r rm -f
