// =============================================================================
//  casa3d · visor three.js generado desde house.json
//  URL:  /local/casa3d/index.html
//    ?on=sala,cocina   luces encendidas al cargar
//    ?ui=0             oculta los botones
//    ?cutaway=0        muros completos (por defecto se rebajan los que dan a la cámara)
//    ?render=1         tamaño fijo 1920×1200 y sin controles (para scripts/render-layers.mjs)
//  API:  window.casa3d.setLight(id, on) · toggleLight(id) · rooms · renderLayer(id)
//        postMessage({ casa3d: "light", room: "sala", on: true }) desde el padre
// =============================================================================
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const params = new URLSearchParams(location.search);
const RENDER = params.get("render") === "1";
const CUTAWAY = params.get("cutaway") !== "0";
if (params.get("ui") === "0" || RENDER) document.body.classList.add("noui");

const house = await (await fetch("./house.json")).json();
const WALL_H = house.wallHeight;
const T = house.wallThickness;
const { width: W, depth: D } = house.outline;

// ---- escena -----------------------------------------------------------------
const stage = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(RENDER ? 1 : Math.min(devicePixelRatio, 2));
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const BG = new THREE.Color("#0b0d14");
scene.background = BG;

scene.add(new THREE.HemisphereLight("#f4f1ea", "#7d7a73", 1.7));
const sun = new THREE.DirectionalLight("#ffffff", 1.1);
sun.position.set(-20, 40, 30);
scene.add(sun);

const mat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...extra });

// plano (x, y) en pies → three (X, Z); Y es la altura
function box(x, y, w, d, h, elev, color, parent = scene, extra) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra));
  m.position.set(x + w / 2, elev + h / 2, y + d / 2);
  parent.add(m);
  return m;
}

// ---- suelos -----------------------------------------------------------------
box(0, 0, W, D, 0.3, -0.3, "#d3cec2");
for (const r of house.rooms) {
  if (r.overlay) continue;
  const [x0, y0, x1, y1] = r.rect;
  box(x0, y0, x1 - x0, y1 - y0, 0.04, 0, r.floor);
}

// ---- muros (con huecos para ventanas) ----------------------------------------
const glassMat = new THREE.MeshStandardMaterial({
  color: "#7ea6c0", roughness: 0.2, transparent: true, opacity: 0.55,
});
const WALL = "#c4c2bc", WALL_EXT = "#b3b0a8", CAP = "#efede8";
const walls = new THREE.Group();
scene.add(walls);

function wallPiece(a, b, t0, t1, z0, z1, color, nearCamera) {
  if (t1 - t0 < 0.01 || z1 - z0 < 0.01) return;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
  const mx = a[0] + ux * (t0 + t1) / 2, my = a[1] + uy * (t0 + t1) / 2;
  const geo = new THREE.BoxGeometry(t1 - t0 + (t0 === 0 ? T / 2 : 0), z1 - z0, T);
  const m = new THREE.Mesh(geo, mat(color));
  m.position.set(mx - (t0 === 0 ? ux * T / 4 : 0), (z0 + z1) / 2, my - (t0 === 0 ? uy * T / 4 : 0));
  m.rotation.y = -Math.atan2(dy, dx);
  m.userData.nearCamera = nearCamera;
  m.userData.z1 = z1;
  walls.add(m);
}

house.walls.forEach((w, i) => {
  const ext = !!w.ext;
  // el muro sur (i=2) y el oeste (i=3) están del lado de la cámara
  const near = CUTAWAY && (i === 2 || i === 3);
  const top = near ? 3 : CUTAWAY && !ext ? 5 : WALL_H;
  const color = ext ? WALL_EXT : WALL;
  const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  const ops = house.openings.filter((o) => o.wall === i).sort((p, q) => p.at[0] - q.at[0]);
  let t = 0;
  for (const o of ops) {
    wallPiece(w.a, w.b, t, o.at[0], 0, top, color);
    const sill = Math.min(o.sill, top), head = Math.min(7, top);
    wallPiece(w.a, w.b, o.at[0], o.at[1], 0, sill, color);
    if (head > sill) {
      wallPiece(w.a, w.b, o.at[0], o.at[1], head, top, color);
      // vidrio
      const dx = w.b[0] - w.a[0], dy = w.b[1] - w.a[1], l = Math.hypot(dx, dy);
      const tm = (o.at[0] + o.at[1]) / 2;
      const g = new THREE.Mesh(new THREE.BoxGeometry(o.at[1] - o.at[0], head - sill, 0.08), glassMat);
      g.position.set(w.a[0] + dx / l * tm, (sill + head) / 2, w.a[1] + dy / l * tm);
      g.rotation.y = -Math.atan2(dy, dx);
      walls.add(g);
    }
    t = o.at[1];
  }
  wallPiece(w.a, w.b, t, len, 0, top, color);
});

