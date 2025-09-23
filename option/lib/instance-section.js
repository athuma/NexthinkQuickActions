/* NQA Nexthink Instance section controller */
(function (global) {
  'use strict';

  const REGION_LABELS = {
    us: 'United States',
    eu: 'European Union',
    pac: 'Asia-Pacific',
    meta: 'Middle East, Turkey & Africa',
  };

  const PLACEHOLDER_TOKEN = '{instance_name}';

  const InstanceUtils = global.NqaInstanceUtils;
  if (!InstanceUtils) throw new Error('NqaInstanceUtils not loaded before instance-section.js');
  const {
    sanitizePrefix,
    isValidPrefix,
    isValidRegion,
    derivePrefixFromUrl,
    deriveRegionFromUrl,
    buildUrlFromParts,
  } = InstanceUtils;

  const copyToClipboard = async (text) => {
    const value = String(text || '');
    if (!value) return false;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch (_) { /* ignore */ }
    try {
      const tmp = document.createElement('textarea');
      tmp.value = value;
      tmp.setAttribute('readonly', '');
      tmp.style.position = 'fixed';
      tmp.style.opacity = '0';
      document.body.appendChild(tmp);
      tmp.select();
      document.execCommand('copy');
      document.body.removeChild(tmp);
      return true;
    } catch (_) {
      return false;
    }
  };

  class NqaInstanceSection {
    constructor(opts) {
      this.opts = opts || {};
      const els = this.opts.els || {};
      this.section = els.section || null;
      this.table = els.table || null;
      this.tbody = els.tbody || null;
      this.addBtn = els.addBtn || null;
      this.modal = els.modal || null;
      this.dialog = els.dialog || null;
      this.prefixInput = els.prefixInput || null;
      this.regionSelect = els.regionSelect || null;
      this.prefixErr = els.prefixErr || null;
      this.previewUrlEl = els.previewUrl || null;
      this.copyUrlBtn = els.copyUrlBtn || null;
      this.copyPlaceholderBtn = els.copyPlaceholderBtn || null;
      this.placeholderEl = els.placeholderEl || null;
      this.placeholderValueEl = els.placeholderValue || null;
      this.cancelBtn = els.cancelBtn || null;
      this.saveBtn = els.saveBtn || null;
      // Reuse shared delete modal
      this.deleteModal = els.deleteModal || null;
      this.deleteDialog = els.deleteDialog || null;
      this.deleteSummary = els.deleteSummary || null;
      this.deleteCancelBtn = els.deleteCancelBtn || null;
      this.deleteConfirmBtn = els.deleteConfirmBtn || null;

      this.store = this.opts.store || null;

      this._pendingAnchor = null;
      this._deletingInstance = false;
      this._currentInstance = null;
    }

    attach() {
      if (this.addBtn) this.addBtn.addEventListener('click', () => this._openEdit({}, this.addBtn));
      if (this.tbody) this.tbody.addEventListener('click', (ev) => this._onTableClick(ev));
      if (this.cancelBtn) this.cancelBtn.addEventListener('click', () => this._closeModal());
      if (this.saveBtn) this.saveBtn.addEventListener('click', () => this._onSave());
      if (this.prefixInput) this.prefixInput.addEventListener('input', () => { this._updatePreview(); this._updateSaveDisabled(true); });
      if (this.regionSelect) this.regionSelect.addEventListener('change', () => { this._updatePreview(); this._updateSaveDisabled(true); });
      if (this.copyUrlBtn) this.copyUrlBtn.addEventListener('click', async () => {
        const text = this.previewUrlEl?.textContent || '';
        await copyToClipboard(text);
      });
      if (this.copyPlaceholderBtn) this.copyPlaceholderBtn.addEventListener('click', async () => {
        await copyToClipboard(PLACEHOLDER_TOKEN);
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.modal && !this.modal.hidden) this._closeModal();
      });
      if (this.deleteCancelBtn) this.deleteCancelBtn.addEventListener('click', () => { this._deletingInstance = false; this._hideDeleteModal(); });
      if (this.deleteConfirmBtn) this.deleteConfirmBtn.addEventListener('click', async () => {
        if (!this._deletingInstance) return;
        try {
          await this.store.setInstance(null);
          await this.render();
        } catch (_) { /* ignore */ }
        finally { this._deletingInstance = false; this._hideDeleteModal(); }
      });
      if (this.placeholderEl) this.placeholderEl.textContent = PLACEHOLDER_TOKEN;
      this._updatePreview();
      this._updateSaveDisabled(false);
    }

    async render() {
      try {
        const inst = await this.store.getInstance();
        this._currentInstance = this._normalizeInstance(inst);
        const hasInst = !!(this._currentInstance && this._currentInstance.name && this._currentInstance.url);
        const locked = !!(this._currentInstance && this._currentInstance.__locked);
        if (this.table) this.table.style.display = hasInst ? '' : 'none';
        if (this.addBtn) this.addBtn.disabled = !!hasInst;
        if (!hasInst) {
          if (this.tbody) this.tbody.innerHTML = '';
          return;
        }
        const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
        const prefix = esc(this._currentInstance.prefix || this._currentInstance.name || '');
        const regionKey = this._currentInstance.region;
        const region = esc(regionKey ? (REGION_LABELS[regionKey] || regionKey) : '');
        const url = esc(this._currentInstance.url || '');
        const placeholderSource = this._currentInstance.prefix || this._currentInstance.name || '';
        const placeholderValue = placeholderSource ? `= ${esc(placeholderSource)}` : '= —';
        const detailsHtml = `
          <div class="inst-row-url">${url}</div>
          <div class="inst-row-placeholder">Placeholder&nbsp;<code>${PLACEHOLDER_TOKEN}</code><span class="placeholder-value">${placeholderValue}</span></div>
        `;
        const nameHtml = `
          <div class="inst-row-name">${prefix || '—'}</div>
          <div class="inst-row-region">${region ? `Region: ${region}` : ''}</div>
        `;
        if (this.tbody) {
          if (locked) {
            this.tbody.innerHTML = `
          <tr data-locked="true">
            <td>${nameHtml}</td>
            <td>${detailsHtml}</td>
            <td class="actions locked" title="Managed by your organization">
              <span class="lock-indicator">
                <span class="mask-icon icon-lock" aria-hidden="true"></span>
                <span class="sr-only">Managed by your organization</span>
              </span>
            </td>
          </tr>`;
          } else {
            this.tbody.innerHTML = `
          <tr>
            <td>${nameHtml}</td>
            <td>${detailsHtml}</td>
            <td class="actions">
              <button class="icon-btn inst-edit" type="button" title="Edit" aria-label="Edit"><span class="mask-icon icon-edit" aria-hidden="true"></span></button>
              <button class="icon-btn inst-delete" type="button" title="Delete" aria-label="Delete"><span class="mask-icon icon-delete" aria-hidden="true"></span></button>
            </td>
          </tr>`;
          }
        }
      } catch (_) {
        if (this.table) this.table.style.display = 'none';
        if (this.addBtn) this.addBtn.disabled = false;
      }
    }

    _onTableClick(ev) {
      const btn = ev.target && ev.target.closest && ev.target.closest('button.icon-btn');
      if (!btn) return;
      this._pendingAnchor = btn;
      if (btn.classList.contains('inst-edit')) {
        (async () => {
          try {
            const inst = await this.store.getInstance();
            this._openEdit(inst || {}, btn);
          } catch (_) { this._openEdit({}, btn); }
        })();
        return;
      }
      if (btn.classList.contains('inst-delete')) {
        this._confirmDelete(btn);
      }
    }

    _openEdit(inst, anchor) {
      if (!this.modal) return;
      const normalized = this._normalizeInstance(inst);
      const prefix = normalized.prefix || normalized.name || '';
      const region = normalized.region || 'eu';
      if (this.prefixInput) this.prefixInput.value = prefix;
      if (this.regionSelect) this.regionSelect.value = isValidRegion(region) ? region : 'us';
      this._updatePreview();
      this._updateSaveDisabled(false);
      this._positionDialogAtAnchor(this.dialog, anchor || this.section);
      this.modal.hidden = false;
      setTimeout(() => { try { this.prefixInput?.focus(); } catch (_) {} }, 0);
    }

    _closeModal() {
      try { if (this.modal) this.modal.hidden = true; } catch (_) {}
    }

    async _onSave() {
      const prefixRaw = this.prefixInput?.value || '';
      const prefix = sanitizePrefix(prefixRaw);
      const region = String(this.regionSelect?.value || '').toLowerCase();
      const prefixOk = isValidPrefix(prefix);
      const regionOk = isValidRegion(region);
      if (this.prefixInput) this.prefixInput.classList.toggle('invalid', !prefixOk);
      if (this.prefixErr) this.prefixErr.hidden = prefixOk;
      if (this.saveBtn) this.saveBtn.disabled = !(prefixOk && regionOk);
      if (!(prefixOk && regionOk)) return;
      const url = buildUrlFromParts(prefix, region);
      const payload = { name: prefix, url, prefix, region };
      try {
        await this.store.setInstance(payload);
        await this.render();
      } catch (_) { /* ignore */ }
      finally { this._closeModal(); }
    }

    _updateSaveDisabled(touched) {
      const prefixRaw = this.prefixInput?.value || '';
      const prefix = sanitizePrefix(prefixRaw);
      const region = String(this.regionSelect?.value || '').toLowerCase();
      const prefixOk = isValidPrefix(prefix);
      const regionOk = isValidRegion(region);
      if (touched && this.prefixInput) this.prefixInput.classList.toggle('invalid', !prefixOk);
      if (this.prefixErr) this.prefixErr.hidden = prefixOk;
      if (this.saveBtn) this.saveBtn.disabled = !(prefixOk && regionOk);
    }

    _updatePreview() {
      const prefixRaw = this.prefixInput?.value || '';
      const prefix = sanitizePrefix(prefixRaw);
      const region = String(this.regionSelect?.value || '').toLowerCase();
      const preview = buildUrlFromParts(prefix, region) || `https://${prefix || '<tenant>'}.${region || '<region>'}.nexthink.cloud`;
      if (this.previewUrlEl) this.previewUrlEl.textContent = preview;
      this._updatePlaceholderValue(prefix);
    }

    _confirmDelete(anchor) {
      if (!this.deleteModal) return;
      this._deletingInstance = true;
      try { if (this.deleteSummary) this.deleteSummary.textContent = 'Delete instance configuration?'; } catch (_) {}
      this._positionDialogAtAnchor(this.deleteDialog, anchor);
      this.deleteModal.hidden = false;
    }

    _hideDeleteModal() {
      try { if (this.deleteModal) this.deleteModal.hidden = true; } catch (_) {}
    }

    _positionDialogAtAnchor(dialog, anchor) {
      try {
        if (!dialog) return;
        const rect = (anchor && anchor.getBoundingClientRect) ? anchor.getBoundingClientRect() : (this.section?.getBoundingClientRect?.() || { left: 16, top: 16, width: 0, height: 0 });
        const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
        const vh = window.innerHeight || document.documentElement.clientHeight || 768;
        const approxW = 480, approxH = 220;
        let left = rect.left - approxW - 12;
        if (left < 16) left = rect.right + 12;
        left = Math.max(16, Math.min(vw - approxW - 16, left));
        let top = rect.top + (rect.height - approxH) / 2;
        if (top < 16) top = 16;
        if (top + approxH > vh - 16) top = Math.max(16, vh - approxH - 16);
        dialog.style.position = 'fixed';
        dialog.style.left = `${Math.round(left)}px`;
        dialog.style.top = `${Math.round(top)}px`;
      } catch (_) { /* ignore */ }
    }

    _normalizeInstance(inst) {
      if (!inst || typeof inst !== 'object') return {};
      const clone = { ...inst };
      clone.prefix = sanitizePrefix(clone.prefix || clone.name || derivePrefixFromUrl(clone.url));
      if (!clone.name && clone.prefix) clone.name = clone.prefix;
      const region = String(clone.region || deriveRegionFromUrl(clone.url) || '').toLowerCase();
      if (isValidRegion(region)) clone.region = region;
      const url = String(clone.url || '').trim();
      if (!url && clone.prefix && clone.region) clone.url = buildUrlFromParts(clone.prefix, clone.region);
      return clone;
    }

    _updatePlaceholderValue(prefix) {
      if (!this.placeholderValueEl) return;
      const sanitized = sanitizePrefix(prefix);
      this.placeholderValueEl.textContent = sanitized ? `= ${sanitized}` : '= —';
    }
  }

  global.NqaInstanceSection = NqaInstanceSection;
})(window);
