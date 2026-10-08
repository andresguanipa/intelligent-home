// =============================================================================
//  casa3d-card.js · tarjeta de Lovelace con el modelo 3D conectado a Home Assistant
//  Se carga con frontend.extra_module_url (/local/casa3d/casa3d-card.js).
//
//  type: custom:casa3d-card
//  lights:                         # opcional: sobrescribe "light" de house.json
//    sala: light.sala              #   id de habitación → entidad
//  openings:                       # opcional: puertas/ventanas con sensor
//    puerta_dorm2: binary_sensor.puerta_dormitorio   # on = abierta, off = cerrada
//  markers:                        # opcional: iconos extra sobre el plano (light.* = botón on/off)
//    - entity: camera.timbre_puerta
//      icon: mdi:doorbell-video
//      at: [3.5, 21]               #   pies, mismas coordenadas que house.json
//  doorbell:                       # opcional: vídeo superpuesto cuando overlay = on
//    overlay: input_boolean.timbre_overlay
//    camera: camera.timbre_puerta
//  interactive: false              # true = orbitar/zoom con el dedo (expandido siempre se puede)
//  Tocar el plano lo expande a pantalla completa (botón ⤢/✕ o Esc para cerrar).
//  Expandido, tocar una habitación enciende/apaga su luz; los iconos lo hacen siempre.
//  cutaway: true                   # false = muros completos
//  aspect_ratio: "16/10"
//  house: /local/casa3d/house.json # opcional
//
//  Toque en una habitación o en su icono: enciende/apaga. Mantener el icono: más info.
// =============================================================================
import { createHouse3D } from "./house3d.js?v=3";   // ?v= salta la caché de /local/ (31 días)

