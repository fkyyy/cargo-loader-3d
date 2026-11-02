import { solve, summarize } from "./packer.js";
import { audit, canPlace, settleY, recalcLevels } from "./editor.js";
import { Viewer, GROUP_PAL } from "./viewer.js";
import { FLEET } from "./fleet.js";
import * as io from "./io.js";

const $ = (id) => document.getElementById(id);
const PAL = [
  "#e45756",
  "#4c78a8",
  "#54a24b",
  "#f58518",
  "#b279a2",
  "#72b7b2",
  "#eeca3b",
  "#9d755d",
];
const LF = { cm: 1, m: 100, in: 2.54 },
  WF = { kg: 1, lb: 0.45359237 };
const r2 = (v) => Math.round(v * 100) / 100;

const st = {
  cont: {
    L: 590,
    W: 235,
    H: 239,
    maxWeight: 21000,
    maxVolume: 0,
    doors: ["back"],
  },
  opts: {
    lifo: false,
    mode: "fast",
    colorBy: "type",
    labels: false,
    len: "cm",
    wt: "kg",
    maxc: 3,
  },
  types: [
    {
      name: "Box A",
      l: 120,
      w: 80,
      h: 60,
      q: 12,
      weight: 60,
      group: 1,
      rot: "free",
      fragile: false,
      maxStack: 0,
      color: PAL[0],
    },
    {
      name: "Box B",
      l: 60,
      w: 40,
      h: 40,
      q: 40,
      weight: 15,
      group: 2,
      rot: "free",
      fragile: false,
      maxStack: 0,
      color: PAL[1],
    },
    {
      name: "Box C",
      l: 100,
      w: 50,
      h: 50,
      q: 15,
      weight: 25,
      group: 3,
      rot: "flat",
      fragile: true,
      maxStack: 0,
      color: PAL[2],
    },
  ],
};
let plan = { containers: [{ placed: [] }], unplaced: [] },
  ci = 0,
  sel = null,
  worker = null,
  playTimer = null,
  busy = false;
const cur = () => plan.containers[ci] || { placed: [] };
const toL = (v) => v / LF[st.opts.len],
  fromL = (v) => v * LF[st.opts.len];
const toW = (v) => v / WF[st.opts.wt],
  fromW = (v) => v * WF[st.opts.wt];
const dl = (v) => `${r2(toL(v))}`,
  dw = (v) => `${r2(toW(v))} ${st.opts.wt}`;

function flash(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.style.display = "block";
  clearTimeout(flash.t);
  flash.t = setTimeout(() => {
    t.style.display = "none";
  }, 2200);
}

const viewer = new Viewer($("view"), {
  onSelect: showSel,
  onDrag: (b, x, z) => {
    const c = cur().placed,
      y = settleY(c, b, x, z, b.l, b.w);
    return { y, ok: canPlace(st.cont, c, b, { ...b, x, y, z }) };
  },
  onDrop: (b, pos, ok) => {
    if (!ok) {
      flash("Posisi tidak valid (tabrakan / di luar container / aturan rapuh)");
      return;
    }
    Object.assign(b, { x: pos.x, y: pos.y, z: pos.z });
    recalcLevels(cur().placed);
    renderStats();
    showSel(b);
  },
});

function showSel(b) {
  sel = b;
  $("selbtns").style.display = b ? "flex" : "none";
  $("bLock").textContent = b && b.locked ? "Buka kunci" : "Kunci";
  $("info").innerHTML = b
    ? `<b>${b.name}</b> · urutan muat #${b.id + 1}${b.locked ? " 🔒" : ""}<br>Ukuran: ${dl(b.l)}×${dl(b.w)}×${dl(b.h)} ${st.opts.len}<br>` +
      `Posisi: x ${dl(b.x)}, y ${dl(b.y)}, z ${dl(b.z)}<br>Berat: ${dw(b.weight)} · Tujuan #${b.group} · Level ${b.level}${b.fragile ? " · rapuh" : ""}`
    : "Klik sebuah box di 3D untuk melihat detailnya.";
}

const num = (k, lab, v) =>
  `<div><label class="s">${lab}</label><input type="number" data-k="${k}" value="${v}" min="0" step="any"></div>`;
