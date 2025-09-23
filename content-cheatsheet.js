(function () {
  'use strict';

  function isInvestigations() {
    try {
      if (typeof detectPageContext === 'function') {
        const ctx = detectPageContext();
        if (ctx === 'Investigations') return true;
      }
      // Fallback: read header h2 text if available
      const h2 = document.querySelector('header h2');
      const t = (h2?.textContent || '').trim();
      return /\bInvestigations\b/i.test(t);
    } catch (_) { return false; }
  }

  function selectHeaderNodes() {
    try {
      return Array.from(document.querySelectorAll('table[role="presentation"] th[rowspan="1"] div[class*="LinesEllipsis"]'));
    } catch (_) { return []; }
  }

  function getLabelText(el) {
    try {
      const txt = Array.from(el.childNodes)
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent || '')
        .join('')
        .trim();
      return txt || (el.textContent || '').trim();
    } catch (_) { return (el && el.textContent || '').trim(); }
  }

  function ensureStyles() {
    if (document.getElementById('nqa-cheatsheet-style')) return;
    const css = `
    button#nqa-cheatsheet-toggle{position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#fff;border-radius:20px;border:1px solid rgba(0,0,0,0.15);padding:6px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2)}
    button#nqa-cheatsheet-toggle:hover{background:#f6f6f6}
    button#nqa-cheatsheet-toggle svg{display:block}
    #nqa-cheatsheet{position:fixed;right:16px;bottom:56px;z-index:2147483647;min-width:320px;max-width:480px;max-height:50vh;overflow:auto;background:#fff;color:#222;border:1px solid rgba(0,0,0,0.15);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12),0 2px 4px rgba(0,0,0,0.08)}
    #nqa-cheatsheet header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(0,0,0,0.08);font-weight:600}
    #nqa-cheatsheet .nqa-title{font-weight:700}
    #nqa-cheatsheet .nqa-list{padding:8px 12px}
    #nqa-cheatsheet .nqa-row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed rgba(0,0,0,0.06)}
    #nqa-cheatsheet .nqa-label{color:inherit;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 auto;min-width:0}
    #nqa-cheatsheet .nqa-key{font-family:monospace;background:#f5f7fa;color:#111;padding:2px 6px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 0 16ch;max-width:16ch}
    #nqa-cheatsheet .nqa-copy{flex:0 0 auto}
    #nqa-cheatsheet .nqa-copy{cursor:pointer;border:1px solid rgba(0,0,0,0.15);background:#4c4b4b;padding:2px 6px;border-radius:4px}
    #nqa-cheatsheet .nqa-copy:hover{background:#f6f6f6}
    #nqa-toast{position:fixed;right:16px;bottom:16px;background:#333;color:#fff;padding:6px 10px;border-radius:6px;opacity:0;transform:translateY(8px);transition:opacity .15s ease,transform .15s ease;z-index:2147483647}
    #nqa-toast.show{opacity:1;transform:translateY(0)}
    @media (prefers-color-scheme: dark){
      button#nqa-cheatsheet-toggle{background:#2b2b2b;border-color:rgba(255,255,255,0.15)}
      button#nqa-cheatsheet-toggle:hover{background:#333}
      button#nqa-cheatsheet-toggle svg{filter:invert(1)}
      #nqa-cheatsheet{background:#1f2125;color:#e8e8e8;border-color:rgba(255,255,255,0.12);box-shadow:0 8px 24px rgba(0,0,0,0.5),0 2px 4px rgba(0,0,0,0.4)}
      #nqa-cheatsheet header{border-bottom-color:rgba(255,255,255,0.1)}
      #nqa-cheatsheet .nqa-key{background:#2a2d33;color:#e8e8e8}
      #nqa-cheatsheet .nqa-copy{border-color:rgba(255,255,255,0.15);color:#e8e8e8}
      #nqa-cheatsheet .nqa-copy:hover{background:#2a2d33}
      #nqa-toast{background:#111;color:#eee}
    }
    `;
    const style = document.createElement('style');
    style.id = 'nqa-cheatsheet-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function setMenuIconActive(li, active) {
    try {
      const svg = li && li.querySelector ? li.querySelector('svg') : null;
      if (!svg) return;
      const gInactive = svg.querySelector('#icon-inactive');
      const gActive = svg.querySelector('#icon-active');
      if (gInactive) gInactive.style.display = active ? 'none' : '';
      if (gActive) gActive.style.display = active ? '' : 'none';
    } catch (_) {}
  }

  function showToast(msg) {
    let toast = document.getElementById('nqa-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'nqa-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1500);
  }

  function copy(text) {
    try {
      navigator.clipboard.writeText(text).then(() => showToast(`Copié: ${text}`)).catch(() => {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); showToast(`Copié: ${text}`); } catch (_) {}
        document.body.removeChild(ta);
      });
    } catch (_) {}
  }

  function injectToggleIntoMenubar() {
    try {
      // There can be multiple menubar ULs; pick the correct one.
      const uls = document.querySelectorAll("nav ul[role='menubar']")
      if(uls.length === 0) return null;
      const ul = uls[uls.length - 1]; // take last one
      if (!ul) return null;
      let exist = document.getElementById('nqa-cheatsheet-toggle');
      if (exist) return exist;
      // Clone last item to inherit styles and structure
      const lastItem = ul.querySelector("li[data-testid='item-container']:last-child");
      if (!lastItem) return null;
      const li = lastItem.cloneNode(true);
      // Clean content of the main icon anchor
      const a = li.querySelector('a[role="menuitem"], a');
      if (!a) return null; // expected structure in this application
      while (a.firstChild) a.removeChild(a.firstChild);
      li.id = 'nqa-cheatsheet-toggle';
      a.removeAttribute('id');
      a.title = 'QuickAction – Placeholders';
      a.setAttribute('aria-label','QuickAction – Placeholders');
      a.setAttribute('aria-haspopup','false');
      a.setAttribute('tabindex','-1');
      try {
        const svgColor = lastItem.querySelector('svg')?.getAttribute('color') || 'currentColor';
        const svg = (typeof buildQuickActionsIconSvg === 'function') ? buildQuickActionsIconSvg(true) : null;
        if (svg) {
          svg.setAttribute('width','16');
          svg.setAttribute('height','16');
          svg.setAttribute('color', svgColor);
          a.appendChild(svg);
        } else {
          a.textContent = 'QuickAction';
        }
      } catch (_) { a.textContent = 'QuickAction'; }
      // Update the title wrapper anchor (second <a>), if present
      try {
        const anchors = Array.from(li.querySelectorAll('a'));
        const titleAnchor = anchors.find(el => el !== a);
        if (titleAnchor) {
          titleAnchor.removeAttribute('id');
          const titleDiv = titleAnchor.querySelector('div') || null;
          if (titleDiv) {
            titleDiv.textContent = 'QuickAction';
            try { titleDiv.setAttribute('title', 'QuickAction'); } catch (_) {}
          } else {
            titleAnchor.textContent = 'QuickAction';
          }
        }
      } catch (_) {}
      // Insert separator clone (before our item) if available in this UL
      const sep = ul.querySelector('hr');
      if (sep) {
        const clone = sep.cloneNode(true);
        clone.id = 'nqa-cheatsheet-separator';
        ul.appendChild(clone);
      }
      ul.appendChild(li);
      return li;
    } catch (_) { return null; }
  }

  function buildPanel() {
    const wrap = document.createElement('div');
    wrap.id = 'nqa-cheatsheet';
    const header = document.createElement('header');
    header.innerHTML = `<span class="nqa-title">Quick Action Link Placeholders</span>`;
    const list = document.createElement('div');
    list.className = 'nqa-list';
    wrap.appendChild(header); wrap.appendChild(list);
    return wrap;
  }

  function populate() {
    try {
      const panel = document.getElementById('nqa-cheatsheet'); if (!panel) return;
      const list = panel.querySelector('.nqa-list'); if (!list) return;
      list.innerHTML = '';
      const nodes = selectHeaderNodes();
      let count = 0;
      nodes.forEach((el) => {
        const label = getLabelText(el);
        const key = (typeof normalizeColumnKey === 'function') ? normalizeColumnKey(label) : label;
        if (!key) return;
        const row = document.createElement('div'); row.className = 'nqa-row';
        const lab = document.createElement('div'); lab.className = 'nqa-label'; lab.textContent = label;
        const val = document.createElement('div'); val.className = 'nqa-key'; val.textContent = `{${key}}`;
        const btn = document.createElement('button'); btn.className = 'nqa-copy'; btn.type = 'button'; btn.title = `Copier {${key}}`; btn.textContent = 'Copier';
        btn.addEventListener('click', () => copy(`{${key}}`));
        val.addEventListener('click', () => copy(`{${key}}`));
        row.appendChild(lab); row.appendChild(val); row.appendChild(btn);
        list.appendChild(row); count++;
      });
      if (count === 0) {
        const info = document.createElement('div'); info.style.padding='8px 12px'; info.textContent = 'Aucune colonne détectée.'; list.appendChild(info);
      }
    } catch (_) {}
  }

  function mount() {
    if (!isInvestigations()) return;
    ensureStyles();
    // Toggle entry in menubar (single target app, no fallback)
    const toggle = injectToggleIntoMenubar();
    if (!toggle) return; // do nothing if menu not available
    // Panel
    let panel = document.getElementById('nqa-cheatsheet');
    if (!panel) {
      panel = buildPanel();
      panel.hidden = true;
      document.body.appendChild(panel);
    }
    populate();
    setMenuIconActive(toggle, !panel.hidden);
    toggle.onclick = (ev) => {
      try { ev && ev.preventDefault && ev.preventDefault(); } catch (_) {}
      panel.hidden = !panel.hidden;
      if (!panel.hidden) populate();
      setMenuIconActive(toggle, !panel.hidden);
    };

    // Observe for table changes (debounced, ignore own panel/toggle mutations)
    let populateScheduled = false;
    const schedulePopulate = () => {
      if (populateScheduled) return;
      populateScheduled = true;
      setTimeout(() => { try { if (!panel.hidden) populate(); } finally { populateScheduled = false; } }, 150);
    };
    const mo = new MutationObserver((muts) => {
      if (panel.hidden) return;
      for (const m of muts) {
        const t = m.target;
        if (panel.contains(t) || (toggle && toggle.contains && toggle.contains(t))) continue;
        let skip = false;
        if (m.addedNodes && m.addedNodes.length) {
          for (const n of m.addedNodes) {
            if (n instanceof Element && (panel.contains(n) || (toggle && toggle.contains && toggle.contains(n)))) { skip = true; break; }
          }
        }
        if (skip) continue;
        schedulePopulate();
        break;
      }
    });
    try { mo.observe(document.body, { childList: true, subtree: true }); } catch (_) {}
  }

  // Defer mounting until page is ready and context is Investigations (SPA safe)
  function scheduleMount() {
    const tryNow = () => { if (isInvestigations()) { mount(); return true; } return false; };
    // If already ok, mount now
    if (tryNow()) return;
    // Wait for DOM ready
    const onReady = () => { if (tryNow()) { document.removeEventListener('DOMContentLoaded', onReady); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
    else onReady();
    // Observe DOM mutations to catch SPA navigation
    const mo = new MutationObserver(() => { if (tryNow()) { try { mo.disconnect(); } catch (_) {} } });
    try { mo.observe(document.body, { childList: true, subtree: true }); } catch (_) {}
    // Safety timeout to stop observing after 15s
    setTimeout(() => { try { mo.disconnect(); } catch (_) {} }, 15000);
  }

  try { scheduleMount(); } catch (_) {}
})();
