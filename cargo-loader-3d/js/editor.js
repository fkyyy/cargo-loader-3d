import { blockedVia, doorsOf } from './packer.js';

  const EPS = 0.01;
  const ovr = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > EPS;

  export const overlap = (a, b) =>
    ovr(a.x, a.x + a.l, b.x, b.x + b.l) && ovr(a.y, a.y + a.h, b.y, b.y + b.h) && ovr(a.z, a.z + a.w, b.z, b.z + b.w);

  export function settleY(placed, self, x, z, l, w) {
    let y = 0;
    for (const p of placed) {
      if (p === self) continue;
      if (ovr(x, x + l, p.x, p.x + p.l) && ovr(z, z + w, p.z, p.z + p.w)) y = Math.max(y, p.y + p.h);
    }
    return y;
  }

  export function canPlace(cont, placed, self, c) {
    if (c.x < -EPS || c.y < -EPS || c.z < -EPS || c.x + c.l > cont.L + EPS || c.y + c.h > cont.H + EPS || c.z + c.w > cont.W + EPS) return false;
    for (const p of placed) {
      if (p === self) continue;
      if (overlap(c, p)) return false;
      const xz = ovr(c.x, c.x + c.l, p.x, p.x + p.l) && ovr(c.z, c.z + c.w, p.z, p.z + p.w);
      if (xz && p.fragile && Math.abs(c.y - (p.y + p.h)) < EPS) return false;                   
      if (xz && (self.fragile || c.fragile) && Math.abs(p.y - (c.y + c.h)) < EPS) return false;  
    }
    return true;
  }

  export function recalcLevels(placed) {
    const s = [...placed].sort((a, b) => a.y - b.y);
    s.forEach((b, i) => {
      let lv = 1;
      for (let j = 0; j < i; j++) {
        const p = s[j];
        if (Math.abs(p.y + p.h - b.y) < EPS && ovr(b.x, b.x + b.l, p.x, p.x + p.l) && ovr(b.z, b.z + b.w, p.z, p.z + p.w)) lv = Math.max(lv, p.level + 1);
      }
      b.level = b.y < EPS ? 1 : lv;
    });
  }

  export function audit(cont, placed, { lifo = false } = {}) {
    let float = 0, crush = 0, stack = 0, block = 0, weight = 0;
    const doors = doorsOf(cont);
    for (const b of placed) {
      weight += b.weight || 0;
      let area = 0;
      const blocked = doors.map(() => false);
      for (const p of placed) {
        if (p === b) continue;
        const xz = ovr(b.x, b.x + b.l, p.x, p.x + p.l) && ovr(b.z, b.z + b.w, p.z, p.z + p.w);
        if (xz && Math.abs(p.y + p.h - b.y) < EPS)
          area += (Math.min(p.x + p.l, b.x + b.l) - Math.max(p.x, b.x)) * (Math.min(p.z + p.w, b.z + b.w) - Math.max(p.z, b.z));
        if (xz && b.fragile && Math.abs(b.y + b.h - p.y) < EPS) crush++;
              if (lifo && p.group > b.group) doors.forEach((d, i) => { if (blockedVia(d, b, p)) blocked[i] = true; });
      }
          if (lifo && blocked.every(Boolean)) block++;
      if (b.y > EPS && area / (b.l * b.w) < 0.7) float++;
      if (b.maxStack > 0 && b.level > b.maxStack) stack++;
    }
    const w = [];
    if (float) w.push(`${float} box kurang penyangga (< 70%)`);
    if (crush) w.push(`${crush} box rapuh tertindih`);
    if (stack) w.push(`${stack} box melebihi level tumpukan`);
    if (block) w.push(`${block} pelanggaran urutan bongkar (LIFO)`);
    if (cont.maxWeight > 0 && weight > cont.maxWeight) w.push('melebihi batas berat container');
    return w;
  }