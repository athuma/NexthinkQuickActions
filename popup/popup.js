// Build device search URL from configured instance + fixed path
const DEVICE_SEARCH_PATH = '/sup/device/search/{query}';
function buildUrlFromInstance(instUrl, name) {
  const base = String(instUrl || '').replace(/\/$/, '');
  const q = encodeURIComponent(String(name || '').trim());
  return (base + DEVICE_SEARCH_PATH).replace('{query}', q);
}

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('deviceInput');
  const btn = document.getElementById('openBtn');
  const form = document.getElementById('snForm');
  const hint = document.getElementById('hint');
  const settingsBtn = document.getElementById('settingsBtn');
  const noInst = document.getElementById('noInst');
  const addInstBtn = document.getElementById('addInstBtn');

  const updateState = () => {
    const v = input.value.trim();
    btn.disabled = v.length === 0;
  };

  input.addEventListener('input', updateState);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  const openOptionsPage = () => {
    try {
      if (chrome?.runtime?.openOptionsPage) return chrome.runtime.openOptionsPage();
    } catch (_) {}
    try {
      const url = chrome?.runtime?.getURL ? chrome.runtime.getURL('option/options.html') : 'option/options.html';
      if (chrome?.tabs?.create) chrome.tabs.create({ url }); else window.open(url, '_blank');
    } catch (_) {}
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v) return;
    try {
      const store = new window.NqaConfigStore();
      const inst = await store.getInstance();
      const url = inst && inst.url ? buildUrlFromInstance(inst.url, v) : null;
      if (!url) { openOptionsPage(); return; }
      try { chrome?.tabs?.create ? chrome.tabs.create({ url }) : window.open(url, '_blank', 'noopener,noreferrer'); }
      catch (_) { window.open(url, '_blank', 'noopener,noreferrer'); }
      window.close();
    } catch (_) {
      openOptionsPage();
    }
  });

  // Prefill from selection if accessible (best effort)
  try {
    chrome.tabs && chrome.scripting && chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      // noop; keeping room for later enhancement
    });
  } catch (_) {}

  // Default: keep input disabled until instance check completes
  try { input.disabled = true; btn.disabled = true; } catch (_) {}

  // UI state based on configured instance (and react to storage changes)
  const applyUiForInstance = async () => {
    try {
      const store = new window.NqaConfigStore();
      const inst = await store.getInstance();
      const hasInst = !!(inst && inst.url);
      if (hasInst) {
        // Show form, hide add-instance button (defensively toggle both hidden and style)
        form.hidden = false;
        form.style.display = '';
        noInst.hidden = true;
        noInst.style.display = 'none';
        input.disabled = false;
        btn.disabled = true; // until typed
        if (hint) hint.hidden = false;
        input.focus();
        updateState();
      } else {
        // Hide form, show add-instance button
        form.hidden = true;
        form.style.display = 'none';
        noInst.hidden = false;
        noInst.style.display = 'flex';
        input.disabled = true;
        btn.disabled = true;
        if (hint) hint.hidden = true;
      }
    } catch (_) {
      form.hidden = true;
      form.style.display = 'none';
      noInst.hidden = false;
      noInst.style.display = 'flex';
      input.disabled = true;
      btn.disabled = true;
      if (hint) hint.hidden = true;
    }
  };

  applyUiForInstance();
  try {
    chrome?.storage?.onChanged?.addListener((changes, area) => {
      if (area === 'sync' && changes && Object.prototype.hasOwnProperty.call(changes, 'instance')) {
        // React when instance is set/cleared from options page
        applyUiForInstance();
      }
    });
  } catch (_) {}

  // Open options page
  settingsBtn?.addEventListener('click', (e) => { e.preventDefault(); openOptionsPage(); });
  addInstBtn?.addEventListener('click', (e) => { e.preventDefault(); openOptionsPage(); });
});
