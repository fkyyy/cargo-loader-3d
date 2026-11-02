import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const S = 0.01; 
export const GROUP_PAL = ['#4c78a8', '#e45756', '#54a24b', '#f58518', '#b279a2', '#72b7b2', '#eeca3b', '#9d755d'];
const texCache = new Map();
function labelTex(text) {
  if (texCache.has(text)) return texCache.get(text);
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 40px system-ui,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = '#000'; g.strokeText(text, 128, 64); g.fillStyle = '#fff'; g.fillText(text, 128, 64);
  const t = new THREE.CanvasTexture(c); texCache.set(text, t); return t;
}

export class Viewer {
  constructor(el, cb = {}) {
    this.cb = cb; this.el = el;
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.r.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.r.localClippingEnabled = true;
    this.r.domElement.style.touchAction = 'none';
    el.appendChild(this.r.domElement);
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(45, 1, 0.1, 300);
    this.ctl = new OrbitControls(this.cam, this.r.domElement);
    this.ctl.enableDamping = true; this.ctl.autoRotate = true; this.ctl.autoRotateSpeed = 1.2;
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const d1 = new THREE.DirectionalLight(0xffffff, 0.8); d1.position.set(8, 12, 6); this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.3); d2.position.set(-8, 5, -6); this.scene.add(d2);
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 999);
    this.meshes = []; this.walls = []; this.hidden = new Set();
    this.step = 0; this.colorBy = 'type'; this.sel = null; this.edit = false; this.labelsOn = false;
    this.dims = { L: 1, W: 1, H: 1 }; this.ray = new THREE.Raycaster(); this.drag = null; this.down = null;

    new ResizeObserver(() => this.resize()).observe(el);
    const cv = this.r.domElement;
    cv.addEventListener('pointerdown', e => this.onDown(e), { capture: true });
    cv.addEventListener('pointermove', e => this.onMove(e));
    cv.addEventListener('pointerup', e => this.onUp(e));
    const loop = () => { requestAnimationFrame(loop); this.ctl.update(); this.r.render(this.scene, this.cam); };
    loop();
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight || 1;
    this.r.setSize(w, h); this.cam.aspect = w / h; this.cam.updateProjectionMatrix();
  }
  boxColor(b) { return this.colorBy === 'group' ? GROUP_PAL[(b.group - 1) % GROUP_PAL.length] : b.color; }

  setScene(cont, placed, colorBy, cog, labels, keepCam = false) {
    this.colorBy = colorBy; this.dims = cont; this.sel = null; this.labelsOn = !!labels;
    while (this.group.children.length) {
      const o = this.group.children.pop();
      o.traverse(c => { c.geometry?.dispose(); c.material?.dispose(); });
    }
    this.meshes = []; this.walls = []; this.cogMesh = null;
    const { L, W, H } = cont;

    const doors = cont.doors && cont.doors.length ? cont.doors : ['back'];
    const cg = new THREE.BoxGeometry(L * S, H * S, W * S);
    const ce = new THREE.LineSegments(new THREE.EdgesGeometry(cg), new THREE.LineBasicMaterial({ color: 0x8a93a8 }));
    ce.position.set(L * S / 2, H * S / 2, W * S / 2); this.group.add(ce);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(L * S, W * S), new THREE.MeshLambertMaterial({ color: 0x7a8398, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(L * S / 2, 0.001, W * S / 2); this.group.add(floor);

    const SIDES = {
      back:  { size: [W, H], pos: [L, H / 2, W / 2], rot: [0, Math.PI / 2, 0] },
      front: { size: [W, H], pos: [0, H / 2, W / 2], rot: [0, Math.PI / 2, 0] },
      right: { size: [L, H], pos: [L / 2, H / 2, W], rot: [0, 0, 0] },
      left:  { size: [L, H], pos: [L / 2, H / 2, 0], rot: [0, 0, 0] },
      top:   { size: [L, W], pos: [L / 2, H, W / 2], rot: [-Math.PI / 2, 0, 0] },
    };
    for (const [name, sd] of Object.entries(SIDES)) {
      const isDoor = doors.includes(name);
      const geo = new THREE.PlaneGeometry(sd.size[0] * S, sd.size[1] * S);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        color: isDoor ? 0xf58518 : 0x8aa0c0, transparent: true, opacity: isDoor ? 0.2 : 0.07, side: THREE.DoubleSide, depthWrite: false }));
      m.position.set(sd.pos[0] * S, sd.pos[1] * S, sd.pos[2] * S); m.rotation.set(...sd.rot);
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: isDoor ? 0xf58518 : 0x8a93a8 })));
      if (isDoor) {
        const lw = Math.min(sd.size[0], sd.size[1] * 2) * 0.3 * S;
        const lab = new THREE.Mesh(new THREE.PlaneGeometry(lw, lw / 2),
          new THREE.MeshBasicMaterial({ map: labelTex('PINTU'), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        lab.position.z = 0.003; m.add(lab);
      }
      this.group.add(m); this.walls.push(m);
    }

    const doLabels = placed.length <= 300;
    placed.forEach(b => {
      const g = new THREE.BoxGeometry(b.l * S, b.h * S, b.w * S);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: this.boxColor(b), clippingPlanes: [this.clip] }));
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, clippingPlanes: [this.clip] }));
      m.add(edge); m.userData = { box: b, edge };
      if (doLabels) {
        const pw = Math.min(b.l * 0.9, b.w * 1.8) * S;
        const lab = new THREE.Mesh(new THREE.PlaneGeometry(pw, pw / 2),
          new THREE.MeshBasicMaterial({ map: labelTex(b.name), transparent: true, depthWrite: false, clippingPlanes: [this.clip] }));
        lab.rotation.x = -Math.PI / 2; lab.position.y = b.h * S / 2 + 0.003; lab.visible = this.labelsOn;
        m.add(lab); m.userData.label = lab;
      }
      this.group.add(m); this.meshes.push(m);
    });
    this.syncAll();
    this.setCog(cog);
    this.step = placed.length; this.updateVisibility();
    if (!keepCam) this.resetView();
  }

  syncAll() {
    this.meshes.forEach(m => {
      const b = m.userData.box;
      m.position.set((b.x + b.l / 2) * S, (b.y + b.h / 2) * S, (b.z + b.w / 2) * S);
      m.material.emissive.set(m === this.sel ? 0x555555 : 0x000000);
      m.userData.edge.material.color.set(b.locked ? 0xf58518 : 0x000000);
      m.userData.edge.material.opacity = b.locked ? 1 : 0.5;
    });
  }
  setCog(cog) {
    if (this.cogMesh) { this.group.remove(this.cogMesh); this.cogMesh.geometry.dispose(); this.cogMesh.material.dispose(); this.cogMesh = null; }
    if (!cog) return;
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff2d2d, depthTest: false }));
    s.position.set(cog.x * S, cog.y * S, cog.z * S); s.renderOrder = 10; this.group.add(s); this.cogMesh = s;
  }
  updateVisibility() { this.meshes.forEach(m => { const b = m.userData.box; m.visible = b.id < this.step && !this.hidden.has(b.type); }); }
  setStep(n) { this.step = n; this.updateVisibility(); }
  setTypeVisible(t, v) { v ? this.hidden.delete(t) : this.hidden.add(t); this.updateVisibility(); }
  setWalls(v) { this.walls.forEach(w => { w.visible = v; }); }
  setClip(f) { this.clip.constant = f >= 1 ? 999 : f * this.dims.H * S; }
  setAutoRotate(v) { this.ctl.autoRotate = v; }
  setEdit(v) { this.edit = v; }
  setLabels(v) { this.labelsOn = v; this.meshes.forEach(m => { if (m.userData.label) m.userData.label.visible = v; }); }
  setColorBy(mode) { this.colorBy = mode; this.meshes.forEach(m => m.material.color.set(this.boxColor(m.userData.box))); }
  resetView() {
    const { L, W, H } = this.dims, d = Math.max(L, W, H) * S * 2.2;
    this.cam.position.set(L * S / 2 + d * 0.6, H * S + d * 0.45, W * S / 2 + d * 0.8);
    this.ctl.target.set(L * S / 2, H * S / 2, W * S / 2); this.ctl.update();
  }
  snapshot() { this.r.render(this.scene, this.cam); return this.r.domElement.toDataURL('image/png'); }

  setRay(e) {
    const r = this.r.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.cam);
  }
  hit(e) { this.setRay(e); return this.ray.intersectObjects(this.meshes.filter(m => m.visible), false)[0]; }
  select(m) {
    if (this.sel) this.sel.material.emissive.set(0x000000);
    this.sel = m; if (m) m.material.emissive.set(0x555555);
    this.cb.onSelect?.(m ? m.userData.box : null);
  }
  selectBox(b) { this.select(this.meshes.find(m => m.userData.box === b) || null); }

  onDown(e) {
    const h = this.hit(e);
    if (!h) { this.down = [e.clientX, e.clientY]; return; }
    this.select(h.object);
    const b = h.object.userData.box;
    if (this.edit && !b.locked) {
      this.ctl.enabled = false;
      const m = h.object, plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -m.position.y), p = new THREE.Vector3();
      this.ray.ray.intersectPlane(plane, p);
      this.drag = { m, plane, off: new THREE.Vector3(p.x - m.position.x, 0, p.z - m.position.z), last: null };
      this.r.domElement.setPointerCapture(e.pointerId);
    }
  }
  onMove(e) {
    const d = this.drag; if (!d) return;
    this.setRay(e);
    const p = new THREE.Vector3(); if (!this.ray.ray.intersectPlane(d.plane, p)) return;
    const b = d.m.userData.box;
    let x = Math.round((p.x - d.off.x) / S - b.l / 2), z = Math.round((p.z - d.off.z) / S - b.w / 2);
    x = Math.min(Math.max(x, 0), Math.max(0, this.dims.L - b.l)); z = Math.min(Math.max(z, 0), Math.max(0, this.dims.W - b.w));
    const r = this.cb.onDrag?.(b, x, z) || { y: b.y, ok: true };
    d.last = { x, y: r.y, z, ok: r.ok };
    d.m.position.set((x + b.l / 2) * S, (r.y + b.h / 2) * S, (z + b.w / 2) * S);
    d.m.material.emissive.set(r.ok ? 0x555555 : 0xaa0000);
  }
  onUp(e) {
    if (this.drag) {
      const d = this.drag; this.drag = null; this.ctl.enabled = true;
      if (d.last) this.cb.onDrop?.(d.m.userData.box, d.last, d.last.ok);
      this.syncAll(); return;
    }
    if (this.down && Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) < 5) this.select(null);
    this.down = null;
  }
}