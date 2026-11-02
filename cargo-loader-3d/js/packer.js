const EPS = 0.01;

export function orientations(it) {
  const { l, w, h } = it;
  let o;
  if (it.rot === 'none') o = [[l, w, h]];
  else if (it.rot === 'flat') o = [[l, w, h], [w, l, h]];
  else o = [[l, w, h], [w, l, h], [l, h, w], [h, l, w], [w, h, l], [h, w, l]];
  const seen = new Set();
  return o.filter(a => { const k = a.join('x'); if (seen.has(k)) return false; seen.add(k); return true; });
}

const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;
const inside = (q, b) => q.x >= b.x - EPS && q.x < b.x + b.l - EPS && q.y >= b.y - EPS && q.y < b.y + b.h - EPS && q.z >= b.z - EPS && q.z < b.z + b.w - EPS;
const SORTS = {
  volume: i => i.l * i.w * i.h,
  longest: i => Math.max(i.l, i.w, i.h),
  area: i => i.l * i.w * i.h / Math.min(i.l, i.w, i.h),
};
const cmpAxes = ax => (a, b) => { for (const k of ax) { const d = a[k] - b[k]; if (d) return d; } return 0; };

export function summarize(cont, placed) {
  let volume = 0, weight = 0;
  for (const b of placed) { volume += b.l * b.w * b.h; weight += b.weight || 0; }
  let mw = 0, cx = 0, cy = 0, cz = 0;
  for (const b of placed) {
    const m = weight > 0 ? (b.weight || 0) : b.l * b.w * b.h; mw += m;
    cx += (b.x + b.l / 2) * m; cy += (b.y + b.h / 2) * m; cz += (b.z + b.w / 2) * m;
  }
  return { volume, totalWeight: weight, cog: mw > 0 ? { x: cx / mw, y: cy / mw, z: cz / mw } : null };
}

// ---------- pintu ----------
// back = x max, front = x 0, right = z max (lebar), left = z 0, top = y max (atas)
export const DOOR_PRIORITY = ['right', 'left', 'back', 'front', 'top'];
export const doorsOf = cont => (cont.doors && cont.doors.length ? cont.doors : ['back']);
export const primaryDoor = doors => DOOR_PRIORITY.find(d => doors.includes(d)) || 'back';

// true bila box p menghalangi jalur keluar box c lewat pintu d
export function blockedVia(d, c, p) {
  const ovx = ov(c.x, c.x + c.l, p.x, p.x + p.l);
  const ovy = ov(c.y, c.y + c.h, p.y, p.y + p.h);
  const ovz = ov(c.z, c.z + c.w, p.z, p.z + p.w);
  switch (d) {
    case 'back': return ovy && ovz && p.x >= c.x + c.l - EPS;
    case 'front': return ovy && ovz && p.x + p.l <= c.x + EPS;
    case 'right': return ovx && ovy && p.z >= c.z + c.w - EPS;
    case 'left': return ovx && ovy && p.z + p.w <= c.z + EPS;
    case 'top': return ovx && ovz && p.y >= c.y + c.h - EPS;
    default: return false;
  }
}

// Packer inti selalu mengisi dari x = 0 menuju pintu "back". Untuk pintu utama lain,
// koordinat dicerminkan / ditukar (frame), lalu hasilnya dipetakan balik.
const SWAP = { back: 'right', front: 'left', right: 'back', left: 'front', top: 'top' };
const MIRR = { back: 'front', front: 'back', right: 'right', left: 'left', top: 'top' };
function frameOf(cont, primary) {
  const swap = primary === 'right' || primary === 'left';
  const mirror = primary === 'front' || primary === 'left';
  const Lf = swap ? cont.W : cont.L, Wf = swap ? cont.L : cont.W;
  const fwd = b => { let { x, z, l, w } = b; if (swap) [x, z, l, w] = [z, x, w, l]; if (mirror) x = Lf - x - l; return { ...b, x, z, l, w }; };
  const inv = b => { let { x, z, l, w } = b; if (mirror) x = Lf - x - l; if (swap) [x, z, l, w] = [z, x, w, l]; return { ...b, x, z, l, w }; };
  const door = d => { if (swap) d = SWAP[d]; if (mirror) d = MIRR[d]; return d; };
  return { swap, Lf, Wf, fwd, inv, door };
}

