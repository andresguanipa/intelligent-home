// =============================================================================
//  app.js · visor independiente del modelo 3D (sin Home Assistant)
//  URL:  /local/casa3d/index.html
//    ?on=sala,cocina   luces encendidas al cargar      ?ui=0       oculta botones
//    ?cutaway=0        muros completos                 ?orbit=0    cámara fija
//    ?view=top         vista en planta (para comparar con el plano)
//    ?render=1         1920×1200 fijo, para scripts/render-layers.mjs
//  API:  window.casa3d.setLight(id, on) · toggleLight(id) · setOpening(id, open)
//        postMessage({ casa3d: "light", room: "sala", on: true }) desde el padre
//  Para controlar luces reales de Home Assistant usa la tarjeta casa3d-card.js.
// =============================================================================
import { createHouse3D } from "./house3d.js";

const params = new URLSearchParams(location.search);
const RENDER = params.get("render") === "1";
if (params.get("ui") === "0" || RENDER) document.body.classList.add("noui");

const stage = document.getElementById("stage");
stage.style.position = "fixed";
const h = await createHouse3D(stage, {
  interactive: params.get("orbit") !== "0",
  cutaway: params.get("cutaway") !== "0",
  view: params.get("view"),
  fixedSize: RENDER ? [1920, 1200] : null,
  onRoomTap: (id) => toggleLight(id),
});

const panel = document.getElementById("panel");
const state = new Map();
function setLight(id, on) {
  if (!h.lights.has(id)) return;
  state.set(id, !!on);
  h.setLight(id, on);
  document.querySelector(`button[data-room="${id}"]`)?.classList.toggle("on", !!on);
  window.parent !== window && parent.postMessage({ casa3d: "state", room: id, on: !!on }, "*");
}
const toggleLight = (id) => setLight(id, !state.get(id));

for (const id of h.roomIds) {
  const r = h.rooms.find((q) => q.id === id);
  const b = document.createElement("button");
  b.dataset.room = id;
  b.textContent = `💡 ${r.name}`;
  b.onclick = () => toggleLight(id);
  panel.appendChild(b);
  h.addMarker({ room: id, emoji: "💡", title: r.name, onTap: () => toggleLight(id) });
}
(params.get("on") ?? "").split(",").filter(Boolean).forEach((id) => setLight(id, true));
addEventListener("message", (e) => {
  if (e.data?.casa3d === "light") setLight(e.data.room, e.data.on);
});

window.casa3d = {
  rooms: h.roomIds, setLight, toggleLight, setOpening: h.setOpening,
  renderLayer: h.renderLayer, renderBase: h.renderBase, project: h.project, ready: true,
};
