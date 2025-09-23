/*
  NqaConfigStore — centralized storage + import/export for Nexthink Quick Actions.

  Storage schema (single source of truth):
    - key `menu`:     { menu: Array<MenuItem> }
    - key `instance`: { instance: Instance|null }
    - global version key: `version` (string) shared by the whole storage

  Types:
    MenuItem = { name: string, url: string }
    Instance = { name: string, url: string }

  Export/Import JSON format:
    { menu: Array<MenuItem>, instance: Instance|null, version: string }

  Notes:
    - The class is exposed globally as `window.NqaConfigStore`.
*/
(function (global) {
  'use strict';

  // Resolve extension version from manifest (fallback to a default if unavailable)
  function getExtensionVersion() {
    try { return (chrome?.runtime?.getManifest?.() || {}).version || '1.0.0'; }
    catch (_) { return '1.0.0'; }
  }

  // Compare two SemVer strings. Returns -1, 0, 1
  function semverCompare(a, b) {
    const pa = String(a || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
    const pb = String(b || '0.0.0').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
      if (pa[i] < pb[i]) return -1;
      if (pa[i] > pb[i]) return 1;
    }
    return 0;
  }

  const hasChromeSync = () => {
    try { return !!(chrome && chrome.storage && chrome.storage.sync); } catch (_) { return false; }
  };

  const getSync = () => hasChromeSync() ? chrome.storage.sync : null;

  const promisifyGet = (keys) => new Promise((resolve) => {
    const SYNC = getSync();
    if (!SYNC) { resolve({}); return; }
    try { SYNC.get(keys, (res) => resolve(res || {})); } catch (_) { resolve({}); }
  });

  const promisifySet = (obj) => new Promise((resolve) => {
    const SYNC = getSync();
    if (!SYNC) { resolve(); return; }
    try { SYNC.set(obj, resolve); } catch (_) { resolve(); }
  });

  // Read all managed policies (read-only). Returns {} if none or not available
  const getManagedAll = () => new Promise((resolve) => {
    try { chrome.storage.managed.get(null, (res) => resolve(res || {})); } catch (_) { resolve({}); }
  });

  class NqaConfigStore {
    // Static constants (defined at the top of the class)
    static VERSION = getExtensionVersion();   // current model/storage version
    static VERSION_KEY = 'version';          // single, global storage version key
    static KEYS = { MENU: 'menu', INSTANCE: 'instance' };
    static DEFAULT_EXPORT_FILENAME = 'NQA_Configuration.json';

    // Validation helpers
    static isValidMenuItem(it) {
      if (!it || typeof it !== 'object') return false;
      const name = String(it.name || '').trim();
      const url = String(it.url || '').trim();
      if (!name || !url) return false;
      return true;
    }
    static isValidInstance(obj) {
      if (!obj) return false;
      if (typeof obj !== 'object') return false;
      const name = String(obj.name || '').trim();
      const url = String(obj.url || '').trim();
      if (!name || !url) return false;
      try {
        const u = new URL(url);
        if (!(u.protocol === 'http:' || u.protocol === 'https:')) return false;
        return !!u.hostname;
      } catch (_) { return false; }
    }

    // Read API
    async getMenu() {
      await this.ensureAndMigrateStorage();
      const managed = await getManagedAll();
      const pol = await this.getManagedPolicy(managed);
      // In seed mode, we always return user (sync) menu; managed is only used at seed time
      const userMenu = await (async () => {
        const def = { [NqaConfigStore.KEYS.MENU]: { menu: [] } };
        const res = await promisifyGet(def);
        const doc = res[NqaConfigStore.KEYS.MENU];
        return Array.isArray(doc?.menu) ? doc.menu : [];
      })();
      if (pol.mode === 'seed') return userMenu;
      // Overlay mode: merge managed (locked) + user (optionally)
      const mm = Array.isArray(managed.menu) ? managed.menu.filter(NqaConfigStore.isValidMenuItem) : [];
      const lock = pol.lockManagedEntries !== false; // default true
      const result = [];
      const seen = new Set();
      const sig = (it) => `${(it.name||'').toLowerCase()}|${(it.url||'').toLowerCase()}`;
      mm.forEach((it) => { const o = { name: it.name, url: it.url, __managed: true, __locked: !!lock }; result.push(o); seen.add(sig(o)); });
      if (pol.allowUserEntries !== false) {
        userMenu.forEach((it) => { const s = sig(it); if (!seen.has(s)) { result.push({ name: it.name, url: it.url }); } });
      }
      return result;
    }
    async getInstance() {
      await this.ensureAndMigrateStorage();
      const managed = await getManagedAll();
      const pol = await this.getManagedPolicy(managed);
      if (pol.mode !== 'seed') {
        const inst = managed?.instance;
        if (inst && NqaConfigStore.isValidInstance(inst)) return inst;
      }
      const def = { [NqaConfigStore.KEYS.INSTANCE]: { instance: null } };
      const res = await promisifyGet(def);
      const inst = res?.[NqaConfigStore.KEYS.INSTANCE]?.instance ?? null;
      return inst && NqaConfigStore.isValidInstance(inst) ? inst : null;
    }

    // Write API
    async setMenu(items) {
      const arr = Array.isArray(items) ? items.filter(NqaConfigStore.isValidMenuItem) : [];
      await promisifySet({ [NqaConfigStore.KEYS.MENU]: { menu: arr } });
      await this.ensureStorageVersion();
    }
    async setInstance(inst) {
      const payload = (inst && NqaConfigStore.isValidInstance(inst)) ? inst : null;
      await promisifySet({ [NqaConfigStore.KEYS.INSTANCE]: { instance: payload } });
      await this.ensureStorageVersion();
    }

    async getStorageVersion() {
      // Do not provide a default here; we need to detect first-run (no key stored)
      const res = await promisifyGet([NqaConfigStore.VERSION_KEY]);
      const v = res && res[NqaConfigStore.VERSION_KEY];
      return (typeof v === 'string' && v) ? v : null;
    }
    async setStorageVersion(version) {
      const v = (typeof version === 'string' && version) ? version : getExtensionVersion();
      await promisifySet({ [NqaConfigStore.VERSION_KEY]: v });
    }
    async ensureStorageVersion() {
      const current = getExtensionVersion();
      const stored = await this.getStorageVersion();
      if (stored !== current) await this.setStorageVersion(current);
    }

    // Ensure storage version is aligned with the extension, run migration if older
    async ensureAndMigrateStorage() {
      const current = getExtensionVersion();
      const stored = await this.getStorageVersion();
      if (!stored) {
        try { console.log('[NQA][store] Migration: initialize storage to', current); } catch (_) {}
        await this._migrateStorage('0.0.0', current);
        await this.setStorageVersion(current);
        return;
      }
      const cmp = semverCompare(stored, current);
      if (cmp < 0) {
        try { console.log(`[NQA][store] Migration from ${stored} to ${current}`); } catch (_) {}
        await this._migrateStorage(stored, current);
        await this.setStorageVersion(current);
      }
    }

    // Normalized managed policy (with defaults)
    async getManagedPolicy(managedOpt) {
      const managed = managedOpt || await getManagedAll();
      const p = (managed && managed.policy) || {};
      return {
        mode: (p.mode === 'seed') ? 'seed' : 'overlay',
        allowUserEntries: (p.allowUserEntries !== false),
        lockManagedEntries: (p.lockManagedEntries !== false),
        seedReplace: !!p.seedReplace,
      };
    }

    // Migration steps from old stored version to current
    async _migrateStorage(fromVersion, toVersion) {
      // For now: log only. Real migration steps can be added later.
      try { console.log('[NQA][store] Migration', { fromVersion, toVersion }); } catch (_) {}
    }

    // Export current config as a single JSON-safe object
    async exportAsObject() {
      const menu = await this.getMenu();
      const instance = await this.getInstance();
      const version = await this.getStorageVersion();
      return { menu, instance: (instance || null), version };
    }

    // Trigger a download of the exported configuration
    async exportToDownload(filename = NqaConfigStore.DEFAULT_EXPORT_FILENAME) {
      const obj = await this.exportAsObject();
      const payload = JSON.stringify(obj, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          try { document.body.removeChild(a); } catch (_) {}
          URL.revokeObjectURL(url);
        }, 0);
      } catch (_) {
        URL.revokeObjectURL(url);
      }
    }

    // Import from an object that should look like: { menu: [...], instance?: {...}|null, version?: string }
    // options: { mode: 'add' | 'replace', overrideInstance?: boolean (default replace only), validateOnly?: boolean }
    async importFromObject(obj, options = {}) {
      const mode = (options.mode === 'add' || options.mode === 'replace') ? options.mode : 'replace';
      const overrideInstance = options.overrideInstance === true || mode === 'replace';
      const validateOnly = options.validateOnly === true;

      if (!obj || typeof obj !== 'object') throw new Error('Invalid import object');
      const rawArr = Array.isArray(obj.menu) ? obj.menu : null;
      if (!Array.isArray(rawArr)) throw new Error('Invalid JSON format: expected { menu: [...] }');

      // Sanitize menu
      const menu = [];
      for (const it of rawArr) {
        if (!it || typeof it !== 'object') continue;
        const clean = {
          name: String(it.name || '').trim(),
          url: String(it.url || '').trim(),
        };
        if (NqaConfigStore.isValidMenuItem(clean)) menu.push(clean);
      }

      // Sanitize instance
      let instance = undefined; // means: not provided
      if (Object.prototype.hasOwnProperty.call(obj, 'instance')) {
        const provided = obj.instance;
        if (provided === null) instance = null;
        else if (NqaConfigStore.isValidInstance(provided)) instance = { name: provided.name.trim(), url: provided.url.trim() };
        else instance = undefined; // ignore invalid instance
      }

      if (validateOnly) {
        return { ok: true, counts: { menu: menu.length }, hasInstance: (instance !== undefined), mode };
      }

      // Apply
      if (mode === 'replace') {
        await this.setMenu(menu);
        if (instance !== undefined) await this.setInstance(instance);
      } else {
        // add
        const existing = await this.getMenu();
        await this.setMenu((existing || []).concat(menu));
        if (instance !== undefined && overrideInstance) {
          const cur = await this.getInstance();
          if (!cur && instance) await this.setInstance(instance);
        }
      }

      // Align stored version to current extension version after import
      await this.ensureStorageVersion();

      return { ok: true, counts: { menu: menu.length }, appliedInstance: instance !== undefined };
    }
  }

  global.NqaConfigStore = NqaConfigStore;
})(typeof window !== 'undefined' ? window : this);
