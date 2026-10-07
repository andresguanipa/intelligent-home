# Casa 3D · Home Assistant "Config as Code"

Proyecto de Home Assistant Core en Docker con un **dashboard de planta 3D** para tablet en horizontal. Toda la configuración vive en Git; la UI de Home Assistant solo se usa para integraciones que requieren inicio de sesión (Nest, Browser Mod).

## Estructura

```
ha-floorplan/
├── docker-compose.yml            # HA Core, versión fijada por HA_VERSION (.env), healthcheck
├── .env.example                  # HA_VERSION y TZ → cópialo a .env
├── CLAUDE.md                     # esta guía
├── .gitignore · .yamllint
├── scripts/
│   ├── bootstrap.sh              # prepara un clon limpio (tarjetas JS, Browser Mod, plantillas)
│   └── backup.sh                 # copia del estado que NO está en Git (.storage, BD, secrets)
├── packages_available/
│   └── demo.yaml                 # luces/personas de ejemplo (cópialo a config/packages/ para usarlo)
└── config/                       # → /config dentro del contenedor
    ├── configuration.yaml        # núcleo, http, temas, dashboards YAML
    ├── secrets.yaml.example      # plantilla de secretos
    ├── packages/
    │   ├── timbre.yaml           # helpers + automatización Nest + script de prueba
    │   └── reciclaje.yaml        # input_number del día + sensor
    ├── automations.yaml · scripts.yaml · scenes.yaml   # reservados para la UI
    ├── themes/floorplan_dark.yaml
    ├── dashboards/floorplan.yaml # el dashboard 3D (layout-card + picture-elements)
    └── www/floorplan/            # PNG del mapa (→ /local/floorplan/…)
```

La CI (`.github/workflows/validate.yml`) ejecuta `yamllint` y `check_config` con la imagen oficial en cada push.

Las imágenes incluidas son **marcadores de prueba** (un plano isométrico genérico, con fondo transparente) para que el dashboard funcione desde el primer arranque.

---

## 1. Arrancar Home Assistant

```bash
cd ha-floorplan
./scripts/bootstrap.sh        # crea .env y secrets.yaml, descarga tarjetas JS y Browser Mod
docker compose up -d
docker compose logs -f homeassistant   # espera a "Home Assistant initialized"
```

Abre `http://<IP-del-host>:8123`, crea tu usuario y completa el asistente. Verás **Casa 3D** en la barra lateral (las tarjetas ya las cargó `bootstrap.sh`).

> Docker Desktop (Mac/Windows): activa *Settings → Resources → Network → Enable host networking*, o sustituye `network_mode: host` por `ports: ["8123:8123"]` (perderás el autodescubrimiento).

---

## 2. Tarjetas personalizadas (declarativas, sin HACS)

`scripts/bootstrap.sh` descarga **layout-card**, **card-mod** y **kiosk-mode** a `config/www/vendor/` y `configuration.yaml` las carga con `frontend: extra_module_url`. No dependen de recursos guardados en `.storage`, así que un clon limpio funciona igual. Para fijar versiones: `CARD_MOD_VERSION=v4.1.0 ./scripts/bootstrap.sh` (ver variables en el script).

| Tarjeta | Autor | Uso en este diseño |
|---|---|---|
| **layout-card** | thomasloven | `custom:grid-layout`: cuadrícula 25 % / 50 % / 25 % y una columna en vertical |
| **card-mod** | thomasloven | `card_mod: style:` → fondos translúcidos, blur, bordes curvos |
| **Kiosk Mode** | NemesisRE | `kiosk_mode: hide_header` → oculta barras en la tablet |

**Kiosk mode:** para volver a ver las barras, añade `?disable_km` a la URL: `http://<host>:8123/casa-3d?disable_km`.

**HACS es opcional.** Si lo quieres para otras integraciones: `INSTALL_HACS=1 ./scripts/bootstrap.sh` (con el contenedor en marcha), reinicia y añade la integración en la UI. Si instalas card-mod desde HACS además, quita su entrada de `extra_module_url` para no cargarlo dos veces.

## 3. Probar sin dispositivos

```bash
cp packages_available/demo.yaml config/packages/demo.yaml   # y reinicia HA
```
Crea `light.sala/cocina/dormitorio` virtuales y `person.yo/familiar`. No cubre `weather`, `media_player.sala` ni la cámara Nest.

---

## 4. Browser Mod + Nest Doorbell

### 4.1 Browser Mod (popup del timbre)
1. `bootstrap.sh` ya copió la integración a `config/custom_components/browser_mod`.
2. Reinicia Home Assistant.
3. **Ajustes → Dispositivos y servicios → + Añadir integración → Browser Mod**.

### 4.2 Google Nest
1. **Ajustes → Dispositivos y servicios → + Añadir integración → Google Nest**. El asistente te guía por la Device Access Console de Google (pago único de 5 USD) y el proyecto de Google Cloud.
2. Cuando termine, ve a **Herramientas para desarrolladores → Estados** y anota:
   - la cámara: `camera.<algo>` → sustituye `camera.timbre_puerta`
   - el evento del timbre: `event.<algo>_chime` → sustituye `event.timbre_puerta_chime`