// remate claro en la parte alta de cada pieza (da el borde blanco de los renders)
walls.children.forEach((m) => {
  if (m.material === glassMat) return;
  const p = m.geometry.parameters;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(p.width, 0.08, p.depth), mat(CAP));
  cap.position.y = p.height / 2 + 0.04;
  m.add(cap);
});

// ---- muebles ----------------------------------------------------------------
for (const f of house.furniture) {
  const [x, y] = f.pos;
  if (f.type === "bed") {
    const [w, d] = f.size;
    box(x, y, w, d, 1.5, 0, "#869db3");                       // colchón
    box(x - 0.1, y - 0.2, w + 0.2, 0.5, 3.6, 0, "#5d4636");   // cabecera
    box(x + 0.4, y + 0.4, w / 2 - 0.6, 1.4, 0.5, 1.5, "#f4f4f4");
    box(x + w / 2 + 0.2, y + 0.4, w / 2 - 0.6, 1.4, 0.5, 1.5, "#f4f4f4");
    continue;
  }
  const [w, d, h] = f.size;
  box(x, y, w, d, h, f.elev ?? 0, f.color);
  if (f.top) box(x - 0.05, y - 0.05, w + 0.1, d + 0.1, 0.12, (f.elev ?? 0) + h, f.top);
}

// ---- luces por habitación ---------------------------------------------------
const lights = new Map();
for (const r of house.rooms.filter((r) => r.light)) {
  const [x0, y0, x1, y1] = r.rect;
  const group = new THREE.Group();
  const pl = new THREE.PointLight("#ffc680", 0, 28, 1.5);
  pl.position.set((x0 + x1) / 2, 6.5, (y0 + y1) / 2);
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, y1 - y0),
    new THREE.MeshBasicMaterial({ color: "#ffb45c", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set((x0 + x1) / 2, 0.08, (y0 + y1) / 2);
  group.add(pl, glow);
  scene.add(group);
  lights.set(r.id, { r, pl, glow, on: false });
}

// ---- cámara isométrica (desde el suroeste, como los renders de referencia) --------
const center = new THREE.Vector3(W / 2, 2, D / 2);
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
camera.position.copy(center).add(new THREE.Vector3(-1, 0.95, 1.25).normalize().multiplyScalar(120));
camera.lookAt(center);

function fit(aspect) {
  camera.updateMatrixWorld();
  const inv = camera.matrixWorldInverse;
  const b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
  for (const x of [0, W]) for (const y of [0, WALL_H]) for (const z of [0, D]) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
    b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x);
    b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y);
  }
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  let hw = (b.x1 - b.x0) / 2 * 1.08, hh = (b.y1 - b.y0) / 2 * 1.08;
  if (hw / hh < aspect) hw = hh * aspect; else hh = hw / aspect;
  Object.assign(camera, { left: cx - hw, right: cx + hw, top: cy + hh, bottom: cy - hh });
  camera.updateProjectionMatrix();
}

const controls = new OrbitControls(camera, renderer.domElement);
// el constructor orienta la cámara al origen: la recolocamos con el objetivo correcto
camera.position.copy(center).add(new THREE.Vector3(-1, 0.95, 1.25).normalize().multiplyScalar(120));
controls.target.copy(center);
controls.update();
controls.enableDamping = true;
controls.enabled = !RENDER;

function resize() {
  const w = RENDER ? 1920 : innerWidth, h = RENDER ? 1200 : innerHeight;
  renderer.setSize(w, h);
  fit(w / h);
}
addEventListener("resize", resize);
resize();