const ROT = [
  ["free", "Bebas (6 arah)"],
  ["flat", "Hanya horizontal"],
  ["none", "Tanpa rotasi"],
];
const advText = t => [`${r2(toW(t.weight))} ${st.opts.wt}`, `tujuan #${t.group}`,
  t.rot === 'flat' ? 'rotasi horizontal' : t.rot === 'none' ? 'tanpa rotasi' : null,
  t.fragile ? 'rapuh' : null, t.maxStack > 0 ? `maks level ${t.maxStack}` : null].filter(Boolean).join(' · ');
const boxTotals = () => `${st.types.length} jenis · ${st.types.reduce((a, t) => a + (t.q || 0), 0)} box`;
function renderTypes() {
  $('types').innerHTML = `<div class="hint" id="boxTotals">${boxTotals()}</div>` + st.types.map((t, i) => `
  <div class="card" data-i="${i}">
    <!-- Baris Utama: Warna, Nama, Qty, Hapus -->
    <div class="r">
      <input type="color" class="sw" data-k="color" value="${t.color}" title="Warna Box">
      <input type="text" data-k="name" value="${t.name}" placeholder="Nama Box" style="flex:1">
      <input type="number" data-k="q" value="${t.q}" min="0" placeholder="Qty" title="Jumlah" style="width:56px">
      <button class="x" data-del="${i}" title="Hapus">✕</button>
    </div>

    <div class="g3">
      ${num('l', `P (${st.opts.len})`, r2(toL(t.l)))}
      ${num('w', `L (${st.opts.len})`, r2(toL(t.w)))}
      ${num('h', `T (${st.opts.len})`, r2(toL(t.h)))}
    </div>

    <details class="adv">
      <summary>Pengaturan Lanjutan <span style="float:right; opacity:0.7">${advText(t)}</span></summary>
      <div class="g4" style="margin-top:6px">
        ${num('weight', `Berat (${st.opts.wt})`, r2(toW(t.weight)))}
        ${num('group', 'Tujuan #', t.group)}
      </div>
      <div class="r" style="margin-bottom:6px">
        <label class="s" style="flex:1; font-size:11px">Rotasi</label>
        <select data-k="rot" style="flex:1">${ROT.map(([v, n]) => `<option value="${v}"${t.rot === v ? ' selected' : ''}>${n}</option>`).join('')}</select>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:11px; margin-top:4px">
        <label class="ck"><input type="checkbox" data-k="fragile" ${t.fragile ? 'checked' : ''}> Rapuh</label>
        <div style="display:flex; align-items:center; gap:4px">
          <span class="s">Maks Tumpuk:</span>
          <input type="number" data-k="maxStack" value="${t.maxStack}" min="0" style="width:48px">
        </div>
      </div>
    </details>
  </div>`).join('');
}
$("types").addEventListener("input", (e) => {
  const c = e.target.closest(".card"),
    k = e.target.dataset.k;
  if (!c || !k) return;
  const t = st.types[+c.dataset.i],
    v = parseFloat(e.target.value);
  if (e.target.type === "checkbox") t[k] = e.target.checked;
  else if (["name", "color", "rot"].includes(k)) t[k] = e.target.value;
  else if (["l", "w", "h"].includes(k)) t[k] = Math.max(0, fromL(v || 0));
  else if (k === "weight") t[k] = Math.max(0, fromW(v || 0));
    else t[k] = Math.max(0, Math.round(v || 0));
  const sum = c.querySelector('.advsum'); if (sum) sum.textContent = advText(t);
  const tot = $('boxTotals'); if (tot) tot.textContent = boxTotals();
});
$("types").addEventListener("click", (e) => {
  if (e.target.dataset.del !== undefined) {
    st.types.splice(+e.target.dataset.del, 1);
    renderTypes();
    doPack(false);
  }
});
$("add").onclick = () => {
  st.types.push({
    name: "Box " + (st.types.length + 1),
    l: 50,
    w: 50,
    h: 50,
    q: 10,
    weight: 10,
    group: 1,
    rot: "free",
    fragile: false,
    maxStack: 0,
    color: PAL[st.types.length % PAL.length],
  });
  renderTypes();
};