Cámbialos en `config/packages/timbre.yaml` (bloque `variables` y `trigger`) y en `dashboards/floorplan.yaml` (solo la primera aparición de la cámara, la que lleva el ancla `&camara_timbre`; el resto la reutiliza).

### 4.3 Registrar la tablet
En la tablet, abre Home Assistant → panel **Browser Mod** (barra lateral) → activa **Register** y en *Browser ID* escribe `tablet_salon`. Ese es el ID de la variable `tablet` en `packages/timbre.yaml`.

### 4.4 Probar sin que nadie llame
**Ajustes → Automatizaciones y escenas → Scripts → "Timbre · Probar alerta de cámara" → Ejecutar.** Cambia `input_select.timbre_modo_alerta` entre `popup` y `overlay` para ver los dos modos.

---

## 5. Adaptar las entidades de ejemplo

Edita `config/dashboards/floorplan.yaml` (la cabecera lista todas). Los cambios en el dashboard **no requieren reinicio**: guarda y refresca el navegador. Los cambios en `configuration.yaml` y los packages requieren reinicio (o recarga desde *Herramientas para desarrolladores → YAML*).

Antes de reiniciar, valida la configuración:

```bash
docker exec homeassistant python -m homeassistant --script check_config -c /config
yamllint -c .yamllint .     # opcional, local
```

---

## 6. Crear tu propio mapa 3D

### Software recomendado
- **Sweet Home 3D** (gratis, Windows/Mac/Linux) — **el recomendado**. Es el estándar de facto en la comunidad de Home Assistant: dibujas muros desde el plano, colocas muebles, fijas una cámara aérea y renderizas varias versiones con luces encendidas/apagadas desde la *misma* posición de cámara.
- **Planner 5D** o **Floorplanner** (web) — más rápidos para empezar, pero exportar renders de alta resolución y con iluminación controlada suele requerir plan de pago.
- **Blender** (gratis) — máximo realismo y control de luces, curva de aprendizaje alta. Úsalo si quieres un acabado fotorrealista.

### Flujo en Sweet Home 3D
1. *Plano → Importar asistente de imagen de fondo* y calca tu plano real (escala con una medida conocida).
2. Dibuja muros, puertas, ventanas y muebles.
3. *Vista 3D → Vista aérea*. Encuadra la casa en diagonal (estilo isométrico) y **guarda el punto de vista** (*Vista 3D → Almacenar punto de vista*). No muevas la cámara a partir de aquí.
4. Ajusta el render: *Vista 3D → Crear foto*, máxima calidad, **1920×1200** (16:10, ideal para tablet) y **la misma resolución en todos los renders**.
5. Render 1 → todas las luces apagadas, ambiente nocturno → `casa_base.png`.
6. Render 2, 3, 4… → misma cámara, encendiendo solo la luz de una habitación (en Sweet Home 3D, cada lámpara tiene "potencia de luz") → `sala_on.png`, `cocina_on.png`, `dormitorio_on.png`.

### Convertir los renders "encendidos" en capas
Las capas deben ser **PNG del mismo tamaño que la base, transparentes salvo la habitación iluminada**. Dos opciones:
- **Rápida:** usa los renders completos tal cual. Funcionan porque cada capa cubre toda la imagen; solo verás una habitación iluminada a la vez.
- **Correcta (permite varias luces a la vez):** en GIMP/Photoshop/Photopea abre el render encendido, selecciona la habitación con el lazo poligonal, invierte la selección, borra y exporta como PNG con transparencia.

### Dónde soltar las imágenes
```
ha-floorplan/config/www/floorplan/
```
Sobrescribe `casa_base.png`, `sala_on.png`, `cocina_on.png` y `dormitorio_on.png` con los mismos nombres. Se sirven en `/local/floorplan/…`.

- Si la carpeta `www` **no existía** cuando arrancó Home Assistant, reinicia una vez (`docker compose restart homeassistant`); `/local/` se registra al arrancar.
- El navegador cachea `/local/`: fuerza la recarga (Ctrl+Shift+R) o añade `?v=2` al final de la ruta de la imagen en el YAML.
- Tras cambiar el render, **reubica los iconos** (`state-icon` → `top`/`left` en %) en el centro de cada habitación. Truco: abre la imagen en un visor, pasa el ratón por el centro de la habitación y divide la coordenada x/y entre el ancho/alto de la imagen.
- Fondo del render: exporta con fondo transparente o color oscuro (#0b0d14) para que se funda con el tema.

---

## 7. Convenciones del proyecto
- Entidades de ejemplo en español y en minúsculas (`light.sala`).
- Estilo cristal compartido con anclas YAML (`&cristal` / `*cristal`) dentro de `floorplan.yaml`.
- Nada de secretos en Git: usa `config/secrets.yaml` (ignorado) y `!secret`.
- Automatizaciones y scripts "de código" van en `config/packages/` (los comentarios sobreviven); `automations.yaml`/`scripts.yaml` son para la UI.
- Una sola fuente de verdad: zona horaria y versión en `.env`; cámara del timbre con ancla YAML.
- Copias de seguridad del estado fuera de Git: `./scripts/backup.sh` (rota las últimas 14).
- Si expones HA fuera de la LAN: usa un proxy inverso con TLS y descomenta `trusted_proxies` en `configuration.yaml`.