// ---- API de luces -----------------------------------------------------------
function setLight(id, on) {
  const l = lights.get(id);
  if (!l) return;
  l.on = !!on;
  l.pl.intensity = l.on ? 45 : 0;
  l.glow.material.opacity = l.on ? 0.14 : 0;
  const btn = document.querySelector(`button[data-room="${id}"]`);
  btn?.classList.toggle("on", l.on);
  window.parent !== window && parent.postMessage({ casa3d: "state", room: id, on: l.on }, "*");
}
const toggleLight = (id) => setLight(id, !lights.get(id)?.on);

const panel = document.getElementById("panel");
for (const { r } of lights.values()) {
  const b = document.createElement("button");
  b.dataset.room = r.id;
  b.textContent = `💡 ${r.name}`;
  b.onclick = () => toggleLight(r.id);
  panel.appendChild(b);
}
(params.get("on") ?? "").split(",").filter(Boolean).forEach((id) => setLight(id, true));
addEventListener("message", (e) => {
  if (e.data?.casa3d === "light") setLight(e.data.room, e.data.on);
});

// ---- capas PNG: diferencia (luz encendida − base), pensado para mix-blend-mode: screen
function snapshot() {
  renderer.render(scene, camera);
  const c = document.createElement("canvas");
  c.width = renderer.domElement.width; c.height = renderer.domElement.height;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(renderer.domElement, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}
// Máscara: volumen de la habitación en blanco, el resto del modelo en negro (con profundidad).
function roomMask(id) {
  const [x0, y0, x1, y1] = lights.get(id).r.rect;
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const saved = [];
  scene.traverse((o) => { if (o.isMesh) { saved.push([o, o.material]); o.material = black; } });
  const vol = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 7, y1 - y0), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  vol.position.set((x0 + x1) / 2, 3.5, (y0 + y1) / 2);
  scene.add(vol);
  const bg = scene.background; scene.background = new THREE.Color(0x000000);
  const hidden = [...lights.values()].map((l) => l.glow);
  hidden.forEach((g) => (g.visible = false));
  const img = snapshot();
  hidden.forEach((g) => (g.visible = true));
  scene.background = bg; scene.remove(vol);
  saved.forEach(([o, m]) => (o.material = m));
  return img;
}
function renderLayer(id) {
  const prev = [...lights.values()].map((l) => [l.r.id, l.on]);
  lights.forEach((l) => setLight(l.r.id, false));
  const base = snapshot();
  setLight(id, true);
  const on = snapshot();
  const mask = roomMask(id);
  prev.forEach(([i, v]) => setLight(i, v));
  const out = new ImageData(on.width, on.height);
  for (let i = 0; i < on.data.length; i += 4) {
    const dr = Math.max(0, on.data[i] - base.data[i]);
    const dg = Math.max(0, on.data[i + 1] - base.data[i + 1]);
    const db = Math.max(0, on.data[i + 2] - base.data[i + 2]);
    const k = mask.data[i] / 255;
    const m = Math.max(dr, dg, db) * k;
    out.data[i] = Math.min(255, dr * 2 * k); out.data[i + 1] = Math.min(255, dg * 2 * k);
    out.data[i + 2] = Math.min(255, db * 2 * k); out.data[i + 3] = Math.min(255, m * 4);
  }
  const c = document.createElement("canvas");
  c.width = on.width; c.height = on.height;
  c.getContext("2d").putImageData(out, 0, 0);
  return c.toDataURL("image/png");
}
function renderBase() {
  scene.background = BG;
  lights.forEach((l) => setLight(l.r.id, false));
  renderer.render(scene, camera);
  return renderer.domElement.toDataURL("image/png");
}

// centro de la habitación en % de la imagen (para top/left de los iconos del dashboard)
function project(id) {
  const { rect: [x0, y0, x1, y1], icon } = lights.get(id).r;
  const [cx, cy] = icon ?? [(x0 + x1) / 2, (y0 + y1) / 2];
  const p = new THREE.Vector3(cx, 2, cy).project(camera);
  return { top: +((1 - p.y) * 50).toFixed(1), left: +((p.x + 1) * 50).toFixed(1) };
}

window.casa3d = { project, rooms: [...lights.keys()], setLight, toggleLight, renderLayer, renderBase, ready: true };

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});
