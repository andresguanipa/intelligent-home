#!/usr/bin/env bash
# =============================================================================
#  bootstrap.sh · deja un clon limpio listo para arrancar (idempotente)
# -----------------------------------------------------------------------------
#  - Crea .env y config/secrets.yaml desde sus plantillas si faltan.
#  - Descarga las tarjetas JS (layout-card, card-mod, kiosk-mode) a
#    config/www/vendor/. Se cargan por frontend.extra_module_url en
#    configuration.yaml, así NO dependen de recursos guardados en .storage.
#  - Descarga three.js (visor casa3d) a config/www/vendor/three/.
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
THREE_VERSION="${THREE_VERSION:-0.170.0}"   # visor casa3d (necesita OrbitControls: fija la versión)

# resolve_tag <owner/repo> <versión> → etiqueta concreta ("latest" = último release)
resolve_tag() {
  if [ "$2" = "latest" ]; then
    curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$1/releases/latest" | sed 's#.*/##'
  else
    echo "$2"
  fi
}

# url_release <owner/repo> <versión> <archivo>  (assets del release)
url_release() {
  if [ "$2" = "latest" ]; then
    echo "https://github.com/$1/releases/latest/download/$3"
  else
    echo "https://github.com/$1/releases/download/$2/$3"
  fi
}

# url_raw <owner/repo> <versión> <ruta>  (archivo commiteado en esa etiqueta)
url_raw() {
  echo "https://raw.githubusercontent.com/$1/$(resolve_tag "$1" "$2")/$3"
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
fetch "$(url_raw thomasloven/lovelace-layout-card "$LAYOUT_CARD_VERSION" layout-card.js)" "$VENDOR/layout-card.js"
fetch "$(url_raw thomasloven/lovelace-card-mod "$CARD_MOD_VERSION" card-mod.js)" "$VENDOR/card-mod.js"
fetch "$(url_release NemesisRE/kiosk-mode "$KIOSK_MODE_VERSION" kiosk-mode.js)" "$VENDOR/kiosk-mode.js"

echo "→ three.js $THREE_VERSION → config/www/vendor/three/"
TMP3="$(mktemp -d)"
fetch "https://registry.npmjs.org/three/-/three-$THREE_VERSION.tgz" "$TMP3/three.tgz"
tar -xzf "$TMP3/three.tgz" -C "$TMP3" package/build/three.module.js package/examples/jsm/controls/OrbitControls.js
mkdir -p "$VENDOR/three/addons/controls"
cp "$TMP3/package/build/three.module.js" "$VENDOR/three/three.module.js"
cp "$TMP3/package/examples/jsm/controls/OrbitControls.js" "$VENDOR/three/addons/controls/OrbitControls.js"
# HA no tiene import maps: el import desnudo "three" pasa a ruta relativa
sed -i "s#from 'three'#from '../../three.module.js'#; s#from \"three\"#from '../../three.module.js'#" "$VENDOR/three/addons/controls/OrbitControls.js"
rm -rf "$TMP3"

echo "→ Browser Mod → config/custom_components/browser_mod"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
BM_TAG="$(resolve_tag thomasloven/hass-browser_mod "$BROWSER_MOD_VERSION")"
fetch "https://github.com/thomasloven/hass-browser_mod/archive/refs/tags/$BM_TAG.zip" "$TMP/browser_mod.zip"
unzip -qo "$TMP/browser_mod.zip" -d "$TMP"
rm -rf "$CFG/custom_components/browser_mod"
mkdir -p "$CFG/custom_components"
cp -r "$TMP"/hass-browser_mod-*/custom_components/browser_mod "$CFG/custom_components/browser_mod"

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
