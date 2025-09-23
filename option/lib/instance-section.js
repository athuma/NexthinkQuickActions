/* NQA Nexthink Instance section controller */
(function(global){
  'use strict';

  class NqaInstanceSection {
    constructor(opts){
      this.opts = opts || {};
      const els = this.opts.els || {};
      this.section = els.section || null;
      this.table = els.table || null;
      this.tbody = els.tbody || null;
      this.addBtn = els.addBtn || null;
      this.modal = els.modal || null;
      this.dialog = els.dialog || null;
      this.nameInput = els.nameInput || null;
      this.urlInput = els.urlInput || null;
      this.nameErr = els.nameErr || null;
      this.urlErr = els.urlErr || null;
      this.cancelBtn = els.cancelBtn || null;
      this.saveBtn = els.saveBtn || null;
      // Reuse shared delete modal
      this.deleteModal = els.deleteModal || null;
      this.deleteDialog = els.deleteDialog || null;
      this.deleteSummary = els.deleteSummary || null;
      this.deleteCancelBtn = els.deleteCancelBtn || null;
      this.deleteConfirmBtn = els.deleteConfirmBtn || null;

      this.store = this.opts.store || null;
      this.isValidInstanceUrl = this.opts.isValidInstanceUrl || this._isValidInstanceUrl;

      this._pendingAnchor = null;
      this._deletingInstance = false;
    }

    attach(){
      if (this.addBtn) this.addBtn.addEventListener('click', () => this._openEdit({ name: '', url: '' }, this.addBtn));
      if (this.tbody) this.tbody.addEventListener('click', (ev) => this._onTableClick(ev));
      if (this.cancelBtn) this.cancelBtn.addEventListener('click', () => this._closeModal());
      if (this.saveBtn) this.saveBtn.addEventListener('click', () => this._onSave());
      if (this.nameInput) this.nameInput.addEventListener('input', () => this._updateSaveDisabled(true));
      if (this.urlInput) this.urlInput.addEventListener('input', () => this._updateSaveDisabled(true));
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.modal && !this.modal.hidden) this._closeModal();
      });
      if (this.deleteCancelBtn) this.deleteCancelBtn.addEventListener('click', () => { this._deletingInstance = false; this._hideDeleteModal(); });
      if (this.deleteConfirmBtn) this.deleteConfirmBtn.addEventListener('click', async () => {
        if (!this._deletingInstance) return;
        try {
          await this.store.setInstance(null);
          await this.render();
        } catch(_){}
        finally { this._deletingInstance = false; this._hideDeleteModal(); }
      });
    }

    async render(){
      try {
        const inst = await this.store.getInstance();
        const hasInst = !!(inst && inst.name && inst.url);
        if (this.table) this.table.style.display = hasInst ? '' : 'none';
        if (this.addBtn) this.addBtn.disabled = !!hasInst;
        if (!hasInst) return;
        const esc = (s) => String(s ?? '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
        const name = esc(inst.name);
        const url = esc(inst.url);
        if (this.tbody) this.tbody.innerHTML = `
          <tr>
            <td>${name}</td>
            <td><div style="word-wrap:break-word;">${url}</div></td>
            <td class="actions">
              <button class="icon-btn inst-edit" type="button" title="Edit" aria-label="Edit"><span class="mask-icon icon-edit" aria-hidden="true"></span></button>
              <button class="icon-btn inst-delete" type="button" title="Delete" aria-label="Delete"><span class="mask-icon icon-delete" aria-hidden="true"></span></button>
            </td>
          </tr>`;
      } catch(_) {
        if (this.table) this.table.style.display = 'none';
        if (this.addBtn) this.addBtn.disabled = false;
      }
    }

    _onTableClick(ev){
      const btn = ev.target && ev.target.closest && ev.target.closest('button.icon-btn');
      if (!btn) return;
      this._pendingAnchor = btn;
      if (btn.classList.contains('inst-edit')) {
        (async () => {
          try {
            const inst = await this.store.getInstance();
            this._openEdit(inst || { name: '', url: '' }, btn);
          } catch(_) { this._openEdit({ name: '', url: '' }, btn); }
        })();
        return;
      }
      if (btn.classList.contains('inst-delete')) {
        this._confirmDelete(btn);
        return;
      }
    }

    _openEdit(inst, anchor){
      if (!this.modal) return;
      if (this.nameInput) this.nameInput.value = String(inst?.name || '');
      if (this.urlInput) this.urlInput.value = String(inst?.url || '');
      this._updateSaveDisabled(false);
      this._positionDialogAtAnchor(this.dialog, anchor || this.section);
      this.modal.hidden = false;
      setTimeout(() => { try { this.nameInput?.focus(); } catch(_){} }, 0);
    }

    _closeModal(){
      try { if (this.modal) this.modal.hidden = true; } catch(_){}
    }

    async _onSave(){
      const nameV = (this.nameInput?.value || '').trim();
      const urlV = (this.urlInput?.value || '').trim();
      const nameOk = !!nameV;
      const urlOk = this.isValidInstanceUrl(urlV);
      if (this.nameInput) this.nameInput.classList.toggle('invalid', !nameOk);
      if (this.urlInput) this.urlInput.classList.toggle('invalid', !urlOk);
      if (this.saveBtn) this.saveBtn.disabled = !(nameOk && urlOk);
      if (!nameOk || !urlOk) return;
      try {
        await this.store.setInstance({ name: nameV, url: urlV });
        await this.render();
      } catch(_){}
      finally { this._closeModal(); }
    }

    _updateSaveDisabled(touched){
      const nameV = (this.nameInput?.value || '').trim();
      const urlV = (this.urlInput?.value || '').trim();
      const nameOk = !!nameV;
      const urlOk = this.isValidInstanceUrl(urlV);
      if (touched) {
        if (this.nameInput) this.nameInput.classList.toggle('invalid', !nameOk);
        if (this.urlInput) this.urlInput.classList.toggle('invalid', !urlOk);
      }
      if (this.nameErr) this.nameErr.hidden = true;
      if (this.urlErr) this.urlErr.hidden = true;
      if (this.saveBtn) this.saveBtn.disabled = !(nameOk && urlOk);
    }

    _confirmDelete(anchor){
      if (!this.deleteModal) return;
      this._deletingInstance = true;
      try { if (this.deleteSummary) this.deleteSummary.textContent = 'Delete instance configuration?'; } catch(_){}
      this._positionDialogAtAnchor(this.deleteDialog, anchor);
      this.deleteModal.hidden = false;
    }

    _hideDeleteModal(){
      try { if (this.deleteModal) this.deleteModal.hidden = true; } catch(_){}
    }

    _positionDialogAtAnchor(dialog, anchor){
      try {
        if (!dialog) return;
        const rect = (anchor && anchor.getBoundingClientRect) ? anchor.getBoundingClientRect() : (this.section?.getBoundingClientRect?.() || {left:16,top:16,width:0,height:0});
        const vw = window.innerWidth || document.documentElement.clientWidth || 1024;
        const vh = window.innerHeight || document.documentElement.clientHeight || 768;
        const approxW = 420, approxH = 160;
        let left = rect.left - approxW - 12; if (left < 16) left = rect.right + 12;
        left = Math.max(16, Math.min(vw - approxW - 16, left));
        let top = rect.top + (rect.height - approxH) / 2; if (top < 16) top = 16; if (top + approxH > vh - 16) top = Math.max(16, vh - approxH - 16);
        dialog.style.position = 'fixed';
        dialog.style.left = `${Math.round(left)}px`;
        dialog.style.top = `${Math.round(top)}px`;
      } catch(_){}
    }

    _isValidInstanceUrl(str){
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
      } catch(_) { return false; }
    }
  }

  global.NqaInstanceSection = NqaInstanceSection;
})(window);

