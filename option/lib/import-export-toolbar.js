/* NQA Import/Export toolbar controller (standalone)
 * Exposes window.NqaImportExportToolbar for use in options UI.
 */
(function (global) {
  'use strict';

  class NqaImportExportToolbar {
    constructor(opts) {
      this.opts = opts || {};
      const els = this.opts.els || {};
      this.importBtn = els.importBtn || null;
      this.exportBtn = els.exportBtn || null;
      this.importFile = els.importFile || null;
      // Import modal controls
      this.importModal = els.importModal || null;
      this.importSummary = els.importSummary || null;
      this.importCancelBtn = els.importCancelBtn || null;
      this.importAddBtn = els.importAddBtn || null;
      this.importReplaceBtn = els.importReplaceBtn || null;

      // Store API (required): getMenu, setMenu, getInstance, setInstance
      this.store = this.opts.store || null;
      // Optional callbacks
      this.onMenuChanged = typeof this.opts.onMenuChanged === 'function' ? this.opts.onMenuChanged : null;
      this.onInstanceChanged = typeof this.opts.onInstanceChanged === 'function' ? this.opts.onInstanceChanged : null;

      // Validators (can be overridden)
      this.isValidNqaUrl = this.opts.isValidNqaUrl || this._isValidNqaUrl;
      this.isValidInstanceUrl = this.opts.isValidInstanceUrl || this._isValidInstanceUrl;

      // Internal pending state
      this._pendingItems = null; // array
      this._pendingInstance = undefined; // object | null | undefined
    }

    attach() {
      if (this.exportBtn) this.exportBtn.addEventListener('click', () => this._onExport());
      if (this.importBtn) this.importBtn.addEventListener('click', () => {
        try { if (this.importFile) this.importFile.click(); } catch (_) {}
      });
      if (this.importFile) this.importFile.addEventListener('change', (e) => this._onImportFile(e));

      if (this.importCancelBtn) this.importCancelBtn.addEventListener('click', () => this._closeImportModal());
      if (this.importAddBtn) this.importAddBtn.addEventListener('click', () => this._finalizeAdd());
      if (this.importReplaceBtn) this.importReplaceBtn.addEventListener('click', () => this._finalizeReplace());
    }

    async _onExport() {
      try {
        if (!this.store?.exportToDownload) throw new Error('Store missing exportToDownload');
        await this.store.exportToDownload('NQA_Configuration.json');
      } catch (e) {
        try { alert('Export failed'); } catch (_) {}
      }
    }

    async _onImportFile(ev) {
      const file = ev?.target?.files && ev.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch (_) { parsed = null; }
        const arr = Array.isArray(parsed?.menu) ? parsed.menu : null;
        if (!Array.isArray(arr)) { this._alert('Invalid JSON format (expected {"menu": [...], "instance"?: {...}})'); return this._resetFile(ev); }

        const clean = [];
        for (const it of arr) {
          const name = String((it?.name ?? it?.label ?? '')).trim();
          const url = String(it?.url ?? '').trim();
          if (!name || !url) continue;
          if (!this.isValidNqaUrl(url)) continue;
          clean.push({ name, url });
        }
        if (!clean.length) { this._alert('No valid entries to import'); return this._resetFile(ev); }

        // Instance is optional (null to clear, or {name,url})
        const importedInst = (parsed && typeof parsed === 'object') ? (parsed.instance ?? undefined) : undefined;
        this._pendingInstance = (importedInst === null || (importedInst && typeof importedInst.name === 'string' && typeof importedInst.url === 'string'))
          ? importedInst : undefined;

        const existing = await this.store.getMenu();
        if (existing && existing.length) {
          this._pendingItems = clean;
          this._showImportModal(`${clean.length} menu item(s) detected${(this._pendingInstance!==undefined)?' + instance':''}. Choose: Add or Replace.`);
        } else {
          await this.store.setMenu(clean);
          await this._maybeApplyInstanceOnImport();
          if (typeof this.onMenuChanged === 'function') try { this.onMenuChanged(); } catch (_) {}
        }
      } catch (e) {
        this._alert('Import failed');
      } finally {
        this._resetFile(ev);
      }
    }

    async _finalizeAdd() {
      try {
        const existing = await this.store.getMenu();
        const merged = Array.isArray(existing) ? existing.slice() : [];
        if (Array.isArray(this._pendingItems)) merged.push(...this._pendingItems);
        await this.store.setMenu(merged);
        await this._maybeApplyInstanceOnImport();
        if (typeof this.onMenuChanged === 'function') try { this.onMenuChanged(); } catch (_) {}
      } catch (_) { this._alert('Import failed'); }
      finally { this._closeImportModal(true); }
    }

    async _finalizeReplace() {
      try {
        const items = Array.isArray(this._pendingItems) ? this._pendingItems : [];
        await this.store.setMenu(items);
        await this._maybeApplyInstanceOnImport();
        if (typeof this.onMenuChanged === 'function') try { this.onMenuChanged(); } catch (_) {}
      } catch (_) { this._alert('Import failed'); }
      finally { this._closeImportModal(true); }
    }

    async _maybeApplyInstanceOnImport() {
      if (this._pendingInstance === undefined) return;
      try {
        if (this._pendingInstance === null) {
          await this.store.setInstance(null);
          if (typeof this.onInstanceChanged === 'function') try { this.onInstanceChanged(null); } catch (_) {}
          return;
        }
        const instName = String(this._pendingInstance.name || '').trim();
        const instUrl = String(this._pendingInstance.url || '').trim();
        if (instName && this.isValidInstanceUrl(instUrl)) {
          await this.store.setInstance({ name: instName, url: instUrl });
          if (typeof this.onInstanceChanged === 'function') try { this.onInstanceChanged({ name: instName, url: instUrl }); } catch (_) {}
        }
      } catch (_) { /* ignore */ }
    }

    _showImportModal(summaryText) {
      try { if (this.importSummary) this.importSummary.textContent = summaryText || ''; } catch (_) {}
      try { if (this.importModal) this.importModal.hidden = false; } catch (_) {}
    }
    _closeImportModal(resetPending) {
      try { if (this.importModal) this.importModal.hidden = true; } catch (_) {}
      if (resetPending) { this._pendingItems = null; this._pendingInstance = undefined; }
    }
    _resetFile(ev) {
      try { if (this.importFile) this.importFile.value = ''; } catch (_) {}
    }
    _alert(msg) { try { alert(msg); } catch (_) {} }

    // Default validators (can be overridden via opts)
    _isValidNqaUrl(str) {
      const s = String(str || '').trim();
      const PH_RE = /\{[A-Za-z0-9_:-]+\}/g;
      if (!PH_RE.test(s)) return false;
      const base = s.replace(PH_RE, 'X');
      try {
        const u = new URL(base);
        return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
      } catch (_) { return false; }
    }
    _isValidInstanceUrl(str) {
      const s = String(str || '').trim();
      if (!s) return false;
      if (/\/$/.test(s)) return false;
      try {
        const u = new URL(s);
        if (!(u.protocol === 'http:' || u.protocol === 'https:')) return false;
        if (!u.hostname) return false;
        if (u.search || u.hash) return false;
        const afterHost = s.replace(/^https?:\/\//i, '').replace(/^\[[^\]]+\]/, '').replace(/^[^/]+/, '');
        return afterHost === '';
      } catch (_) { return false; }
    }
  }

  global.NqaImportExportToolbar = NqaImportExportToolbar;
})(window);
