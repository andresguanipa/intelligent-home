// =============================================================================
//  house3d.js · motor three.js que construye la casa desde house.json
//  Lo usan el visor independiente (app.js) y la tarjeta de Home Assistant
//  (casa3d-card.js). No depende de import maps: las rutas son relativas.
//
//  const h = await createHouse3D(contenedor, { house, interactive, cutaway, ... });
//  h.setLight(id, on, { brightness: 0..1, color: "#rrggbb" })
//  h.setOpening(id, abierta)          // puertas con "id" en house.json
//  h.addMarker({ at | room, icon, emoji, onTap, onHold }) → { el, setState(on) }
//  h.dispose()
// =============================================================================
import * as THREE from "../vendor/three/three.module.js";
import { OrbitControls } from "../vendor/three/addons/controls/OrbitControls.js";

const WALL = "#c4c2bc", WALL_EXT = "#b3b0a8", CAP = "#efede8", DOOR = "#ece8df";
const DOOR_ANGLE = (75 * Math.PI) / 180;
const COMPASS = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

const mat = (color, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0, ...extra });

export async function createHouse3D(container, opts = {}) {
  const house = opts.house ?? (await (await fetch(new URL("./house.json", import.meta.url))).json());
  const H = house.wallHeight;
  const { width: W, depth: D } = house.outline;
  const T = house.thickness;
  const cutaway = opts.cutaway !== false;
  const fixedSize = opts.fixedSize ?? null;

  let dirty = true; // render bajo demanda: request() marca que hay que repintar
  function request() { dirty = true; }

  // ---- renderer / escena ------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(fixedSize ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.cssText = "display:block;width:100%;height:100%;";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const BG = new THREE.Color(opts.background ?? "#0b0d14");
  if (opts.background !== "transparent") scene.background = BG;
  scene.add(new THREE.HemisphereLight("#f4f1ea", "#7d7a73", 1.7));
  const sun = new THREE.DirectionalLight("#ffffff", 1.1);
  sun.position.set(-20, 40, 30);
  scene.add(sun);

  const box = (x, y, w, d, h, elev, color, parent = scene) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
    m.position.set(x + w / 2, elev + h / 2, y + d / 2);
    parent.add(m);
    return m;
  };

  // ---- suelos -----------------------------------------------------------------
  box(-0.4, -0.4, W + 0.8, D + 0.8, 0.3, -0.3, "#d3cec2");
  for (const r of house.rooms) {
    for (const [x0, y0, x1, y1] of r.rects) box(x0, y0, x1 - x0, y1 - y0, 0.04, 0, r.floor);
  }

  // ---- muros con huecos, ventanas y puertas -----------------------------------
  const glassMat = new THREE.MeshStandardMaterial({
    color: "#7ea6c0", roughness: 0.2, transparent: true, opacity: 0.55,
  });
  const walls = new THREE.Group();
  scene.add(walls);
  const doors = new Map(); // id → { pivot, set(open) }

  function wallBox(w, s0, s1, z0, z1, color, thick) {
    if (s1 - s0 < 0.01 || z1 - z0 < 0.01) return;
    const [ax, ay] = w.a, [bx, by] = w.b;
    const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
    const sm = (s0 + s1) / 2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(s1 - s0, z1 - z0, thick), mat(color));
    mesh.position.set(ax + ux * sm, (z0 + z1) / 2, ay + uy * sm);
    mesh.rotation.y = -Math.atan2(uy, ux);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(s1 - s0, 0.08, thick), mat(CAP));
    cap.position.y = (z1 - z0) / 2 + 0.04;
    mesh.add(cap);
    walls.add(mesh);
  }

  function addDoor(w, op, top, thick) {
    const [ax, ay] = w.a, [bx, by] = w.b;
    const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
    const hingeAtA = op.hinge !== "b";
    const s = hingeAtA ? op.at[0] + 0.05 : op.at[1] - 0.05;
    const dir0 = hingeAtA ? [ux, uy] : [-ux, -uy];
    const leafLen = op.at[1] - op.at[0] - 0.1;
    let nx = -uy, ny = ux;
    const want = COMPASS[op.swing ?? "n"];
    if (nx * want[0] + ny * want[1] < 0) { nx = -nx; ny = -ny; }
    const hgt = Math.min(6.6, top);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(leafLen, hgt, 0.12), mat(DOOR));
    leaf.position.set(leafLen / 2, hgt / 2, 0);
    const pivot = new THREE.Group();
    pivot.position.set(ax + ux * s, 0, ay + uy * s);
    pivot.add(leaf);
    scene.add(pivot);
    const set = (open) => {
      const th = open ? (op.angle ? (op.angle * Math.PI) / 180 : DOOR_ANGLE) : 0;
      const dx = Math.cos(th) * dir0[0] + Math.sin(th) * nx;
      const dy = Math.cos(th) * dir0[1] + Math.sin(th) * ny;
      pivot.rotation.y = -Math.atan2(dy, dx);
      request();
    };
    set(true);
    doors.set(op.id, { pivot, set });
  }

  house.walls.forEach((w) => {
    const thick = w.t ?? (w.ext ? T.ext : T.int);
    const near = cutaway && w.near;
    const top = near ? 3 : cutaway && !w.ext ? 4 : H;
    const color = w.ext ? WALL_EXT : WALL;
    const [ax, ay] = w.a, [bx, by] = w.b;
    const len = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / len, uy = (by - ay) / len;
    const ops = [...(w.openings ?? [])].sort((p, q) => p.at[0] - q.at[0]);
    let s = -thick / 2;
    for (const op of ops) {
      wallBox(w, s, op.at[0], 0, top, color, thick);
      const [o0, o1] = op.at;
      if (op.type === "window") {
        const sill = Math.min(op.sill ?? 3, top), head = Math.min(op.head ?? 7, top);
        wallBox(w, o0, o1, 0, sill, color, thick);
        wallBox(w, o0, o1, head, top, color, thick);
        if (head > sill) {
          const g = new THREE.Mesh(new THREE.BoxGeometry(o1 - o0, head - sill, 0.08), glassMat);
          const sm = (o0 + o1) / 2;
          g.position.set(ax + ux * sm, (sill + head) / 2, ay + uy * sm);
          g.rotation.y = -Math.atan2(uy, ux);
          walls.add(g);
        }
      } else {
        wallBox(w, o0, o1, Math.min(op.head ?? 6.8, top), top, color, thick); // dintel
        if (op.type === "door") addDoor(w, op, top, thick);
      }
      s = o1;
    }
    wallBox(w, s, len + thick / 2, 0, top, color, thick);
  });

  // ---- muebles ----------------------------------------------------------------
  for (const f of house.furniture) {
    const [x, y] = f.pos;
    if (f.type === "bed") {
      const [w, d] = f.size;
      box(x, y, w, d, 1.5, 0, "#869db3");
      box(x - 0.1, y - 0.2, w + 0.2, 0.5, 3.6, 0, "#5d4636");
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
  const roomBounds = (r) => {
    const xs = r.rects.flatMap((q) => [q[0], q[2]]), ys = r.rects.flatMap((q) => [q[1], q[3]]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  for (const r of house.rooms.filter((q) => q.light)) {
    const [x0, y0, x1, y1] = roomBounds(r);
    const pl = new THREE.PointLight("#ffc680", 0, 28, 1.5);
    pl.position.set((x0 + x1) / 2, 6.5, (y0 + y1) / 2);
    const glowMat = new THREE.MeshBasicMaterial({
      color: "#ffb45c", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Group();
    for (const [a, b, c, d] of r.rects) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(c - a, d - b), glowMat);
      g.rotation.x = -Math.PI / 2;
      g.position.set((a + c) / 2, 0.08, (b + d) / 2);
      glow.add(g);
    }
    scene.add(pl, glow);
    lights.set(r.id, { r, pl, glowMat, on: false, k: 1, color: new THREE.Color("#ffc680") });
  }

  function setLight(id, on, { brightness = 1, color } = {}) {
    const l = lights.get(id);
    if (!l) return;
    l.on = !!on;
    l.k = Math.min(1, Math.max(0.15, brightness));
    if (color) l.color.set(color);
    l.pl.color.copy(l.color);
    l.glowMat.color.copy(l.color);
    l.pl.intensity = l.on ? 45 * l.k : 0;
    l.glowMat.opacity = l.on ? 0.14 * l.k : 0;
    markers.forEach((m) => m.room === id && m.setState(l.on));
    request();
  }

  // ---- cámara isométrica (suroeste) --------------------------------------------
  const center = new THREE.Vector3(W / 2, 2, D / 2);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const camOffset = (opts.view === "top" ? new THREE.Vector3(0, 1, 0.001) : new THREE.Vector3(-1, 0.95, 1.25))
    .normalize().multiplyScalar(120);

  function fit(aspect) {
    camera.updateMatrixWorld();
    const inv = camera.matrixWorldInverse;
    const b = { x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
    for (const x of [0, W]) for (const y of [0, H]) for (const z of [0, D]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
      b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x);
      b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y);
    }
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    let hw = ((b.x1 - b.x0) / 2) * 1.06, hh = ((b.y1 - b.y0) / 2) * 1.06;
    if (hw / hh < aspect) hw = hh * aspect; else hh = hw / aspect;
    Object.assign(camera, { left: cx - hw, right: cx + hw, top: cy + hh, bottom: cy - hh });
    camera.updateProjectionMatrix();
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  camera.position.copy(center).add(camOffset);   // el constructor reorienta al origen
  controls.target.copy(center);
  controls.enabled = !!opts.interactive && !fixedSize;
  controls.enablePan = false;
  controls.addEventListener("change", () => request());
  controls.update();

  // ---- marcadores HTML sobre el modelo -----------------------------------------
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;";
  const style = document.createElement("style");
  style.textContent = `
    .c3d-marker { position:absolute; transform:translate(-50%,-50%); width:40px; height:40px;
      border-radius:50%; border:1px solid rgba(255,255,255,.14); background:rgba(10,12,18,.55);
      color:#9aa3b8; display:flex; align-items:center; justify-content:center; cursor:pointer;
      pointer-events:auto; font-size:18px; padding:0; backdrop-filter:blur(6px);
      -webkit-tap-highlight-color:transparent; --mdc-icon-size:24px; transition:color .3s,border-color .3s,box-shadow .3s; }
    .c3d-marker.on { color:#ffc45c; border-color:#ffc45c; box-shadow:0 0 14px rgba(255,196,92,.45); }
    .c3d-marker.off { opacity:.8; }`;
  container.append(style, overlay);

  const markers = [];
  function addMarker({ at, room, icon, emoji = "•", onTap, onHold, title }) {
    let pos = at;
    if (!pos && room) {
      const r = house.rooms.find((q) => q.id === room);
      const [x0, y0, x1, y1] = roomBounds(r);
      pos = r.icon ?? [(x0 + x1) / 2, (y0 + y1) / 2];
    }
    const el = document.createElement("button");
    el.className = "c3d-marker";
    if (title) el.title = title;
    if (icon && customElements.get("ha-icon")) {
      const i = document.createElement("ha-icon");
      i.setAttribute("icon", icon);
      el.appendChild(i);
    } else el.textContent = emoji;
    let timer = null, held = false;
    el.addEventListener("pointerdown", () => {
      held = false;
      timer = setTimeout(() => { held = true; onHold?.(); }, 500);
    });
    const clear = () => clearTimeout(timer);
    el.addEventListener("pointerup", clear);
    el.addEventListener("pointerleave", clear);
    el.addEventListener("click", (e) => { e.stopPropagation(); if (!held) onTap?.(); });
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    overlay.appendChild(el);
    const m = {
      el, room, pos: new THREE.Vector3(pos[0], at?.[2] ?? 2.5, pos[1]),
      setState: (on) => { el.classList.toggle("on", !!on); el.classList.toggle("off", !on); },
    };
    markers.push(m);
    request();
    return m;
  }

  function updateMarkers() {
    for (const m of markers) {
      const p = m.pos.clone().project(camera);
      m.el.style.left = `${((p.x + 1) / 2) * 100}%`;
      m.el.style.top = `${((1 - p.y) / 2) * 100}%`;
    }
  }

  // ---- toque sobre una habitación ----------------------------------------------
  const ray = new THREE.Raycaster();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.04);
  let down = null;
  renderer.domElement.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const rc = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(
      new THREE.Vector2(((e.clientX - rc.left) / rc.width) * 2 - 1, -((e.clientY - rc.top) / rc.height) * 2 + 1),
      camera
    );
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(floorPlane, hit)) return;
    const r = house.rooms.find((q) => q.rects.some(([a, b, c, d]) => hit.x >= a && hit.x <= c && hit.z >= b && hit.z <= d));
    if (r) opts.onRoomTap?.(r.id);
  });

  // ---- tamaño y bucle (render bajo demanda) -------------------------------------
  function resize() {
    const w = fixedSize ? fixedSize[0] : container.clientWidth || 1;
    const h = fixedSize ? fixedSize[1] : container.clientHeight || 1;
    renderer.setSize(w, h, false);
    fit(w / h);
    request();
  }
  const ro = new ResizeObserver(resize);
  if (!fixedSize) ro.observe(container);
  resize();

  renderer.setAnimationLoop(() => {
    if (!dirty) return;
    dirty = false;
    renderer.render(scene, camera);
    updateMarkers();
  });

  // ---- capas PNG: (luz encendida − base) recortada a la habitación -----------------
  function snapshot() {
    renderer.render(scene, camera);
    const c = document.createElement("canvas");
    c.width = renderer.domElement.width; c.height = renderer.domElement.height;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(renderer.domElement, 0, 0);
    return ctx.getImageData(0, 0, c.width, c.height);
  }
  function roomMask(id) {
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const saved = [];
    scene.traverse((o) => { if (o.isMesh) { saved.push([o, o.material]); o.material = black; } });
    const vols = lights.get(id).r.rects.map(([a, b, c, d]) => {
      const v = new THREE.Mesh(new THREE.BoxGeometry(c - a, 7, d - b), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      v.position.set((a + c) / 2, 3.5, (b + d) / 2);
      scene.add(v);
      return v;
    });
    const bg = scene.background;
    scene.background = new THREE.Color(0x000000);
    const img = snapshot();
    scene.background = bg;
    vols.forEach((v) => scene.remove(v));
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
    lights.forEach((l) => setLight(l.r.id, false));
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL("image/png");
  }

  function project(id) {
    const r = house.rooms.find((q) => q.id === id);
    const [x0, y0, x1, y1] = roomBounds(r);
    const [cx, cy] = r.icon ?? [(x0 + x1) / 2, (y0 + y1) / 2];
    const p = new THREE.Vector3(cx, 2.5, cy).project(camera);
    return { top: +((1 - p.y) * 50).toFixed(1), left: +((p.x + 1) * 50).toFixed(1) };
  }

  function dispose() {
    renderer.setAnimationLoop(null);
    ro.disconnect();
    controls.dispose();
    scene.traverse((o) => { o.geometry?.dispose?.(); });
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    overlay.remove();
    style.remove();
  }

  return {
    house, rooms: house.rooms, lights, doors, setLight, setOpening: (id, open) => doors.get(id)?.set(open),
    addMarker, project, renderLayer, renderBase, resize, dispose,
    setInteractive: (on) => { controls.enabled = !!on && !fixedSize; },
    get roomIds() { return [...lights.keys()]; },
  };
}
