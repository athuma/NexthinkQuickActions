document.addEventListener('DOMContentLoaded', () => {
  try {
    const manifest = chrome.runtime.getManifest();
    const v = manifest?.version ? `v ${manifest.version}` : '';
    const el = document.getElementById('version');
    if (el) el.textContent = v;
    const brand = document.getElementById('brandIcon');
    if (brand) {
      try {
        brand.src = chrome?.runtime?.getURL ? chrome.runtime.getURL('icons/spark16x16.svg') : '../icons/spark16x16.svg';
      } catch (_) {
        brand.src = '../icons/spark16x16.svg';
      }
    }
  } catch (_) {
    // no-op if not available
  }

  const tbody = document.getElementById('cfgTbody');
  // Menu table (avoid selecting the instance table)
  const menuTable = document.querySelector('#menuSection .cfg-table');
  const empty = document.getElementById('emptyState');
  const addBtn = document.getElementById('addBtn');
  // Instance section DOM
  const instSection = document.getElementById('instanceSection');
  const instAddBtn = document.getElementById('instAddBtn');
  const instTable = document.getElementById('instTable');
  const instTbody = document.getElementById('instTbody');
  const importBtn = document.getElementById('importBtn');
  const exportBtn = document.getElementById('exportBtn');
  const importFile = document.getElementById('importFile');
  // Import modal elements
  const importModal = document.getElementById('importModal');
  const importSummary = document.getElementById('importSummary');
  const importCancelBtn = document.getElementById('importCancelBtn');
  const importAddBtn = document.getElementById('importAddBtn');
  const importReplaceBtn = document.getElementById('importReplaceBtn');
  let pendingImportItems = null; // holds menu array awaiting user choice
  let pendingImportInstance = undefined; // holds instance object|null if provided
  // Delete modal elements
  const deleteModal = document.getElementById('deleteModal');
  const deleteDialog = document.querySelector('#deleteModal .modal-dialog');
  const deleteSummary = document.getElementById('deleteSummary');
  const deleteCancelBtn = document.getElementById('deleteCancelBtn');
  const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');
  // legacy delete state removed (handled by controllers)
  // Instance modal elements
  const instanceModal = document.getElementById('instanceModal');
  const instanceDialog = document.querySelector('#instanceModal .modal-dialog');
  const instNameInput = document.getElementById('instNameInput');
  const instUrlInput = document.getElementById('instUrlInput');
  const instNameErr = document.getElementById('instNameErr');
  const instUrlErr = document.getElementById('instUrlErr');
  const instCancelBtn = document.getElementById('instCancelBtn');
  const instSaveBtn = document.getElementById('instSaveBtn');
  // legacy instance edit state removed (handled by NqaInstanceSection)

  // Centralized copy for help/errors
  const URL_HELP = 'Example: http(s)://hostname/path{keyword} <br>{keyword} is a column name and will be replaced by the captured value from the investigation<br>{*keyword} will match the first column name ending with keyword';
  const URL_ERR_INVALID = 'Invalid URL';

  // Decode percent-encoded strings for display (handles double-encoding like %253D)
  const decodeForDisplay = (val) => {
    // As for storage, display as-is
    return val;
    let s = String(val ?? '');
    // Try multiple passes but cap to avoid loops
    for (let i = 0; i < 3; i++) {
      try {
        const d = decodeURIComponent(s);
        if (d === s) break;
        s = d;
      } catch (_) {
        // If invalid sequence, stop and return current value
        break;
      }
    }
    return s;
  };

  // Heuristics: re-encode template URL for storage from a human-readable input.
  // - Preserves {keyword} placeholder positions (not encoded)
  // - Encodes query parameter values that look like nested URLs or contain reserved separators
  // - Leaves already-encoded values intact
  const encodeTemplateUrlForStorage = (input) => {
    // Until better idea, just store as-is
    return input
    // return input.replace(/\{/g, '%7B').replace(/\}/g, '%7D');

    // Protect any placeholder of the form {name}, allowing letters, digits, underscore, hyphen, colon
    const PH_RE = /\{[A-Za-z0-9_:-]+\}/g;
    const TOK = (i) => `__NQA_PH_${i}__`;
    try {
      const s0 = String(input || '').trim();
      if (!s0) return s0;
      // Map placeholders to unique sentinels so we can restore exact names (supports multiple placeholders)
      const placeholders = [];
      const protectedStr = s0.replace(PH_RE, (m) => {
        const i = placeholders.push(m) - 1;
        return TOK(i);
      });

      const u = new URL(protectedStr);
      const sp = new URLSearchParams(u.search);
      const looksEncoded = (v) => /%[0-9A-Fa-f]{2}/.test(v);
      const needsEncoding = (v) => /:\/\//.test(v) || /[\s?&#=]/.test(v);
      const next = new URLSearchParams();
      for (const [k, v] of sp.entries()) {
        if (v && !looksEncoded(v) && needsEncoding(v)) {
          next.set(k, encodeURIComponent(v));
        } else {
          next.set(k, v);
        }
      }
      const q = next.toString();
      let out = u.origin + u.pathname + (q ? ('?' + q) : '') + (u.hash || '');
      // Restore placeholders
      placeholders.forEach((ph, i) => {
        out = out.replace(new RegExp(TOK(i), 'g'), ph);
      });
      return out;
    } catch (_) {
      // Fallback: protect placeholders and encode minimally, then restore
      const PH_RE = /\{[A-Za-z0-9_:-]+\}/g;
      const placeholders = [];
      let s = String(input || '').trim().replace(PH_RE, (m) => {
        const i = placeholders.push(m) - 1;
        return `__NQA_PH_${i}__`;
      });
      s = encodeURI(s);
      placeholders.forEach((ph, i) => {
        s = s.replace(new RegExp(`__NQA_PH_${i}__`, 'g'), ph);
      });
      return s;
    }
  };

  const isValidNqaUrl = (str) => {
    const s = String(str || '').trim();
    // Must contain at least one placeholder like {name}
    const PH_RE = /\{[*A-Za-z0-9_:-]+\}/g;
    if (!PH_RE.test(s)) return false;
    // Validate base URL with all placeholders replaced
    const base = s.replace(PH_RE, 'X');
    try {
      const u = new URL(base);
      return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
    } catch (_) { return false; }
  };

  // Instance base URL must be protocol+host (and optional port), no path/search/hash, no trailing slash in user input
  const isValidInstanceUrl = (str) => {
    const s = String(str || '').trim();
    if (!s) return false;
    if (/\/$/.test(s)) return false; // no trailing slash
    try {
      const u = new URL(s);
      if (!(u.protocol === 'http:' || u.protocol === 'https:')) return false;
      if (!u.hostname) return false;
      if (u.search || u.hash) return false;
      // URL() normalizes pathname to '/' even if not present; ensure input had no path by checking after host there was nothing
      // Basic check: disallow any extra slash after host in input
      const afterHost = s.replace(/^https?:\/\//i, '').replace(/^\[[^\]]+\]/, '').replace(/^[^/]+/, '');
      if (afterHost !== '') return false;
      return true;
    } catch (_) {
      return false;
    }
  };

  // Use shared storage class (mandatory)
  const store = new window.NqaConfigStore();
  const getMenu = () => store.getMenu();
  const setMenu = (items) => store.setMenu(items);
  const getInstance = () => store.getInstance();
  const setInstance = (inst) => store.setInstance(inst);

  // Icons rendered via CSS masks; no runtime URL required

  // Instantiate Menu Entries controller
  try {
    const menuController = new window.NqaMenuEntriesController({
      els: {
        table: menuTable,
        tbody,
        empty,
        addBtn,
        deleteModal,
        deleteDialog,
        deleteSummary,
        deleteCancelBtn,
        deleteConfirmBtn,
      },
      store,
      decodeForDisplay,
      encodeTemplateUrlForStorage,
      isValidNqaUrl,
      URL_HELP,
      URL_ERR_INVALID,
    });
    menuController.attach();
    // Apply overlay/seed policy behavior
    (async () => {
      try {
        const store = new window.NqaConfigStore();
        // Seed mode: on first load, optionally seed managed into sync
        const managed = await new Promise((resolve) => { try { chrome.storage.managed.get(null, (res) => resolve(res || {})); } catch (_) { resolve({}); } });
        const pol = await store.getManagedPolicy(managed);
        if (pol.mode === 'seed') {
          try {
            const mMenu = Array.isArray(managed.menu) ? managed.menu : [];
            const validM = mMenu.filter(window.NqaConfigStore.isValidMenuItem);
            const current = await store.getMenu();
            if (pol.seedReplace || !(Array.isArray(current) && current.length)) {
              if (validM && validM.length) await store.setMenu(validM);
              if (managed.instance && window.NqaConfigStore.isValidInstance(managed.instance)) await store.setInstance(managed.instance);
            }
          } catch (_) {}
        } else {
          // Overlay: disable Add if user entries are not allowed
          if (pol.allowUserEntries === false && addBtn) addBtn.disabled = true;
        }
      } catch (_) {}
      // Initial render (after potential seed/disable)
      menuController.render();
    })();
    window.__nqaMenuController = menuController;
  } catch (_) { /* class may be missing if script not loaded */ }

  // Instantiate modular Instance section controller
  let instanceController = null;
  try {
    instanceController = new window.NqaInstanceSection({
      els: {
        section: instSection,
        table: instTable,
        tbody: instTbody,
        addBtn: instAddBtn,
        modal: instanceModal,
        dialog: instanceDialog,
        nameInput: instNameInput,
        urlInput: instUrlInput,
        nameErr: instNameErr,
        urlErr: instUrlErr,
        cancelBtn: instCancelBtn,
        saveBtn: instSaveBtn,
        deleteModal,
        deleteDialog,
        deleteSummary,
        deleteCancelBtn,
        deleteConfirmBtn,
      },
      store,
      isValidInstanceUrl,
    });
    instanceController.attach();
    // Render once and on storage changes
    instanceController.render();
    try { chrome.storage?.onChanged?.addListener(() => { instanceController && instanceController.render(); }); } catch (_) {}
    // Expose for debug if needed
    window.__nqaInstanceController = instanceController;
  } catch (_) { /* class may be missing if script not loaded */ }

  const render = (items) => {
    try { (window.__nqaMenuController)?.render?.(items); } catch (_) {}
  };

  const load = async () => {
    try { const items = await getMenu(); render(items); }
    catch (_) { render([]); }
  };

  const save = async (items) => { await setMenu(items); };

  // Wire Import/Export toolbar (modular controller)
  try {
    const toolbar = new window.NqaImportExportToolbar({
      els: { importBtn, exportBtn, importFile, importModal, importSummary, importCancelBtn, importAddBtn, importReplaceBtn },
      store,
      onMenuChanged: () => { try { (window.__nqaMenuController)?.render?.(); } catch (_) {} },
      onInstanceChanged: () => { try { instanceController.render(); } catch (_) {} },
      isValidNqaUrl,
      isValidInstanceUrl,
    });
    toolbar.attach();
  } catch (_) { /* noop if class missing */ }

  // Close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close modals via toolbar controller (if any)
      try { if (importModal && !importModal.hidden) importModal.hidden = true; } catch (_) {}
      if (deleteModal && !deleteModal.hidden) {
        try { deleteModal.hidden = true; } catch (_) {}
        if (deleteDialog) { deleteDialog.style.position = ''; deleteDialog.style.left = ''; deleteDialog.style.top = ''; }
      }
    }
  });

  // Re-render on storage changes
  try { chrome.storage?.onChanged?.addListener(() => { (window.__nqaMenuController)?.render?.(); (instanceController || window.__nqaInstanceController)?.render?.(); }); } catch (_) {}

});
