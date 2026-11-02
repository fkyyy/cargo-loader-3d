# Cargo Loader 3D (tahap 1-8)

Clone cargo loader 3D berbasis three.js. Tanpa build step: HTML + ES modules.

## Menjalankan
ES modules dan Web Worker tidak jalan lewat `file://`, jadi gunakan server lokal:

    npx serve .          # atau: python3 -m http.server 8080

Butuh internet untuk memuat three.js dari CDN (jsdelivr). Untuk offline: `npm i three@0.160.0`, lalu ganti URL
di `importmap` pada `index.html` ke `./node_modules/three/build/three.module.js` dan `./node_modules/three/examples/jsm/`.
Tes logika: `npm test` (Node 18+).

## Fitur per tahap
1. **Dasar**: container + jenis box (P×L×T, qty), packing otomatis, view 3D orbit 360°.
2. **Interaksi 3D**: klik box untuk detail, filter per jenis, slider/play urutan muat, potong tinggi, toggle dinding & pintu.
3. **Aturan kargo**: berat + batas muatan, pusat gravitasi (titik merah) dengan peringatan bias > 10%, box rapuh, maks. level tumpukan, rotasi per jenis.
4. **Bongkar muat**: nomor tujuan per jenis; mode LIFO (tujuan #1 paling dekat pintu, tidak ada box yang menghalangi).
5. **Edit manual**: centang "Mode edit", lalu drag box (jatuh otomatis ke lantai / atas box lain, merah bila tabrakan atau di luar container). Tombol/shortcut: Kunci (L), Putar 90° (R), Keluarkan (Del). "Susun ulang (kunci tetap)" menyusun sisa box tanpa menggeser box terkunci. Panel stats menampilkan audit pelanggaran aturan setelah edit manual.
6. **Simpan & output**: Simpan/Muat proyek (JSON), Import CSV, Export CSV urutan muat, Laporan PDF (jendela cetak berisi screenshot 3D + tabel; pilih "Save as PDF"), Link share (state di URL hash).
7. **Algoritma**: mode "Optimal" mencoba 9 strategi (urutan titik × urutan sortir) dan memilih yang terbaik; multi-container (sisa box pindah ke container berikutnya, dibatasi "Maks container"); packing berjalan di Web Worker (fallback ke main thread).
8. **Polish**: satuan cm/m/in dan kg/lb, label nama di atas box, tema terang/gelap, layout responsif + drag via sentuhan.

## Format CSV (cm, kg)
Header: `name,length,width,height,qty,weight,group,rot,fragile,maxStack,color`
- `rot`: free / flat / none · `fragile`: 1/true/ya · `color`: #rrggbb (opsional) · pemisah `,` atau `;`
- Excel: simpan sebagai CSV.

## Struktur
- `js/packer.js`  algoritma, aturan, multi-container, strategi (tanpa DOM, bisa dites di Node)
- `js/worker.js`  Web Worker pembungkus `solve()`
- `js/editor.js`  tabrakan, gravitasi, level tumpukan, audit
- `js/io.js`      CSV, unduh, link share, laporan
- `js/viewer.js`  scene three.js, picking, drag, clipping, label
- `js/main.js`    UI dan wiring
- `test/packer.test.js`

## Catatan
- Sumbu: x = panjang (pintu di x = L), y = tinggi, z = lebar. Data disimpan kanonik dalam cm/kg; satuan hanya tampilan.
- Packing adalah heuristik, bukan solusi optimal. Edit manual hanya mencegah tabrakan dan keluar container; pelanggaran aturan lain ditampilkan sebagai peringatan, bukan diblokir.
- Upload langsung dari Excel (.xlsx) belum ada (perlu library); gunakan CSV.