function syncOpts() {
  const c = st.cont,
    o = st.opts;
  $("cl").value = r2(toL(c.L));
  $("cw").value = r2(toL(c.W));
  $("ch").value = r2(toL(c.H));
  $("cmax").value = r2(toW(c.maxWeight));
  $("ulen").value = o.len;
  $("uwt").value = o.wt;
  $("lifo").checked = o.lifo;
  $("mode").value = o.mode;
  $("colorBy").value = o.colorBy;
  $("labels").checked = o.labels;
  $("maxc").value = o.maxc;
  document.querySelectorAll(".ul").forEach((e) => {
    e.textContent = o.len;
  });
  document.querySelectorAll(".uw").forEach((e) => {
    e.textContent = o.wt;
  });
  $("cvol").value = r2((c.maxVolume || 0) / 1e6);
  document.querySelectorAll("[data-door]").forEach((cb) => {
    cb.checked = (c.doors || ["back"]).includes(cb.dataset.door);
  });
}
for (const [id, k, f] of [
  ["cl", "L", fromL],
  ["cw", "W", fromL],
  ["ch", "H", fromL],
  ["cmax", "maxWeight", fromW],
])
  $(id).oninput = (e) => {
    st.cont[k] = Math.max(0, f(parseFloat(e.target.value) || 0));
  };
$("preset").innerHTML =
  '<option value="">Pilih armada…</option>' +
  FLEET.map((f, i) => `<option value="${i}">${f.name}</option>`).join("");
$("preset").onchange = (e) => {
  if (e.target.value === "") return;
  const f = FLEET[+e.target.value];
    if (!(f.L > 0 && f.W > 0 && f.H > 0)) { flash('Data armada tidak lengkap (L/W/H)'); return; }
  Object.assign(st.cont, {
    L: f.L,
    W: f.W,
    H: f.H,
    maxWeight: f.maxWeight,
    maxVolume: f.maxVolume,
    doors: [...f.doors],
  });
  syncOpts();
  doPack(false);
};
$("cvol").oninput = (e) => {
  st.cont.maxVolume = Math.max(0, (parseFloat(e.target.value) || 0) * 1e6);
};
document.querySelectorAll("[data-door]").forEach((cb) => {
  cb.onchange = () => {
    st.cont.doors = [...document.querySelectorAll("[data-door]")]
      .filter((x) => x.checked)
      .map((x) => x.dataset.door);
    render(true);
    flash('Pintu diubah. Klik "Susun" agar urutan muat mengikuti pintu baru.');
  };
});
$("ulen").onchange = (e) => {
  st.opts.len = e.target.value;
  syncOpts();
  renderTypes();
  renderStats();
  showSel(sel);
};
$("uwt").onchange = (e) => {
  st.opts.wt = e.target.value;
  syncOpts();
  renderTypes();
  renderStats();
  showSel(sel);
};
$("lifo").onchange = (e) => {
  st.opts.lifo = e.target.checked;
};
$("mode").onchange = (e) => {
  st.opts.mode = e.target.value;
};
$("maxc").oninput = (e) => {
  st.opts.maxc = Math.max(1, Math.min(20, +e.target.value || 1));
};
$("colorBy").onchange = (e) => {
  st.opts.colorBy = e.target.value;
  viewer.setColorBy(st.opts.colorBy);
  renderLegend();
};

function runSolve(p) {
  return new Promise((resolve, reject) => {
    const local = () => {
      try {
        resolve(solve(p));
      } catch (e) {
        reject(e);
      }
    };
    let w;
    try {
      w = worker ??= new Worker(new URL("./worker.js", import.meta.url), {
        type: "module",
      });
    } catch {
      return local();
    }
    w.onmessage = (e) => resolve(e.data);
    w.onerror = (ev) => {
      worker = null;
      ev.preventDefault?.();
      local();
    };
    w.onmessageerror = () => {
      worker = null;
      local();
    };
    w.postMessage(p);
  });
}