class Casa3DCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._states = {};
  }

  setConfig(config) {
    this._config = {
      interactive: false, cutaway: true, aspect_ratio: "16/10", lights: {}, openings: {}, markers: [], ...config,
    };
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; }
        ha-card { overflow:hidden; background:rgba(8,10,16,.65); }
        #stage { position:relative; width:100%; aspect-ratio:${this._config.aspect_ratio}; }
        #fs { position:absolute; top:10px; right:10px; z-index:6; width:36px; height:36px; border-radius:50%;
              border:1px solid rgba(255,255,255,.18); background:rgba(10,12,18,.55); color:#dfe4f0;
              font:18px/1 system-ui; cursor:pointer; backdrop-filter:blur(6px); }
        #fs:hover { background:rgba(40,46,64,.75); }
        :host(.exp) ha-card { height:100%; border-radius:0 !important; border:0 !important; box-shadow:none !important; }
        :host(.exp) #stage { aspect-ratio:auto; height:100%; }
        :host(:fullscreen) { width:100vw; height:100vh; background:#0a0d14; }
        :host(.fx) { position:fixed; inset:0; z-index:99999; display:block; background:#0a0d14; }
        #msg { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
               color:#9aa3b8; font:14px system-ui; text-align:center; padding:16px; }
        #overlay { position:absolute; inset:0; display:none; align-items:center; justify-content:center;
               background:rgba(5,6,10,.72); backdrop-filter:blur(6px); z-index:5; }
        #overlay.show { display:flex; }
        #overlay .box { width:78%; border:2px solid #ffc45c; border-radius:18px; overflow:hidden;
               box-shadow:0 0 40px rgba(255,196,92,.45); }
        #overlay .box:empty { display:none; }
        #overlay .title { position:absolute; top:6%; color:#ffc45c; font:600 20px system-ui; }
      </style>
      <ha-card>
        <div id="stage"><div id="msg">Cargando modelo 3D…</div>
          <button id="fs" title="Pantalla completa" aria-label="Pantalla completa">⤢</button>
          <div id="overlay"><div class="title">🔔 Llaman a la puerta</div><div class="box"></div></div>
        </div>
      </ha-card>`;
    this._stage = this.shadowRoot.getElementById("stage");
    // Tocar el plano (sin arrastrar) lo expande; los iconos paran el clic.
    let down = null;
    this._stage.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
    this._stage.addEventListener("click", (e) => {
      if (this._expanded || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      this._toggleExpand(true);
    });
    this.shadowRoot.getElementById("fs").addEventListener("click", (e) => { e.stopPropagation(); this._toggleExpand(); });
    this._house?.dispose();
    this._house = null;
    this._init();
  }

  set hass(hass) {
    this._hass = hass;
    this._sync();
  }

  getCardSize() { return 6; }
  getGridOptions() { return { columns: 12, rows: 6 }; }
  static getStubConfig() { return { type: "custom:casa3d-card" }; }

  connectedCallback() {
    this.addEventListener("fullscreenchange", this._onFs);
    this.addEventListener("webkitfullscreenchange", this._onFs);
    if (this._config && !this._house && !this._initializing) this._init();
  }
  _onFs = () => {
    const fs = this.matches(":fullscreen") || this.matches(":-webkit-full-screen");
    if (fs) this._setExpanded(true);
    else if (this._expanded && !this._fx) this._setExpanded(false);
  };

  _toggleExpand(force) {
    const want = force ?? !this._expanded;
    if (want === this._expanded) return;
    if (want) {
      const req = this.requestFullscreen ?? this.webkitRequestFullscreen;
      const fallback = () => { if (!this._expanded) this._setExpanded(true, true); };
      if (!req) return fallback();
      try { Promise.resolve(req.call(this)).catch(fallback); } catch { fallback(); }
      // algunos navegadores (WebView, paneles integrados) no responden ni rechazan
      setTimeout(() => { if (!this._expanded && !this.matches(":fullscreen")) fallback(); }, 500);
    } else if (this._fx) {
      this._setExpanded(false);
    } else {
      (document.exitFullscreen ?? document.webkitExitFullscreen)?.call(document);
    }
  }

  _setExpanded(on, fallback = false) {
    this._expanded = on;
    this._fx = on && fallback;
    this.classList.toggle("exp", on);
    this.classList.toggle("fx", this._fx);
    const b = this.shadowRoot.getElementById("fs");
    b.textContent = on ? "✕" : "⤢";
    b.title = on ? "Cerrar" : "Pantalla completa";
    this._house?.setInteractive?.(on || this._config.interactive);
    requestAnimationFrame(() => this._house?.resize?.());
  }

  disconnectedCallback() {
    this.removeEventListener("fullscreenchange", this._onFs);
    this.removeEventListener("webkitfullscreenchange", this._onFs);
    if (this._expanded) this._setExpanded(false);
    this._house?.dispose();
    this._house = null;
  }

  async _init() {
    if (this._initializing || !this.isConnected) return;
    this._initializing = true;
    const cfg = this._config;
    try {
      const house = cfg.house ? await (await fetch(cfg.house)).json() : undefined;
      this._stage.querySelector("#msg")?.remove();
      const h = await createHouse3D(this._stage, {
        house,
        interactive: cfg.interactive,
        cutaway: cfg.cutaway,
        background: "transparent",
        // contraído, tocar el plano lo expande (ver setConfig); expandido, enciende la luz
        onRoomTap: (id) => { if (this._expanded) this._toggle(this._lightEntity(id)); },
      });
      this._house = h;
      // un icono por habitación con luz
      this._markers = new Map();
      for (const room of h.rooms.filter((r) => r.light || cfg.lights[r.id])) {
        const ent = this._lightEntity(room.id);
        const m = h.addMarker({
          room: room.id, icon: "mdi:lightbulb", emoji: "💡", title: room.name,
          onTap: () => this._toggle(ent), onHold: () => this._moreInfo(ent),
        });
        this._markers.set(ent, m);
      }
      this._cmarkers = [];
      for (const mk of cfg.markers) {
        // las luces se encienden/apagan al tocar por defecto; mantener = más info
        const toggle = (mk.tap_action ?? (mk.entity?.startsWith("light.") ? "toggle" : "more-info")) === "toggle";
        const m = h.addMarker({
          at: mk.at, room: mk.room, icon: mk.icon ?? "mdi:circle", emoji: "●", title: mk.name ?? mk.entity,
          onTap: () => (toggle ? this._toggle(mk.entity) : this._moreInfo(mk.entity)),
          onHold: () => this._moreInfo(mk.entity),
        });
        this._cmarkers.push({ mk, m });
      }
      this._states = {};
      this._sync();
    } catch (e) {
      console.error("casa3d-card:", e);
      this._stage.innerHTML = `<div id="msg">No se pudo cargar el modelo 3D (¿WebGL, o falta ejecutar scripts/bootstrap.sh?)<br>${e.message}</div>`;
    } finally {
      this._initializing = false;
    }
  }

  _lightEntity(roomId) {
    return this._config.lights[roomId] ?? this._house?.rooms.find((r) => r.id === roomId)?.light;
  }

  _toggle(entityId) {
    if (!entityId || !this._hass) return;
    this._hass.callService("homeassistant", "toggle", { entity_id: entityId });
  }

  _moreInfo(entityId) {
    if (!entityId) return;
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  _sync() {
    const h = this._house, hass = this._hass;
    if (!h || !hass) return;
    const changed = (ent) => {
      const st = hass.states[ent];
      if (this._states[ent] === st) return null;
      this._states[ent] = st;
      return st ?? undefined;
    };
    // luces
    for (const room of h.rooms.filter((r) => r.light || this._config.lights[r.id])) {
      const ent = this._lightEntity(room.id);
      const st = changed(ent);
      if (st === null) continue;
      const on = st?.state === "on";
      const rgb = st?.attributes?.rgb_color;
      h.setLight(room.id, on, {
        brightness: st?.attributes?.brightness != null ? st.attributes.brightness / 255 : 1,
        color: rgb ? `rgb(${rgb.join(",")})` : undefined,
      });
      this._markers?.get(ent)?.el.style.setProperty("opacity", st?.state === "unavailable" ? ".35" : "");
    }
    // marcadores propios: las luces reflejan su estado (encendida/apagada/no disponible)
    for (const { mk, m } of this._cmarkers ?? []) {
      if (!mk.entity?.startsWith("light.")) continue;
      const st = hass.states[mk.entity];
      m.setState(st?.state === "on");
      m.el.style.setProperty("opacity", !st || st.state === "unavailable" ? ".35" : "");
    }
    // puertas / ventanas con sensor
    for (const [id, ent] of Object.entries(this._config.openings)) {
      const st = changed(ent);
      if (st !== null && st) h.setOpening(id, st.state === "on");
    }
    // vídeo del timbre
    const db = this._config.doorbell;
    if (db) {
      const show = hass.states[db.overlay]?.state === "on";
      const ov = this.shadowRoot.getElementById("overlay");
      if (ov.classList.contains("show") !== show) {
        ov.classList.toggle("show", show);
        if (show) {
          this._mountCamera(db);
          // al sonar el timbre, el plano se expande para ver quién está fuera
          if (!this._expanded) { this._autoExp = true; this._toggleExpand(true); }
        } else {
          ov.querySelector(".box").replaceChildren();
          if (this._autoExp) { this._autoExp = false; this._toggleExpand(false); }
        }
      }
      ov.onclick = () => hass.callService("input_boolean", "turn_off", { entity_id: db.overlay });
      const cam = ov.querySelector(".box > *");
      if (cam) cam.hass = hass;
    }
  }

  async _mountCamera(db) {
    const helpers = await window.loadCardHelpers?.();
    if (!helpers) return;
    const card = await helpers.createCardElement({
      type: "picture-entity", entity: db.camera, camera_view: "live", show_name: false, show_state: false,
      tap_action: { action: "none" },
    });
    card.hass = this._hass;
    this.shadowRoot.querySelector("#overlay .box").replaceChildren(card);
  }
}

customElements.define("casa3d-card", Casa3DCard);
window.customCards = window.customCards || [];
window.customCards.push({
  type: "casa3d-card",
  name: "Casa 3D",
  description: "Modelo 3D (three.js) de la casa conectado a las luces de Home Assistant",
});
