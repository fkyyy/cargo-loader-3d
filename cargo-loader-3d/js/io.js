export function download(name, text, mime = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime + ';charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const KEYS = {
  name: ['name', 'nama'], l: ['length', 'panjang', 'p'], w: ['width', 'lebar'], h: ['height', 'tinggi', 't'],
  q: ['qty', 'quantity', 'jumlah', 'q'], weight: ['weight', 'berat'], group: ['group', 'tujuan'],
  rot: ['rot', 'rotasi', 'rotation'], fragile: ['fragile', 'rapuh'], maxStack: ['maxstack', 'maxlevel', 'maksstack'], color: ['color', 'warna'],
};

export function parseTypesCSV(text, pal) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const d = lines[0].includes(';') && !lines[0].includes(',') ? ';' : ',';
  const norm = s => s.toLowerCase().replace(/[^a-z]/g, '');
  const head = lines[0].split(d).map(norm);
  const col = {};
  for (const [k, names] of Object.entries(KEYS)) col[k] = head.findIndex(h => names.includes(h));
  const out = [];
  for (const ln of lines.slice(1)) {
    const c = ln.split(d).map(s => s.trim());
    const g = k => (col[k] >= 0 ? c[col[k]] : undefined);
    const n = (k, def) => { const v = parseFloat((g(k) || '').replace(',', '.')); return isFinite(v) ? v : def; };
    const t = { name: g('name') || 'Box ' + (out.length + 1), l: n('l', 0), w: n('w', 0), h: n('h', 0), q: Math.round(n('q', 1)),
      weight: n('weight', 0), group: Math.max(1, Math.round(n('group', 1))), rot: ['free', 'flat', 'none'].includes((g('rot') || '').toLowerCase()) ? g('rot').toLowerCase() : 'free',
      fragile: /^(1|true|ya|yes|y)$/i.test(g('fragile') || ''), maxStack: Math.max(0, Math.round(n('maxStack', 0))),
      color: /^#[0-9a-f]{6}$/i.test(g('color') || '') ? g('color') : pal[out.length % pal.length] };
    if (t.l > 0 && t.w > 0 && t.h > 0) out.push(t);
  }
  return out;
}

export function placementCSV(plan) {
  const rows = ['container,no,type,x,y,z,length,width,height,weight,group,locked'];
  plan.containers.forEach((c, k) => c.placed.forEach(b =>
    rows.push([k + 1, b.id + 1, '"' + b.name.replace(/"/g, '""') + '"', b.x, b.y, b.z, b.l, b.w, b.h, b.weight, b.group, b.locked ? 1 : 0].join(','))));
  return rows.join('\n');
}

export const encodeShare = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_');
export const decodeShare = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function writeReport(w, data) {
  const tbl = (head, rows) => `<table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
  w.document.open();
  w.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><title>${esc(data.title)}</title><style>
  body{font:13px/1.45 system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 6px}
  table{border-collapse:collapse;width:100%;font-size:11px;margin:6px 0}th,td{border:1px solid #ccc;padding:3px 6px;text-align:left}th{background:#eee}
  img{max-width:100%;border:1px solid #ccc;border-radius:6px}.blk{page-break-inside:avoid}.m{color:#555}@media print{h2{page-break-after:avoid}}
  </style></head><body><h1>${esc(data.title)}</h1><div class="m">${esc(data.contText)} · ${new Date().toLocaleString('id-ID')}</div>
  ${data.blocks.map(b => `<div class="blk"><h2>${esc(b.title)}</h2><div>${b.html}</div>${b.img ? `<img src="${b.img}">` : ''}</div>`).join('')}
  <h2>Daftar jenis box</h2>${tbl(['Nama', 'Ukuran (cm)', 'Qty', 'Termuat', 'Berat (kg)', 'Tujuan'], data.typeRows)}
  <h2>Urutan muat</h2>${tbl(['Cont.', 'No', 'Jenis', 'x', 'y', 'z', 'P', 'L', 'T', 'Kg', 'Tujuan'], data.loadRows)}
  </body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 500);
}