function packCore(cont, items, opts = {}) {
  const { L, W, H, maxWeight } = cont;
  const maxVol = cont.maxVolume || 0;
  const doors = doorsOf(cont);
  const lifo = !!opts.lifo;
  const keyFn = SORTS[opts.sort || 'volume'];
  const cmpPts = cmpAxes(opts.axes || (lifo && doors.includes('back') ? 'xyz' : 'yxz'));
  const placed = [], unplaced = [];
  let pts = [{ x: 0, y: 0, z: 0 }], totalWeight = 0, totalVol = 0;

  for (const f of opts.fixed || []) {
    const b = { ...f, level: f.level || 1 };
    placed.push(b); totalWeight += b.weight || 0; totalVol += b.l * b.w * b.h;
    pts.push({ x: b.x + b.l, y: b.y, z: b.z }, { x: b.x, y: b.y + b.h, z: b.z }, { x: b.x, y: b.y, z: b.z + b.w });
  }
  pts = pts.filter(q => !placed.some(b => inside(q, b)));

  const sorted = [...items].sort((a, b) =>
    (lifo ? (b.group || 1) - (a.group || 1) : 0) ||
    (+!!a.fragile - +!!b.fragile) ||
    (keyFn(b) - keyFn(a)) ||
    ((b.weight || 0) - (a.weight || 0)));

  function check(c, it) {
    let area = 0, level = 1;
    const g = it.group || 1;
    const blocked = doors.map(() => false);
    for (const p of placed) {
      const ovx = ov(c.x, c.x + c.l, p.x, p.x + p.l);
      const ovy = ov(c.y, c.y + c.h, p.y, p.y + p.h);
      const ovz = ov(c.z, c.z + c.w, p.z, p.z + p.w);
      if (ovx && ovy && ovz) return null;
      if (c.y > EPS && Math.abs(p.y + p.h - c.y) < EPS && ovx && ovz) {
        area += (Math.min(p.x + p.l, c.x + c.l) - Math.max(p.x, c.x)) * (Math.min(p.z + p.w, c.z + c.w) - Math.max(p.z, c.z));
        if (p.fragile) return null;
        if (lifo && g > p.group) return null;
        level = Math.max(level, p.level + 1);
      }
      // LIFO: box c terhalang bila di SEMUA pintu ada box (dibongkar belakangan) di jalurnya
      if (lifo && p.group > g) doors.forEach((d, i) => { if (blockedVia(d, c, p)) blocked[i] = true; });
      if (it.fragile && ovx && ovz && Math.abs(p.y - (c.y + c.h)) < EPS) return null;
    }
    if (lifo && blocked.every(Boolean)) return null;
    if (c.y > EPS && area / (c.l * c.w) < 0.7) return null;
    if (it.maxStack > 0 && level > it.maxStack) return null;
    return { level };
  }

  for (const it of sorted) {
    const wt = it.weight || 0, vol = it.l * it.w * it.h;
    if (maxWeight > 0 && totalWeight + wt > maxWeight) { unplaced.push({ ...it, reason: 'melebihi batas berat' }); continue; }
    if (maxVol > 0 && totalVol + vol > maxVol) { unplaced.push({ ...it, reason: 'melebihi batas volume' }); continue; }
    pts.sort(cmpPts);
    const ors = orientations(it);
    let found = null;
    outer:
    for (const p of pts) for (const [l, w, h] of ors) {
      if (p.x + l > L + EPS || p.z + w > W + EPS || p.y + h > H + EPS) continue;
      const c = { x: p.x, y: p.y, z: p.z, l, w, h };
      const r = check(c, it);
      if (r) { found = { ...c, level: r.level }; break outer; }
    }
    if (!found) { unplaced.push({ ...it, reason: 'ruang tidak cukup / aturan tidak terpenuhi' }); continue; }
    const b = { ...found, type: it.type, name: it.name, color: it.color, group: it.group || 1,
                weight: wt, fragile: !!it.fragile, maxStack: it.maxStack || 0, locked: false };
    placed.push(b); totalWeight += wt; totalVol += vol;
    pts = pts.filter(q => !inside(q, b));
    pts.push({ x: b.x + b.l, y: b.y, z: b.z }, { x: b.x, y: b.y + b.h, z: b.z }, { x: b.x, y: b.y, z: b.z + b.w });
  }
  return { placed, unplaced };
}

export function pack(cont, items, opts = {}) {
  const doors = doorsOf(cont), F = frameOf(cont, primaryDoor(doors));
  const fcont = { ...cont, L: F.Lf, W: F.Wf, doors: doors.map(F.door) };
  const fitems = F.swap ? items.map(it => ({ ...it, l: it.w, w: it.l })) : items;
  const r = packCore(fcont, fitems, { ...opts, fixed: (opts.fixed || []).map(F.fwd) });
  const placed = r.placed.map(F.inv);
  placed.forEach((b, i) => { b.id = i; });
  const unplaced = F.swap ? r.unplaced.map(it => ({ ...it, l: it.w, w: it.l })) : r.unplaced;
  return { placed, unplaced, ...summarize(cont, placed) };
}

function runOne(cont, items, locked, lifo, st, maxC) {
  const containers = [];
  const maxLocked = Math.max(-1, ...Object.keys(locked).map(Number));
  let rest = items;
  for (let k = 0; k < maxC; k++) {
    if (!rest.length && k > maxLocked) break;
    const fixed = locked[k] || [];
    const r = pack(cont, rest, { lifo, axes: st.axes, sort: st.sort, fixed });
    containers.push(r);
    const progress = r.placed.length > fixed.length;
    rest = r.unplaced;
    if (k >= maxLocked && (!rest.length || !progress)) break;
  }
  while (containers.length > 1 && containers[containers.length - 1].placed.length === 0) containers.pop();
  return { containers, unplaced: rest };
}

export function solve({ cont, items, lifo = false, mode = 'fast', locked = {}, maxContainers = 1 }) {
  const sorts = mode === 'best' ? ['volume', 'longest', 'area'] : ['volume'];
  const primary = primaryDoor(doorsOf(cont));
  const axes = lifo ? [primary === 'top' ? 'yxz' : 'xyz'] : mode === 'best' ? ['yxz', 'yzx', 'xyz'] : ['yxz'];
  const cv = cont.L * cont.W * cont.H;
  let best = null;
  for (const a of axes) for (const s of sorts) {
    const st = { axes: a, sort: s };
    const r = runOne(cont, items, locked, lifo, st, Math.max(1, maxContainers));
    const vol = r.containers.reduce((t, c) => t + c.volume, 0);
    const score = [r.unplaced.length, r.containers.length, -vol / (cv * r.containers.length)];
    if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && (score[1] < best.score[1] || (score[1] === best.score[1] && score[2] < best.score[2]))))
      best = { ...r, score, strategy: `${a}/${s}` };
  }
  return { containers: best.containers, unplaced: best.unplaced, strategy: best.strategy };
}