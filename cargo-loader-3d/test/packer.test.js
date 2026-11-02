import { pack, solve, summarize } from '../js/packer.js';
import { settleY, canPlace, recalcLevels, audit } from '../js/editor.js';
import { parseTypesCSV, encodeShare, decodeShare } from '../js/io.js';
import assert from 'node:assert';

const cont = { L: 590, W: 235, H: 239, maxWeight: 21000 };
const mk = (type, n, o) => Array.from({ length: n }, () => ({ type, name: 'T' + type, color: '#000', weight: 10, rot: 'free', fragile: false, maxStack: 0, group: 1, ...o }));
const eps = 0.01;
const ov = (a, b) => a.x < b.x + b.l - eps && a.x + a.l > b.x + eps && a.y < b.y + b.h - eps && a.y + a.h > b.y + eps && a.z < b.z + b.w - eps && a.z + a.w > b.z + eps;

function validate(placed, lifo) {
  placed.forEach((a, i) => {
    assert(a.x >= 0 && a.y >= 0 && a.z >= 0 && a.x + a.l <= cont.L + eps && a.y + a.h <= cont.H + eps && a.z + a.w <= cont.W + eps, 'di luar container');
    placed.slice(i + 1).forEach(b => assert(!ov(a, b), 'tabrakan'));
  });
  assert.deepStrictEqual(audit(cont, placed, { lifo }), [], 'audit harus bersih');
}

const items = [...mk(0, 12, { l: 120, w: 80, h: 60, weight: 60 }), ...mk(1, 40, { l: 60, w: 40, h: 40, weight: 15, group: 2 }), ...mk(2, 15, { l: 100, w: 50, h: 50, weight: 25, group: 3, fragile: true, rot: 'flat' })];

let r = solve({ cont, items });
validate(r.containers[0].placed, false);
console.log('fast   :', r.containers[0].placed.length, '/', items.length);

r = solve({ cont, items, lifo: true }); validate(r.containers[0].placed, true);
console.log('lifo   :', r.containers[0].placed.length, '/', items.length, '(sisa', r.unplaced.length + ')');

const big = mk(0, 200, { l: 100, w: 80, h: 70, weight: 100 });
const f = solve({ cont, items: big, maxContainers: 5, mode: 'fast' }), b = solve({ cont, items: big, maxContainers: 5, mode: 'best' });
const tot = x => x.containers.reduce((t, c) => t + c.placed.length, 0);
assert(f.containers.length > 1, 'harus pakai > 1 container');
assert(tot(b) >= tot(f), 'best >= fast');
f.containers.forEach(c => validate(c.placed, false));
console.log('multi  : fast', f.containers.length, 'cont /', tot(f), 'box; best', b.containers.length, 'cont /', tot(b), 'box,', b.strategy);

const first = solve({ cont, items });
const locked = { 0: first.containers[0].placed.slice(0, 5).map(x => ({ ...x, locked: true })) };
const rest = items.slice(5);
const k = solve({ cont, items: rest, locked });
locked[0].forEach((l, i) => { const p = k.containers[0].placed[i]; assert(p.x === l.x && p.y === l.y && p.z === l.z && p.locked, 'posisi terkunci berubah'); });
validate(k.containers[0].placed, false);
console.log('kunci  : ok');

r = pack({ ...cont, maxWeight: 100 }, mk(0, 20, { l: 50, w: 50, h: 50, weight: 30 }));
assert.strictEqual(r.placed.length, 3); console.log('berat  : ok');
r = pack(cont, mk(0, 30, { l: 100, w: 100, h: 50, maxStack: 1 })); r.placed.forEach(x => assert.strictEqual(x.y, 0));
console.log('stack  : ok');
const two = pack(cont, mk(0, 2, { l: 100, w: 100, h: 100 })).placed;
assert.strictEqual(settleY(two, two[1], two[0].x, two[
  0].z, 100, 100), two[0].h, 'jatuh ke atas box lain');
assert(!canPlace(cont, two, two[1], { ...two[1], x: two[0].x, y: 0, z: two[0].z }), 'tabrakan harus ditolak');
assert(!canPlace(cont, two, two[1], { ...two[1], x: 999 }), 'di luar container harus ditolak');
two[1].y = 100; two[1].x = two[0].x; two[1].z = two[0].z; recalcLevels(two); assert.strictEqual(two[1].level, 2);
console.log('editor : ok');

{
  let seed = 7; const rnd = (a, b) => { seed = (seed * 16807) % 2147483647; return Math.round(a + (seed / 2147483647) * (b - a)); };
  for (let t = 0; t < 150; t++) {
    const its = [];
    for (let q = 0; q < 4; q++) {
      const o = { l: rnd(30, 130), w: rnd(30, 100), h: rnd(20, 90), type: q, name: 'T' + q, color: '#000', weight: 10, rot: 'free', fragile: q === 2, maxStack: 0, group: rnd(1, 3) };
      for (let i = rnd(3, 25); i > 0; i--) its.push({ ...o });
    }
    for (const lifo of [false, true]) solve({ cont, items: its, lifo, maxContainers: 2 }).containers.forEach(c =>
      assert(!audit(cont, c.placed, { lifo }).some(w => w.includes('rapuh')), 'box rapuh tertindih'));
  }
  const fr = pack(cont, [{ type: 0, name: 'F', color: '#000', l: 100, w: 100, h: 50, weight: 1, rot: 'none', fragile: true, group: 1 }, ...mk(1, 1, { l: 50, w: 50, h: 50, rot: 'none' })]).placed;
  const f0 = fr.find(b => b.fragile), o0 = fr.find(b => !b.fragile);
  assert(!canPlace(cont, fr, o0, { ...o0, x: f0.x, y: f0.h, z: f0.z }), 'drag ke atas rapuh harus ditolak');
  console.log('rapuh  : ok');
}

const csv = 'name;length;width;height;qty;weight;group;rot;fragile;maxStack;color\nKardus;50;40;30;10;12,5;2;flat;ya;3;#ff0000\nbad;0;1;1;1;1;1;free;0;0;';
const t = parseTypesCSV(csv, ['#111111']);
assert.strictEqual(t.length, 1); assert.deepStrictEqual([t[0].l, t[0].weight, t[0].group, t[0].rot, t[0].fragile, t[0].maxStack], [50, 12.5, 2, 'flat', true, 3]);
assert.deepStrictEqual(decodeShare(encodeShare({ a: 'Tes é ✓' })), { a: 'Tes é ✓' });
console.log('io     : ok');
console.log('SEMUA TES LULUS');