async function doPack(keep) {
  if (busy) return;
  busy = true;
  stopPlay();
  $("stats").textContent = "Menghitung…";
  $("pack").disabled = $("repack").disabled = true;
  try {
    const locked = {},
      lc = {};
    if (keep)
      plan.containers.forEach((c, k) => {
        const l = c.placed.filter((b) => b.locked);
        if (l.length) {
          locked[k] = l.map((b) => ({ ...b }));
          l.forEach((b) => {
            lc[b.type] = (lc[b.type] || 0) + 1;
          });
        }
      });
    const items = [];
    st.types.forEach((t, i) => {
      if (!(t.l > 0 && t.w > 0 && t.h > 0)) return;
      for (let k = 0, n = Math.max(0, t.q - (lc[i] || 0)); k < n; k++)
        items.push({ ...t, type: i });
    });
    if (!(st.cont.L > 0 && st.cont.W > 0 && st.cont.H > 0)) {
      $("stats").innerHTML =
        '<span class="warn">Ukuran container tidak valid.</span>';
      return;
    }
    const r = await runSolve({
      cont: st.cont,
      items,
      lifo: st.opts.lifo,
      mode: st.opts.mode,
      locked,
      maxContainers: st.opts.maxc,
    });
    plan = {
      containers: r.containers.map((c) => ({ placed: c.placed })),
      unplaced: r.unplaced,
      strategy: r.strategy,
    };
    ci = 0;
    render();
    if (r.downgraded)
      flash("Box > 400: mode Optimal diganti Cepat agar tidak lambat");
  } catch (err) {
    console.error(err);
    $("stats").innerHTML =
      `<span class="warn">Gagal menghitung: ${err && err.message ? err.message : err}</span>`;
  } finally {
    busy = false;
    $("pack").disabled = $("repack").disabled = false;
  }
}
$("pack").onclick = () => doPack(false);
$("repack").onclick = () => doPack(true);

function render(keepCam = false, reselect = null) {
  $("ctab").innerHTML = plan.containers
    .map(
      (_, i) =>
        `<option value="${i}"${i === ci ? " selected" : ""}>Container ${i + 1}/${plan.containers.length}</option>`,
    )
    .join("");
  const c = cur();
  viewer.setScene(
    st.cont,
    c.placed,
    st.opts.colorBy,
    summarize(st.cont, c.placed).cog,
    $("labels").checked,
    keepCam,
  );
  viewer.setClip(+$("clip").value / 100);
  viewer.setWalls($("walls").checked);
  viewer.setEdit($("edit").checked);
  renderStats();
  renderLegend();
  const n = c.placed.length;
  $("step").max = n;
  $("step").value = n;
  $("stepLabel").textContent = `${n} / ${n}`;
  if (reselect) viewer.selectBox(reselect);
  else showSel(null);
}
$("ctab").onchange = (e) => {
  ci = +e.target.value;
  render();
};

function renderStats() {
  const c = cur(),
    s = summarize(st.cont, c.placed),
    { L, W, H, maxWeight } = st.cont,
    cv = L * W * H,
    pct = (s.volume / cv) * 100;
  const total = st.types.reduce(
    (t, x) => t + (x.l > 0 && x.w > 0 && x.h > 0 ? x.q : 0),
    0,
  );
  const placedAll = plan.containers.reduce((t, x) => t + x.placed.length, 0);
  let cog = "";
  if (s.cog) {
    const ox = (s.cog.x / L - 0.5) * 100,
      oz = (s.cog.z / W - 0.5) * 100,
      bad = Math.abs(ox) > 10 || Math.abs(oz) > 10;
    cog =
      `<div>Pusat gravitasi: ${ox >= 0 ? "+" : ""}${r2(ox)}% panjang (+ = ke sisi belakang), ${oz >= 0 ? "+" : ""}${r2(oz)}% lebar ` +
      `<span class="${bad ? "warn" : "ok"}">${bad ? "⚠ tidak seimbang" : "✓ seimbang"}</span> <span style="color:#ff2d2d">●</span></div>`;
  }
  const wr = audit(st.cont, c.placed, { lifo: st.opts.lifo });
  $("stats").innerHTML =
    `<b>${placedAll}</b> dari ${total} box termuat di ${plan.containers.length} container` +
    `${plan.strategy ? ` <span class="hint">(strategi ${plan.strategy})</span>` : ""}
    <div class="bar"><i style="width:${Math.min(pct, 100).toFixed(1)}%"></i></div>
        Container ${ci + 1}: volume <b>${r2(pct)}%</b> (${r2(s.volume / 1e6)} / ${r2(cv / 1e6)} m³)${st.cont.maxVolume > 0 ? ` · batas ${r2(st.cont.maxVolume / 1e6)} m³ <span class="${s.volume > st.cont.maxVolume ? "warn" : "ok"}">${s.volume > st.cont.maxVolume ? "⚠ melebihi" : "✓"}</span>` : ""}<br>
    Berat: <b class="${maxWeight > 0 && s.totalWeight > maxWeight ? "warn" : ""}">${dw(s.totalWeight)}</b>${maxWeight ? " / " + dw(maxWeight) : ""}${cog}` +
    (wr.length ? `<div class="warnbox">⚠ ${wr.join("<br>⚠ ")}</div>` : "");
  viewer.setCog(s.cog);
}

