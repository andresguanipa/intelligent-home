# Casa 3D · Home Assistant "Config as Code"

Proyecto de Home Assistant Core en Docker con un **dashboard de planta 3D** para tablet en horizontal. Toda la configuración vive en Git; la UI de Home Assistant solo se usa para integraciones que requieren inicio de sesión (Nest, HACS).

## Estructura

```
ha-floorplan/
├── docker-compose.yml            # Home Assistant Core · TZ America/Denver
├── CLAUDE.md                     # esta guía
├── .gitignore                    # excluye secretos, BD y caché
└── config/                       # → /config dentro del contenedor
    ├── configuration.yaml        # dashboards YAML, helpers, sensor de reciclaje
    ├── automations.yaml          # timbre Nest → cámara sobre el mapa
    ├── scripts.yaml              # script de prueba del timbre
    ├── scenes.yaml
    ├── packages/                 # (vacío) para crecer por habitaciones
    ├── themes/
    │   └── floorplan_dark.yaml   # tema oscuro "cristal"
    ├── dashboards/
    │   └── floorplan.yaml        # el dashboard 3D (layout-card + picture-elements)
    └── www/                      # → servido en la URL /local/
        └── floorplan/
            ├── casa_base.png     # ← TU RENDER 3D VA AQUÍ (sustituye el de prueba)
            ├── sala_on.png       # capa de luz encendida (sala)
            ├── cocina_on.png     # capa de luz encendida (cocina)
            ├── dormitorio_on.png # capa de luz encendida (dormitorio)
            └── transparente.png  # PNG vacío para el estado "apagado"
```

Las imágenes incluidas son **marcadores de prueba** (un plano isométrico genérico) para que el dashboard funcione desde el primer arranque.

---

## 1. Arrancar Home Assistant

```bash
cd ha-floorplan
docker compose up -d
docker compose logs -f homeassistant   # espera a "Home Assistant initialized"
```

Abre `http://<IP-del-host>:8123`, crea tu usuario y completa el asistente. Verás **Casa 3D** en la barra lateral (aún sin estilos: faltan las tarjetas de HACS).

> Docker Desktop (Mac/Windows): activa *Settings → Resources → Network → Enable host networking*, o sustituye `network_mode: host` por `ports: ["8123:8123"]` (perderás el autodescubrimiento).

---

## 2. Instalar HACS (Home Assistant Community Store)

HACS se instala **dentro del contenedor** con el script oficial:

```bash
docker exec -it homeassistant bash -c "wget -O - https://get.hacs.xyz | bash -"
docker compose restart homeassistant
```

Después, en la UI:

1. Limpia la caché del navegador (Ctrl+Shift+R).
2. **Ajustes → Dispositivos y servicios → + Añadir integración → "HACS"**.
3. Acepta las casillas de aviso y pulsa **Enviar**.
4. HACS muestra un código: ábrelo en `https://github.com/login/device`, inicia sesión con tu cuenta de GitHub (gratuita) y autoriza.
5. Aparecerá **HACS** en la barra lateral.

La carpeta resultante es `config/custom_components/hacs/` (ya está en `.gitignore`).

---

## 3. Instalar las tarjetas obligatorias

En **HACS → buscador**, instala cada una (botón ⋮ → *Descargar*). Como el dashboard principal está en modo almacenamiento, HACS registra automáticamente el recurso JavaScript; solo tienes que recargar el navegador.

| Repositorio | Autor | Para qué se usa en este diseño |
|---|---|---|
| **layout-card** | thomasloven | `type: custom:grid-layout` → la cuadrícula 25 % / 50 % / 25 % y el cambio a una columna en vertical |
| **card-mod** | thomasloven | `card_mod: style:` → fondos translúcidos, `backdrop-filter: blur`, bordes curvos, borde verde de reciclaje |
| **Kiosk Mode** | NemesisRE | `kiosk_mode: hide_header` → oculta la barra superior y lateral en la tablet |

Comprueba los recursos en **Ajustes → Paneles → ⋮ → Recursos**. Deben aparecer `layout-card.js`, `card-mod.js` y `kiosk-mode.js`.

**Recomendado tras instalar card-mod:** descomenta en `configuration.yaml` el bloque `frontend: extra_module_url` y reinicia. Así los estilos cargan antes y no hay "parpadeo" al abrir el dashboard.

**Kiosk mode:** para volver a ver las barras (editar, depurar), añade `?disable_km` a la URL: `http://<host>:8123/casa-3d?disable_km`.

---

## 4. Browser Mod + Nest Doorbell

### 4.1 Browser Mod (popup del timbre)
1. **HACS → buscar "Browser Mod"** (thomasloven) → Descargar. Es una **integración**, no solo una tarjeta.
2. Reinicia Home Assistant.
3. **Ajustes → Dispositivos y servicios → + Añadir integración → Browser Mod**.

### 4.2 Google Nest
1. **Ajustes → Dispositivos y servicios → + Añadir integración → Google Nest**. El asistente te guía por la Device Access Console de Google (pago único de 5 USD) y el proyecto de Google Cloud.
2. Cuando termine, ve a **Herramientas para desarrolladores → Estados** y anota:
   - la cámara: `camera.<algo>` → sustituye `camera.timbre_puerta`
   - el evento del timbre: `event.<algo>_chime` → sustituye `event.timbre_puerta_chime`

Busca y reemplaza esos dos IDs en `dashboards/floorplan.yaml` y `automations.yaml`.

### 4.3 Registrar la tablet
En la tablet, abre Home Assistant → panel **Browser Mod** (barra lateral) → activa **Register** y en *Browser ID* escribe `tablet_salon`. Ese es el ID al que apunta el popup en `automations.yaml`.

### 4.4 Probar sin que nadie llame
**Ajustes → Automatizaciones y escenas → Scripts → "Timbre · Probar alerta de cámara" → Ejecutar.** Cambia `input_select.timbre_modo_alerta` entre `popup` y `overlay` para ver los dos modos.

---

## 5. Adaptar las entidades de ejemplo

Edita `config/dashboards/floorplan.yaml` (la cabecera lista todas). Los cambios en el dashboard **no requieren reinicio**: guarda y refresca el navegador. Los cambios en `configuration.yaml` sí requieren reinicio; las automatizaciones se recargan desde *Herramientas para desarrolladores → YAML*.

Antes de reiniciar, valida la configuración:

```bash
docker exec homeassistant python -m homeassistant --script check_config -c /config
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
