(function () {
  const tabs = Array.from(document.querySelectorAll('aside .tab'));
  const panels = Array.from(document.querySelectorAll('aside .panel'));
  const KEY = 'cargo.tab';

  function show(name, focus) {
    if (!tabs.some(t => t.dataset.tab === name)) name = 'container';
    tabs.forEach(t => {
      const on = t.dataset.tab === name;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', on);
      t.tabIndex = on ? 0 : -1;
      if (on) {
        if (focus) t.focus();
        t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
    panels.forEach(p => {
      const on = p.id === 'panel-' + name;
      p.classList.toggle('active', on);
      p.hidden = !on;
    });
    try { localStorage.setItem(KEY, name); } catch (e) {}
  }
  window.showTab = show; 

  const current = () => (tabs.find(t => t.classList.contains('active')) || {}).dataset?.tab;

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.dataset.tab));
    t.addEventListener('keydown', e => {
      let j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + tabs.length) % tabs.length;
      if (j !== null) { e.preventDefault(); show(tabs[j].dataset.tab, true); }
    });
  });

  document.querySelectorAll('[data-goto]').forEach(b =>
    b.addEventListener('click', () => show(b.dataset.goto)));

  ['pack', 'repack'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.addEventListener('click', () => show('hasil'));
  });

  const view = document.getElementById('view');
  const selbtns = document.getElementById('selbtns');
  if (view && selbtns) {
    let down = null;
    view.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    view.addEventListener('pointerup', e => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 5) return;
      setTimeout(() => {
        const selected = selbtns.style.display !== 'none' && getComputedStyle(selbtns).display !== 'none';
        if (selected && current() !== 'hasil') show('hasil');
      }, 60);
    });
  }

  let start = 'container';
  try { start = localStorage.getItem(KEY) || start; } catch (e) {}
  show(start);
})();