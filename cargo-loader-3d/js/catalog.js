(function () {
  const CAT = [
    ['Kardus 1', 70, 35, 55], ['Kardus 2', 48, 48, 30], ['Kardus 3', 48, 48, 15],
    ['Kardus 4', 29, 23, 23], ['Kardus 5', 29, 23, 12], ['Kardus 6', 17, 15, 15],
    ['Kardus 7', 15, 15, 10],
    ['Palet 1', 140, 110, 15], ['Palet 2', 115, 110, 15],
    ['Peti 1', 85, 50, 55], ['Peti 2', 85, 70, 55], ['Peti 3', 110, 80, 65],
    ['Peti 4', 110, 110, 70], ['Peti 5', 120, 110, 70], ['Peti 6', 145, 120, 70],
    ['Peti 7', 150, 110, 90], ['Peti 8', 150, 110, 110], ['Peti 9', 195, 150, 130]
  ];

  const $ = id => document.getElementById(id);
  const sel = $('catSel'), qty = $('catQty'), dim = $('catDim'), btn = $('catAdd');
  if (!sel || !btn) return;

  const groups = {};
  CAT.forEach((c, i) => {
    const g = c[0].split(' ')[0];
    if (!groups[g]) {
      groups[g] = document.createElement('optgroup');
      groups[g].label = g;
      sel.appendChild(groups[g]);
    }
    const o = document.createElement('option');
    o.value = i;
    o.textContent = `${c[0]}  (${c[1]} × ${c[2]} × ${c[3]} cm)`;
    groups[g].appendChild(o);
  });

  const unit = () => ($('ulen') || {}).value || 'cm';
  function conv(cm) {
    const u = unit();
    if (u === 'm') return Math.round(cm) / 100;
    if (u === 'in') return Math.round(cm / 2.54 * 100) / 100;
    return cm;
  }

  function preview() {
    const c = CAT[sel.value];
    dim.textContent = `P ${conv(c[1])} × L ${conv(c[2])} × T ${conv(c[3])} ${unit()}`;
  }
  sel.addEventListener('change', preview);
  if ($('ulen')) $('ulen').addEventListener('change', preview);
  preview();

  function hintOf(el) {
    let s = [el.placeholder, el.title, el.name, el.id, el.className,
      el.getAttribute('aria-label'), ...Object.values(el.dataset)].join(' ').toLowerCase();
    const lb = el.closest('label') || el.previousElementSibling;
    if (lb && lb !== el) s += ' ' + (lb.textContent || '').toLowerCase();
    return s;
  }
  function analyze(row) {
    const inputs = Array.from(row.querySelectorAll('input'));
    const map = {};
    const nameIdx = inputs.findIndex(e => e.type === 'text');
    if (nameIdx >= 0) map.name = nameIdx;
    const used = new Set(nameIdx >= 0 ? [nameIdx] : []);
    inputs.forEach((e, i) => {
      if (e.type !== 'number') return;
      const h = hintOf(e);
      let r = null;
      if (/panjang|length|\bp\b/.test(h)) r = 'L';
      else if (/lebar|width|\bw\b|\bl\b/.test(h)) r = 'W';
      else if (/tinggi|height|\bh\b|\bt\b/.test(h)) r = 'H';
      else if (/qty|jumlah|jml|count|\bn\b/.test(h)) r = 'Q';
      if (r && map[r] === undefined) { map[r] = i; used.add(i); }
    });
    const rest = inputs.map((e, i) => i).filter(i => inputs[i].type === 'number' && !used.has(i));
    ['L', 'W', 'H'].forEach(k => { if (map[k] === undefined && rest.length) map[k] = rest.shift(); });
    return map;
  }
  function setVal(el, v) {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  btn.addEventListener('click', () => {
    const item = CAT[sel.value];
    const n = Math.max(1, parseInt(qty.value, 10) || 1);
    const add = $('add'), list = $('types');
    if (!add || !list) return;

    const before = list.children.length;
    add.click();

    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (list.children.length <= before && tries < 25) return;
      clearInterval(timer);
      if (list.children.length <= before) {
        dim.textContent = 'Gagal menambah jenis box (mungkin sudah mencapai batas).';
        return;
      }
      const idx = list.children.length - 1;
      const map = analyze(list.children[idx]);
      const values = { name: item[0], L: conv(item[1]), W: conv(item[2]), H: conv(item[3]), Q: n };
      ['name', 'L', 'W', 'H', 'Q'].forEach(k => {
        if (map[k] === undefined) return;
        const row = list.children[idx];
        const el = row && row.querySelectorAll('input')[map[k]];
        if (el) setVal(el, values[k]);
      });
      const ok = map.L !== undefined && map.W !== undefined && map.H !== undefined;
      const row = list.children[idx];
      if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      dim.textContent = ok
        ? `✓ ${item[0]} ditambahkan. Cek jumlahnya, lalu klik Susun.`
        : 'Baris baru dibuat, tapi kolom ukuran tidak terdeteksi. Isi manual.';
    }, 20);
  });
})();