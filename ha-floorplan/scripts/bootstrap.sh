#!/usr/bin/env bash
# =============================================================================
#  bootstrap.sh · deja un clon limpio listo para arrancar (idempotente)
# -----------------------------------------------------------------------------
#  - Crea .env y config/secrets.yaml desde sus plantillas si faltan.
#  - Descarga las tarjetas JS (layout-card, card-mod, kiosk-mode) a
#    config/www/vendor/. Se cargan por frontend.extra_module_url en
#    configuration.yaml, así NO dependen de recursos guardados en .storage.
#  - Descarga la integración Browser Mod a config/custom_components/.
#  - Opcional: INSTALL_HACS=1 instala también HACS (necesita el contenedor activo).
#
#  Versiones: por defecto "latest". Para fijarlas:
#    LAYOUT_CARD_VERSION=v2.4.7 CARD_MOD_VERSION=v4.1.0 ./scripts/bootstrap.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CFG="$ROOT/config"
VENDOR="$CFG/www/vendor"

LAYOUT_CARD_VERSION="${LAYOUT_CARD_VERSION:-latest}"
CARD_MOD_VERSION="${CARD_MOD_VERSION:-latest}"
KIOSK_MODE_VERSION="${KIOSK_MODE_VERSION:-latest}"
BROWSER_MOD_VERSION="${BROWSER_MOD_VERSION:-latest}"

# url_release <owner/repo> <versión> <archivo>
url_release() {
  if [ "$2" = "latest" ]; then
    echo "https://github.com/$1/releases/latest/download/$3"
  else
    echo "https://github.com/$1/releases/download/$2/$3"
  fi
}

fetch() { # <url> <destino>
  echo "  ↓ $1"
  curl -fsSL --retry 3 -o "$2" "$1"
}

echo "→ Plantillas locales"
[ -f "$ROOT/.env" ] || { cp "$ROOT/.env.example" "$ROOT/.env"; echo "  creado .env"; }
[ -f "$CFG/secrets.yaml" ] || { cp "$CFG/secrets.yaml.example" "$CFG/secrets.yaml"; echo "  creado config/secrets.yaml"; }

echo "→ Tarjetas de Lovelace → config/www/vendor/"
mkdir -p "$VENDOR"
fetch "$(url_release thomasloven/lovelace-layout-card "$LAYOUT_CARD_VERSION" layout-card.js)" "$VENDOR/layout-card.js"
fetch "$(url_release thomasloven/lovelace-card-mod "$CARD_MOD_VERSION" card-mod.js)" "$VENDOR/card-mod.js"
fetch "$(url_release NemesisRE/kiosk-mode "$KIOSK_MODE_VERSION" kiosk-mode.js)" "$VENDOR/kiosk-mode.js"

echo "→ Browser Mod → config/custom_components/browser_mod"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
fetch "$(url_release thomasloven/hass-browser_mod "$BROWSER_MOD_VERSION" browser_mod.zip)" "$TMP/browser_mod.zip"
mkdir -p "$CFG/custom_components/browser_mod"
unzip -qo "$TMP/browser_mod.zip" -d "$CFG/custom_components/browser_mod"

if [ "${INSTALL_HACS:-0}" = "1" ]; then
  echo "→ HACS (requiere 'docker compose up -d' previo)"
  docker exec homeassistant bash -c "wget -O - https://get.hacs.xyz | bash -"
fi

cat <<MSG

✔ Listo. Siguientes pasos:
  1. docker compose up -d
  2. Completa el asistente en http://<host>:8123
  3. (Opcional, sin dispositivos) activa los datos de demo:
       cp packages_available/demo.yaml config/packages/demo.yaml
  4. Añade las integraciones con login: Google Nest y Browser Mod (ver CLAUDE.md §4).
MSG