function renderLegend() {
  const counts = {};
  plan.containers.forEach((c) =>
    c.placed.forEach((b) => {
      counts[b.type] = (counts[b.type] || 0) + 1;
    }),
  );
  $("legend").innerHTML =
    "<h2>Legenda &amp; filter</h2>" +
    st.types
      .map((t, i) => {
        const un = plan.unplaced.filter((u) => u.type === i);
        return `<div class="lg"><input type="checkbox" data-vis="${i}" ${viewer.hidden.has(i) ? "" : "checked"}><i style="background:${t.color}"></i>
      ${t.name}: ${counts[i] || 0}/${t.q} · tujuan #${t.group}${un.length ? ` <span class="warn">(${un.length} belum termuat: ${un[0].reason})</span>` : ""}</div>`;
      })
      .join("") +
    (st.opts.colorBy === "group"
      ? '<div class="hint">Warna tujuan: ' +
        [...new Set(cur().placed.map((p) => p.group))]
          .sort((a, b) => a - b)
          .map(
            (g) =>
              `<span style="color:${GROUP_PAL[(g - 1) % 8]}">■</span> #${g}`,
          )
          .join(" ") +
        "</div>"
      : "");
}
$("legend").addEventListener("change", (e) => {
  if (e.target.dataset.vis !== undefined)
    viewer.setTypeVisible(+e.target.dataset.vis, e.target.checked);
});

$("auto").onchange = (e) => viewer.setAutoRotate(e.target.checked);
$("walls").onchange = (e) => viewer.setWalls(e.target.checked);
$("labels").onchange = (e) => {
  st.opts.labels = e.target.checked;
  viewer.setLabels(e.target.checked);
};
$("edit").onchange = (e) => {
  viewer.setEdit(e.target.checked);
  if (e.target.checked) {
    $("auto").checked = false;
    viewer.setAutoRotate(false);
    flash("Mode edit: drag box untuk memindah");
  }
};
$("clip").oninput = (e) => viewer.setClip(+e.target.value / 100);
$("reset").onclick = () => viewer.resetView();
$("step").oninput = (e) => setStep(+e.target.value);
function setStep(n) {
  viewer.setStep(n);
  $("step").value = n;
  $("stepLabel").textContent = `${n} / ${$("step").max}`;
}
function stopPlay() {
  clearInterval(playTimer);
  playTimer = null;
  $("play").textContent = "▶";
}
$("play").onclick = () => {
  if (playTimer) return stopPlay();
  const max = +$("step").max;
  if (!max) return;
  let n = +$("step").value >= max ? 0 : +$("step").value;
  $("play").textContent = "⏸";
  playTimer = setInterval(() => {
    n++;
    setStep(n);
    if (n >= max) stopPlay();
  }, 90);
};
$("theme").onclick = () => {
  const d = document.documentElement,
    dark = d.dataset.theme
      ? d.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme:dark)").matches;
  d.dataset.theme = dark ? "light" : "dark";
};

$("bLock").onclick = () => {
  if (!sel) return;
  sel.locked = !sel.locked;
  viewer.syncAll();
  showSel(sel);
};
function rotateSel() {
  if (!sel || sel.locked) return;
  const c = cur().placed,
    n = { ...sel, l: sel.w, w: sel.l };
  n.y = settleY(c, sel, n.x, n.z, n.l, n.w);
  if (!canPlace(st.cont, c, sel, n)) {
    flash("Tidak muat setelah diputar");
    return;
  }
  Object.assign(sel, { l: n.l, w: n.w, y: n.y });
  recalcLevels(c);
  renderStats();
  render(true, sel);
  renderStats();
}
function removeSel() {
  if (!sel || sel.locked) return;
  const c = cur();
  c.placed = c.placed.filter((b) => b !== sel);
  c.placed.forEach((b, i) => {
    b.id = i;
  });
  plan.unplaced.push({ ...sel, reason: "dikeluarkan manual" });
  recalcLevels(c.placed);
  render(true);
}
$("bRot").onclick = rotateSel;
$("bDel").onclick = removeSel;
document.addEventListener("keydown", (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === "r" || e.key === "R") rotateSel();
  else if (e.key === "l" || e.key === "L") $("bLock").click();
  else if (e.key === "Delete" || e.key === "Backspace") removeSel();
  else if (e.key === "Escape") viewer.select(null);
});

function applyState(d) {
  Object.assign(st.cont, d.cont);
  Object.assign(st.opts, d.opts);
  st.types = d.types;
  syncOpts();
  renderTypes();
  if (d.plan) {
    plan = d.plan;
    ci = 0;
    render();
  } else doPack(false);
}
$("bSave").onclick = () =>
  io.download(
    "cargo-project.json",
    JSON.stringify({
      v: 1,
      cont: st.cont,
      opts: st.opts,
      types: st.types,
      plan,
    }),
    "application/json",
  );
$("bLoad").onclick = () => $("fLoad").click();
$("fLoad").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    applyState(JSON.parse(await f.text()));
  } catch {
    flash("File proyek tidak valid");
  }
  e.target.value = "";
};
$("bCsv").onclick = () => $("fCsv").click();
$("fCsv").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const t = io.parseTypesCSV(await f.text(), PAL);
  if (!t.length) flash("CSV kosong / format kolom tidak dikenali");
  else {
    st.types = t;
    renderTypes();
    doPack(false);
    flash(`${t.length} jenis box diimpor (cm, kg)`);
  }
  e.target.value = "";
};
$("bExpCsv").onclick = () =>
  io.download("urutan-muat.csv", io.placementCSV(plan), "text/csv");
$("bShare").onclick = async () => {
  const url =
    location.href.split("#")[0] +
    "#p=" +
    io.encodeShare({ cont: st.cont, opts: st.opts, types: st.types });
  try {
    await navigator.clipboard.writeText(url);
    flash("Link disalin ke clipboard");
  } catch {
    prompt("Salin link ini:", url);
  }
};
$("bReport").onclick = async () => {
  const w = window.open("", "_blank");
  if (!w) {
    flash("Popup diblokir browser");
    return;
  }
  const orig = ci,
    blocks = [];
  for (let k = 0; k < plan.containers.length; k++) {
    ci = k;
    render();
    await new Promise((r) => setTimeout(r, 60));
    const c = plan.containers[k],
      s = summarize(st.cont, c.placed),
      cv = st.cont.L * st.cont.W * st.cont.H;
    blocks.push({
      title: `Container ${k + 1}`,
      img: viewer.snapshot(),
      html:
        `${c.placed.length} box · volume ${r2((s.volume / cv) * 100)}% · berat ${r2(s.totalWeight)} kg` +
        (s.cog
          ? ` · CoG ${r2((s.cog.x / st.cont.L - 0.5) * 100)}% / ${r2((s.cog.z / st.cont.W - 0.5) * 100)}%`
          : ""),
    });
  }
  ci = orig;
  render();
  const counts = {};
  plan.containers.forEach((c) =>
    c.placed.forEach((b) => {
      counts[b.type] = (counts[b.type] || 0) + 1;
    }),
  );
  io.writeReport(w, {
    title: "Laporan Muatan Container",
    contText: `Container ${r2(st.cont.L)}×${r2(st.cont.W)}×${r2(st.cont.H)} cm, maks ${st.cont.maxWeight} kg${st.opts.lifo ? " · LIFO" : ""}`,
    blocks,
    typeRows: st.types.map((t, i) => [
      t.name,
      `${r2(t.l)}×${r2(t.w)}×${r2(t.h)}`,
      t.q,
      counts[i] || 0,
      r2(t.weight),
      "#" + t.group,
    ]),
    loadRows: plan.containers.flatMap((c, k) =>
      c.placed.map((b) => [
        k + 1,
        b.id + 1,
        b.name,
        b.x,
        b.y,
        b.z,
        b.l,
        b.w,
        b.h,
        b.weight,
        "#" + b.group,
      ]),
    ),
  });
};

syncOpts();
renderTypes();
if (location.hash.startsWith("#p=")) {
  try {
    const d = io.decodeShare(location.hash.slice(3));
    Object.assign(st.cont, d.cont);
    Object.assign(st.opts, d.opts);
    st.types = d.types;
    syncOpts();
    renderTypes();
  } catch {
    /* abaikan */
  }
}
doPack(false);
