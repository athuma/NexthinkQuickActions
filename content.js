// Configuration
const INJECTED_ATTR = "data-sn-injected-item";
const INVESTIGATION_COLUMN_SELECTOR = 'table[role="presentation"] th[rowspan="1"] div[class*="LinesEllipsis"]';
let currentSubmenuTrigger = null; // track open submenu trigger for toggle
let cleanupFn = null; // cleanup for global listeners

// Returns true if this kebab button belongs to the "Name" column.
// Primary check: aria-label usually contains "column Name" (e.g., "Actions for row 1, column Name")
// or "column Device -> Name" in some tables.
// Fallback: detect if the same cell holds the device link (a[href^="/sup/device/"]).
function isNameColumnButton(btn) {
    const aria = btn.getAttribute("aria-label") || "";
    if (/\bcolumn(\s+Device\s+->)?\s+Name\b/i.test(aria)) return true;
    // Drop obfuscated class fallback; rely on semantic cells only
    const cell = btn.closest("td, [role='cell']");
    return !!(cell && cell.querySelector('a[href^="/sup/device/"]'));
}

// Heuristic (simplified): derive the device name from the same table row as the kebab button.
function findDeviceNameFromButton(btn) {
    // Locate the parent cell, then the row (fallback directly from the button if needed)
    const cell = btn.closest("td, [role='cell']");
    const row  = (cell && cell.closest("tr, [role='row']")) || btn.closest("tr, [role='row']");
    if (!row) return null;

    // 1) Best case: explicit device link inside the row
    let link = row.querySelector('a[href^="/sup/device/"]');

    // 2) Fallback: first link found in the first cell of the row
    if (!link) {
        const firstCell = row.querySelector("td, [role='cell']");
        link = firstCell ? firstCell.querySelector("a") : null;
    }

    // Extract and trim text content
    const text = (link?.textContent || "").trim();
    return text || null;
}

// Build a native-like menu entry (container -> contents -> anchor) using classes from an existing item
function buildAnchoredMenuItem(container, label, href, onClick) {
    // Find a reference native menuitem (<a role="menuitem"> or <span role="menuitem">)
    const ref = container.querySelector('a[role="menuitem"], span[role="menuitem"]');
    if (!ref) return null;

    // Reference wrappers
    const refContents = ref.parentElement; // usually the StyledContents div
    const refContainer = ref.closest('[class*="StyledActionMenuItemContainer"]');

    // Create outer container
    const outer = document.createElement("div");
    if (refContainer) {
        refContainer.classList.forEach((cls) => {
            try {
                if (cls) outer.classList.add(cls);
            } catch (_) { }
        });
    }
    outer.setAttribute(INJECTED_ATTR, "1");

    // Create contents wrapper
    const contents = document.createElement("div");
    if (refContents) {
        refContents.classList.forEach((cls) => {
            try {
                if (cls) contents.classList.add(cls);
            } catch (_) { }
        });
    }

    // Create anchor that looks like the native one
    const a = document.createElement("a");
    a.setAttribute("role", "menuitem");
    a.setAttribute("tabindex", "-1");
    a.setAttribute("data-tabindex", "0");
    a.setAttribute("rel", "noreferrer noopener");
    a.setAttribute("target", "_blank");
    a.href = href;

    // Copy classes from the reference item (text-only or icon+text)
    ref.classList.forEach((cls) => {
        try {
            if (cls) a.classList.add(cls);
        } catch (_) { }
    });

    // Text node structure similar to native (<span>Text</span>)
    const span = document.createElement("span");
    span.textContent = label;
    a.appendChild(span);

    if (onClick) {
        a.addEventListener("click", (e) => {
            // Let navigation occur; still avoid bubbling to keep menu behavior consistent
            e.stopPropagation();
        });
    }

    contents.appendChild(a);
    outer.appendChild(contents);
    return outer;
}

// Build a separator similar to native menus.
function buildMenuSeparator(container) {
    try {
        // Prefer a native group-separator (not the right-side "StyledExtra" separator used inside items)
        let native = null;
        // 1) Direct child of the menu container with role=separator
        for (const el of Array.from(container.children)) {
            if (el && el.getAttribute && el.getAttribute('role') === 'separator') {
                const cls = String(el.className || '');
                if (!/StyledExtra|Extra_/i.test(cls)) { native = el; break; }
            }
        }
        // 2) Scoped lookup for known separator classes
        if (!native) {
            native = container.querySelector('div[role="separator"][class*="ActionMenuSeparator"], div[role="separator"][class*="SeparatorLi"]');
        }
        // 3) Global fallback
        if (!native) {
            native = document.querySelector('div[role="separator"][class*="ActionMenuSeparator"], div[role="separator"][class*="SeparatorLi"]');
        }

        const sep = document.createElement('div');
        sep.setAttribute('role', 'separator');
        sep.setAttribute(INJECTED_ATTR, '1');

        // Minimal default styling to ensure visibility even if class copy fails
        const ensureLine = (bgColor) => {
            const line = document.createElement('div');
            line.style.height = '1px';
            line.style.margin = '6px 0';
            line.style.backgroundColor = bgColor || 'rgba(0,0,0,0.15)';
            sep.appendChild(line);
        };

        if (native) {
            // Copy outer classes if available
            try { native.classList.forEach((cls) => { if (cls) sep.classList.add(cls); }); } catch (_) {}
            // Try to clone the inner line look
            let nativeLine = native.querySelector('div[class*="SeparatorLine"], div');
            if (nativeLine) {
                const line = document.createElement('div');
                try { nativeLine.classList.forEach((cls) => { if (cls) line.classList.add(cls); }); } catch (_) {}
                // Mirror computed style to be safe
                try {
                    const cs = window.getComputedStyle(nativeLine);
                    if (cs) {
                        line.style.height = cs.height || '';
                        line.style.margin = cs.margin || '';
                        line.style.backgroundColor = cs.backgroundColor || '';
                        line.style.opacity = cs.opacity || '';
                    }
                } catch (_) {}
                sep.appendChild(line);
            } else {
                ensureLine();
            }
        } else {
            ensureLine();
        }

        return sep;
    } catch (_) {
        return null;
    }
}

// Return only menu entries whose URL contains the placeholder for the current column
// Current column key is read from window.nqaPlaceHolder.columnName (already normalized);
// Device View falls back to a fixed set of device/user placeholders.
// Example: keeps items where url includes `{devices_full_name}` if columnName is `devices_full_name`.
function getMenuFilteredByCurrentColumn(callback) {
    try {
        const holder = window.nqaPlaceHolder || {};
        const table_name = String(holder?.table_name || '').toLowerCase();
        const columnName = holder?.columnName || '';

        const tokens = [];
        if (table_name === 'device_view') {
            tokens.push('devices_name', 'login_name', 'full_name', 'ad_name');
        } else if (columnName) {
            tokens.push(String(columnName));
        }

        const normalizedTokens = tokens
            .map((t) => String(t || '').trim().toLowerCase())
            .filter(Boolean);

        if (!normalizedTokens.length) { callback([]); return; }

        const store = new window.NqaConfigStore();
        store.getMenu()
            .then((menu) => {
                const filtered = (menu || []).filter((it) => {
                    const url = it?.url ?? '';
                    const matches = url.match(/\{([^}]+)\}/g) || [];
                    if (!matches.length) return false;
                    return matches.some((rawPlaceholder) => {
                        const inner = rawPlaceholder.slice(1, -1);
                        const pattern = inner.replace(/\*/g, '.*');
                        const re = new RegExp('^' + pattern + '$', 'i');
                        return normalizedTokens.some((token) => re.test(token));
                    });
                });
                callback(filtered);
            })
            .catch(() => callback([]));
    } catch (_) { callback([]); }
}

// Build submenu items for a given device name using stored configs.
// Supports any placeholders of the form {name} and replaces them with values
// from window.nqaPlaceHolder.rawValues if available.
// Remove any line breaks from the URL as the edition is a textarea.
function buildActionItemsForDevice(callback) {
    // Get suitable menu entries for the current column
    getMenuFilteredByCurrentColumn((cfgs) => {
        const items = [];
        const raw = window?.nqaPlaceHolder?.rawValues ?? {};
        if (Array.isArray(cfgs) && cfgs.length) {
            for (const it of cfgs) {
                const label = (it?.name || it?.label) ?? '';
                let url = it?.url ?? '';
                if (!label || !url) continue;
                try {
                    // Remove any line breaks from the URL as the edition is a textarea
                    url = url.replace(/[\r\n]+/g, '');
                    // Replaces all {placeholder} with the corresponding value in window.nqaplaceholder
                    url = url.replace(/\{([^}]+)\}/g, (match, placeholderPattern) => {
                        //1. Transform the URL placeholder (ex: "*full_name") into regexp
                        const regex = new RegExp('^' + placeholderPattern.replace(/\*/g, '.*') + '$', 'i');
                        // 2. Search for a corresponding key in Rawvalues
                        const matchingKey = Object.keys(raw).find(rawKey => regex.test(rawKey));
                        // 3. return the value in case of match (ex: "results_ad_full_name") for "*full_name"
                        if (matchingKey) return raw[matchingKey];
                        // 4. Otherwise, we leave the placeholder as it is
                        return match;
                    });
                } catch (_) { continue; }
                items.push({ label, href: url });
            }
        }
        callback(items);
    });
}

// Find classes from an existing submenu trigger (one that shows an angle-right icon)
function findSubmenuReference(container) {
    const items = Array.from(container.querySelectorAll('[role="menuitem"]'));
    let fallback = null;
    for (const mi of items) {
        // Prepare a generic fallback based on the first native item
        if (!fallback) {
            fallback = {
                item: mi,
                container: mi.closest('[class*="StyledActionMenuItemContainer"]'),
                contents: mi.parentElement,
                extra: null
            };
        }
        // Look for a stable FontAwesome angle-right chevron near this item
        const scope = mi.parentElement?.parentElement || mi.parentElement || container;
        const icon = scope?.querySelector('[data-icon="angle-right"], .fa-angle-right, svg[data-icon="angle-right"]');
        if (icon) {
            const extra = icon.closest('[aria-hidden="true"][role="separator"]') || icon.parentElement;
            return {
                item: mi,
                container: mi.closest('[class*="StyledActionMenuItemContainer"]'),
                contents: mi.parentElement,
                extra: extra || null
            };
        }
    }
    // No explicit chevron found: return the generic reference (classes may still be copied from item/container)
    return fallback;
}

// Build a native-like submenu trigger with left icon and right chevron
function buildSubmenuTrigger(container, label, iconSpec) {
    // Try to adopt classes from an existing submenu item
    const ref = findSubmenuReference(container);

    const outer = document.createElement('div');
    outer.setAttribute(INJECTED_ATTR, '1');
    if (ref?.container) ref.container.classList.forEach(c => { try { if (c) outer.classList.add(c); } catch (_) { } });

    const contents = document.createElement('div');
    if (ref?.contents) ref.contents.classList.forEach(c => { try { if (c) contents.classList.add(c); } catch (_) { } });

    const trigger = document.createElement('span');
    trigger.setAttribute('role', 'menuitem');
    trigger.setAttribute('tabindex', '-1');
    trigger.setAttribute('data-tabindex', '0');
    trigger.setAttribute('aria-label', label);
    if (ref?.item) ref.item.classList.forEach(c => { try { if (c) trigger.classList.add(c); } catch (_) { } });

    // Inner span holding left icon + label
    const inner = document.createElement('span');

    // Left icon (SVG Element) at 16px
    if (iconSpec && typeof iconSpec === 'object') {
        // Accept an Element (expected SVGElement) and normalize
        const holder = document.createElement('span');
        holder.style.display = 'inline-flex';
        holder.style.width = '16px';
        holder.style.height = '16px';
        holder.style.marginRight = '4px';
        holder.style.verticalAlign = 'middle';
        let svgEl = null;
        try {
            let el = null;
            if (iconSpec instanceof Element) {
                if (iconSpec.tagName && iconSpec.tagName.toLowerCase() === 'svg') {
                    el = iconSpec.cloneNode(true);
                } else if (iconSpec.querySelector) {
                    const found = iconSpec.querySelector('svg');
                    el = (found ? found.cloneNode(true) : iconSpec.cloneNode(true));
                }
            }
            if (el) {
                holder.appendChild(el);
                svgEl = (el.tagName && el.tagName.toLowerCase() === 'svg') ? el : holder.querySelector('svg');
            }
        } catch (_) { svgEl = null; }
        if (svgEl) {
            svgEl.setAttribute('width', '16');
            svgEl.setAttribute('height', '16');
            svgEl.style.width = '16px';
            svgEl.style.height = '16px';
            svgEl.style.display = 'block';
            try {
                let refIcon = null;
                if (ref?.item) refIcon = ref.item.querySelector('svg');
                if (!refIcon) refIcon = container.querySelector('[role="menuitem"] svg');
                if (refIcon) {
                    refIcon.classList.forEach(c => { if (c) svgEl.classList.add(c); });
                    ['aria-hidden', 'focusable', 'role'].forEach(attr => {
                        const val = refIcon.getAttribute(attr);
                        if (val !== null) svgEl.setAttribute(attr, val);
                    });
                }
            } catch (_) { /* keep minimal styling if no reference icon */ }
        }
        inner.appendChild(holder);
    }

    const text = document.createTextNode(label);
    inner.appendChild(text);
    trigger.appendChild(inner);

    // Right side chevron container
    const extra = document.createElement('div');
    extra.setAttribute('aria-hidden', 'true');
    extra.setAttribute('role', 'separator');
    if (ref?.extra) ref.extra.classList.forEach(c => { try { if (c) extra.classList.add(c); } catch (_) { } });
    // Chevron SVG (self-contained, no obfuscated classes)
    try {
        const chevron = buildChevronRightIconSvg();
        extra.appendChild(chevron);
    } catch (_) { /* keep minimal container if SVG fails */ }

    contents.appendChild(trigger);
    contents.appendChild(extra);
    outer.appendChild(contents);
    return { outer, trigger };
}

// Show a custom submenu to the right of a trigger element
function showCustomSubmenu(triggerEl, items) {
    // Close any existing custom submenu
    hideCustomSubmenu();

    // Anchors for positioning
    const itemContainer = triggerEl.closest('[class*="StyledActionMenuItemContainer"]') || triggerEl;
    const rootMenu = triggerEl.closest('[role="menu"]');
    if (!rootMenu) return;

    const itemRect = itemContainer.getBoundingClientRect();
    const rootMenuRect = rootMenu.getBoundingClientRect();

    // Try to clone native submenu wrappers/classes for perfect alignment & radius
    const nativeSubWrap = document.querySelector('[class*="StyledActionSubMenu_"]');
    const nativeInnerMenu = nativeSubWrap?.querySelector('[role="menu"]');

    // Outer wrapper (StyledActionSubMenu_*)
    const outerWrap = document.createElement('div');
    outerWrap.id = 'nca-custom-submenu-wrap';
    if (nativeSubWrap?.classList) {
        nativeSubWrap.classList.forEach(c => { try { if (c) outerWrap.classList.add(c); } catch (_) { } });
    }
    // Position like native: flush to the right edge of the root menu, aligned to the triggering row
    Object.assign(outerWrap.style, {
        position: 'fixed',
        top: `${Math.round(itemRect.top)}px`,
        left: `${Math.round(rootMenuRect.right)}px`,
        transform: `translate(-12px, -2px)`,
        zIndex: 2147483647,
    });

    // Native submenu usually has an extra anonymous div wrapper
    const midWrap = document.createElement('div');
    outerWrap.appendChild(midWrap);

    // Real menu node (StyledActionMenu_*)
    const menu = document.createElement('div');
    menu.id = 'nca-custom-submenu';
    menu.setAttribute('role', 'menu');
    if (nativeInnerMenu?.classList) {
        nativeInnerMenu.classList.forEach(c => { try { if (c) menu.classList.add(c); } catch (_) { } });
    } else if (rootMenu?.classList) {
        rootMenu.classList.forEach(c => { try { if (c) menu.classList.add(c); } catch (_) { } });
    }

    // Try to match rounded corners / shadow from the native submenu (or root menu as fallback)
    try {
        const refNode = nativeInnerMenu || rootMenu;
        const refCS = window.getComputedStyle(refNode);
        if (refCS) {
            const radius = refCS.borderRadius || '8px';
            const shadow = refCS.boxShadow && refCS.boxShadow !== 'none' ? refCS.boxShadow : '0 8px 24px rgba(0,0,0,0.12), 0 2px 4px rgba(0,0,0,0.08)';
            const bg = refCS.backgroundColor || '#fff';

            menu.style.borderRadius = radius;
            menu.style.backgroundColor = bg;
            menu.style.overflow = 'hidden';

            // Some themes place the shadow on the outer wrapper — mirror it there too
            outerWrap.style.boxShadow = shadow;
            // If native uses filter-based shadow, copy that as well
            const filt = refCS.filter;
            if (filt && filt !== 'none') outerWrap.style.filter = filt;
        }
    } catch (_) { }

    // Build items (anchors) similar to native using our anchored builder
    const refRoot = nativeInnerMenu || rootMenu || document;
    const container = document.createElement('div');
    items.forEach(it => {
        let item = buildAnchoredMenuItem(refRoot, it.label, it.href, null);
        if (item) {
            const anchor = item.querySelector('a[role="menuitem"]');
            if (anchor) {
                // Close our custom submenu right after the new tab is opened
                anchor.addEventListener('click', (e) => {
                    try { console.log('[NQA] submenu anchor click captured', { type: e.type }); } catch (_) {}
                    try { console.log('[NQA][bus] current placeholder:', window.nqaPlaceHolder); } catch (_) {}
                    try { e.preventDefault(); } catch (_) {}
                    try { e.stopPropagation(); } catch (_) {}
                    let url = '';
                    try { url = anchor.href || ''; } catch (_) { url = ''; }
                    try { console.log('[NQA] will open URL in new tab', url); } catch (_) {}
                    try {
                        if (url) window.open(url, '_blank', 'noopener,noreferrer');
                    } catch (_) {
                        try { console.warn('[NQA] window.open failed'); } catch (__) {}
                    }
                    setTimeout(() => { try { console.log('[NQA] closing custom submenu'); } catch(_){} hideCustomSubmenu(); }, 0);
                    // e.stopPropagation();
                    // setTimeout(() => hideCustomSubmenu(), 0);
                }, { capture: true });
            }
        }
        container.appendChild(item);
    });
    menu.appendChild(container);
    midWrap.appendChild(menu);

    document.body.appendChild(outerWrap);
    // Track trigger and reflect expanded state for a11y
    currentSubmenuTrigger = triggerEl;
    try { triggerEl.setAttribute('aria-expanded', 'true'); } catch (_) {}


    let rafId = null;
    const isRootMenuVisible = () => {
        try {
            if (!rootMenu || !rootMenu.isConnected) return false;
            const cs = window.getComputedStyle(rootMenu);
            if (!cs || cs.display === 'none' || cs.visibility === 'hidden') return false;
            const op = parseFloat(cs.opacity || '1');
            if (op === 0) return false;
            const r = rootMenu.getBoundingClientRect();
            return r && r.width > 0 && r.height > 0;
        } catch (_) { return false; }
    };

    let closeTimer = null; // debounce submenu close on transient invisibility
    const cancelCloseTimer = () => { try { if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; } } catch (_) {} };
    const scheduleClose = () => {
        if (closeTimer) return;
        closeTimer = setTimeout(() => {
            try {
                if (!isRootMenuVisible()) hideCustomSubmenu();
            } finally { closeTimer = null; }
        }, 150);
    };

    const reposition = () => {
        try {
            // If the root menu becomes temporarily invisible while scrolling, do not close immediately
            if (!isRootMenuVisible()) { scheduleClose(); rafId = null; return; }
            // If visible again, cancel any pending delayed close
            cancelCloseTimer();
            const itemRectNow = itemContainer.getBoundingClientRect();
            const rootMenuRectNow = rootMenu.getBoundingClientRect();
            outerWrap.style.top = `${Math.round(itemRectNow.top)}px`;
            outerWrap.style.left = `${Math.round(rootMenuRectNow.right)}px`;
        } catch (_) { /* ignore */ }
        rafId = null;
    };
    const onWinMove = () => {
        if (rafId == null) rafId = requestAnimationFrame(reposition);
    };
     // Close on click outside or Escape; and keep submenu aligned on scroll/resize
    const onDocClick = (e) => {
        if (!outerWrap.contains(e.target) && e.target !== triggerEl) hideCustomSubmenu();
    };
    const onKey = (e) => {
        const isEsc = e.key === 'Escape' || e.key === 'Esc' || e.code === 'Escape';
        if (isEsc) hideCustomSubmenu();
    };
    // If the native root menu gets detached/hidden, also close our submenu
    // Maybe not strictly necessary but safer to avoid floating menus
    const mo = new MutationObserver(() => {
       try { if (!rootMenu.isConnected || !isRootMenuVisible()) scheduleClose(); } catch (_) {}
    });
    setTimeout(() => {
        document.addEventListener('mousedown', onDocClick, { capture: true });
        // Right-click (context menu) should also close our submenu immediately
        const onContextMenu = (e) => { try { hideCustomSubmenu(); } catch (_) {} };
        document.addEventListener('contextmenu', onContextMenu, { capture: true });
        document.addEventListener('keydown', onKey, { capture: true });
        document.addEventListener('keyup', onKey, { capture: true });

        // (wheel/touchmove): realign during internal container scrolling
        // (without interfering with clicks, passive capture handlers)
        document.addEventListener('wheel', onWinMove, { capture: true, passive: true });
        document.addEventListener('touchmove', onWinMove, { capture: true, passive: true });
        // (scroll/resize): realign via window events only
        window.addEventListener('resize', onWinMove, { passive: true });
        window.addEventListener('scroll', onWinMove, { passive: true });
        try { mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] }); } catch (_) {}
    }, 0);
    // Store a cleanup to remove listeners when hiding
    if (cleanupFn) { try { cleanupFn(); } catch (_) {} }
    cleanupFn = () => {
        try { document.removeEventListener('mousedown', onDocClick, { capture: true }); } catch (_) {}
        try { document.removeEventListener('contextmenu', onContextMenu, { capture: true }); } catch (_) {}
        try { document.removeEventListener('keydown', onKey, { capture: true }); } catch (_) {}
        try { document.removeEventListener('keyup', onKey, { capture: true }); } catch (_) {}
        // Remove the listeners actually attached
        try { document.removeEventListener('wheel', onWinMove, { capture: true }); } catch (_) {}
        try { document.removeEventListener('touchmove', onWinMove, { capture: true }); } catch (_) {}
        try { window.removeEventListener('resize', onWinMove); } catch (_) {}
        try { window.removeEventListener('scroll', onWinMove); } catch (_) {}
        try { mo.disconnect(); } catch (_) {}
        try { if (rafId != null) cancelAnimationFrame(rafId); } catch (_) {}
        cancelCloseTimer();
    };
}

function hideCustomSubmenu() {
    const wrap = document.getElementById('nca-custom-submenu-wrap');
    if (wrap && wrap.parentNode) {
        wrap.parentNode.removeChild(wrap);
        try { if (cleanupFn) cleanupFn(); } catch (_) {}
        try { if (currentSubmenuTrigger) currentSubmenuTrigger.setAttribute('aria-expanded', 'false'); } catch (_) {}
        currentSubmenuTrigger = null;
        return;
    }
    const m = document.getElementById('nca-custom-submenu');
    if (m && m.parentNode) m.parentNode.removeChild(m);
    try { if (cleanupFn) cleanupFn(); } catch (_) {}
    try { if (currentSubmenuTrigger) currentSubmenuTrigger.setAttribute('aria-expanded', 'false'); } catch (_) {}
    currentSubmenuTrigger = null;
}

// Build the inline SVG icon used for the root "Quick Actions" menu entry
// Returns an SVGElement sized by the caller (buildSubmenuTrigger normalizes to 16px)
function buildQuickActionsIconSvg(twoStates) {
    // Backward compatibility: default to single-state icon
    const withTwoStates = !!twoStates;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('xmlns', svgNS);
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('role', 'img');

    const pathData = [
        'M640.413,554.743',
        'C640.413,554.743 323.582,908.073 252.487,986.743',
        'C300.191,933.956 202.138,1059.237 160.199,1038.401',
        'C138.305,1027.524 162.343,969.106 162.343,969.106',
        'C162.343,969.106 238.126,727.204 256.832,690.802',
        'C282.451,640.950 284.878,630.334 242.366,627.569',
        'C232.189,627.757 220.916,628.135 208.1000,627.923',
        'L91.473,627.923',
        'C-7.042,627.807 -7.057,591.495 81.914,502.524',
        'C81.914,502.524 398.685,149.131 469.766,70.447',
        'C422.071,123.243 520.105,-2.060 562.037,18.780',
        'C583.927,29.659 559.893,88.088 559.893,88.088',
        'C559.893,88.088 484.124,330.032 465.422,366.440',
        'C439.720,416.471 437.371,426.990 480.327,429.712',
        'C490.402,429.522 501.538,429.156 513.303,429.365',
        'L630.852,429.365',
        'C729.385,429.481 729.401,465.787 640.413,554.743',
        'Z'
    ].join(' ');

    if (withTwoStates) {
        // Inactive: outline stroke (current behavior)
        const gInactive = document.createElementNS(svgNS, 'g');
        gInactive.setAttribute('id', 'icon-inactive');
        gInactive.setAttribute('transform', 'translate(2.47,0) scale(0.015017) translate(7.057, 2.06)');
        const pathInactive = document.createElementNS(svgNS, 'path');
        pathInactive.setAttribute('fill', 'none');
        pathInactive.setAttribute('stroke', 'currentColor');
        pathInactive.setAttribute('stroke-width', '0.8');
        pathInactive.setAttribute('vector-effect', 'non-scaling-stroke');
        pathInactive.setAttribute('stroke-linecap', 'round');
        pathInactive.setAttribute('stroke-linejoin', 'round');
        pathInactive.setAttribute('d', pathData);
        gInactive.appendChild(pathInactive);

        // Active: filled shape
        const gActive = document.createElementNS(svgNS, 'g');
        gActive.setAttribute('id', 'icon-active');
        gActive.setAttribute('transform', 'translate(2.47,0) scale(0.015017) translate(7.057, 2.06)');
        const pathActive = document.createElementNS(svgNS, 'path');
        pathActive.setAttribute('fill', 'currentColor');
        pathActive.setAttribute('d', pathData);
        gActive.appendChild(pathActive);

        svg.appendChild(gInactive);
        svg.appendChild(gActive);
    } else {
        const g = document.createElementNS(svgNS, 'g');
        g.setAttribute('transform', 'translate(2.47,0) scale(0.015017) translate(7.057, 2.06)');
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('fill', 'none');
        // Inherit color from context to match menu theme (light/dark)
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '0.8');
        path.setAttribute('vector-effect', 'non-scaling-stroke');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('d', pathData);
        g.appendChild(path);
        svg.appendChild(g);
    }
    return svg;
}

// Build a 16px right-pointing chevron SVG used on submenu rows
function buildChevronRightIconSvg() {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('width', '16');
    svg.setAttribute('height', '16');
    svg.style.width = '16px';
    svg.style.height = '16px';
    svg.style.display = 'block';
    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('fill', 'currentColor');
    path.setAttribute(
        'd',
        'M6.57045 4.5C6.51546 4.5 6.45361 4.52806 6.41237 4.57014L6.06873 4.92084C6.02749 4.96293 6 5.02605 6 5.08216C6 5.13828 6.02749 5.2014 6.06873 5.24349L8.76976 8L6.06873 10.7565C6.02749 10.7986 6 10.8617 6 10.9178C6 10.981 6.02749 11.0371 6.06873 11.0792L6.41237 11.4299C6.45361 11.4719 6.51546 11.5 6.57045 11.5C6.62543 11.5 6.68729 11.4719 6.72852 11.4299L9.93127 8.16132C9.97251 8.11924 10 8.05611 10 8C10 7.94389 9.97251 7.88076 9.93127 7.83868L6.72852 4.57014C6.68728 4.52806 6.62543 4.5 6.57045 4.5Z'
    );
    svg.appendChild(path);
    return svg;
}

// Distinguish Investigations vs Device View based on aria-label pattern
function parseActionsFor(label) {
    if (!label) return null;
    const s = String(label).trim();
    // Captures either: row + column, or a single entity name
    const re = /^Actions?\s+for\s+(?:(?:row\s+(\d+),\s+column\s+(.+))|(.+))$/i;
    const m = re.exec(s);
    if (!m) return null;
    if (m[1] !== undefined) {
        return { type: 'row', row: Number(m[1]), column: (m[2] || '').trim() };
    }
    return { type: 'device', name: (m[3] || '').trim() };
}

// Returns the column name for the kebab button element (rootMenuEl)
function getNqaColumnNameFromKebab(rootMenuEl) {
    try {
        const btn = rootMenuEl && rootMenuEl.nodeType === 1 ? rootMenuEl : null;
        if (!btn) return '';

        // 1) Parse explicit column name from aria-label
        const aria = btn.getAttribute('aria-label') || '';
        if (aria) {
            const m = /column\s+(.+)$/i.exec(aria);
            if (m && m[1]) return normalizeColumnKey(m[1]);
        }

        // 2) Fallback: use aria-colindex on the owning cell and read header th with same index
        const cell = btn.closest('td, [role="gridcell"], [role="cell"]');
        if (!cell) return '';
        const colIndex = cell.getAttribute('aria-colindex');
        if (!colIndex) return '';
        let th = null;
        try {
            const table = cell.closest('table[role="presentation"]');
            th = table ? table.querySelector(`th[aria-colindex="${colIndex}"]`) : null;
        } catch(_) { th = null; }
        if (!th ) th = document.querySelector(`table[role="presentation"] th[aria-colindex="${colIndex}"]`);
        return (th && (th.textContent || '').trim()) || '';
    } catch (_) { return ''; }
}

// Unified resolver to determine device name for any root menu
function getDeviceNameForMenu(rootMenuEl) {
    // 1) Inspect aria-label to distinguish contexts
    try {
        const parsed = parseActionsFor(aria);
        if (parsed) {
            if (parsed.type === 'device' && parsed.name) {
                // Disambiguate device vs user menu on Device View: if header device title exists and
                // differs from the aria-label entity, treat this as the user menu and return header device.
                const headerDevice = getHeaderDeviceNameFromDeviceView();
                if (headerDevice && headerDevice !== parsed.name) return headerDevice;
                return parsed.name;
            }
            if (parsed.type === 'row') {
                // Investigations: resolve from controlling button/row
                const safeId = getSafeId(rootMenuEl);
                if (safeId) {
                    const btn = document.querySelector(`button[aria-controls="${safeId}"]`);
                    if (btn && isNameColumnButton(btn)) {
                        const fromBtn = findDeviceNameFromButton(btn);
                        if (fromBtn) return fromBtn;
                    }
                }
            }
        }
    } catch (_) { /* fallthrough */ }

    // 2) Fallback: find controlling kebab button and derive from its row
    try {
        const safeId = getSafeId(rootMenuEl);
        if (safeId) {
            const btn = document.querySelector(`button[aria-controls="${safeId}"]`);
            if (btn && isNameColumnButton(btn)) {
                const fromBtn = findDeviceNameFromButton(btn);
                if (fromBtn) return fromBtn;
            }
        }
    } catch (_) { /* ignore */ }

    // 3) Last resort on Device View: read device from header
    const headerDevice = getHeaderDeviceNameFromDeviceView();
    if (headerDevice) return headerDevice;
    return '';
}

// Get a safe ID for use in a selector (CSS.escape if available, else minimal escaping)
function getSafeId(rootMenuEl) {
    let id = rootMenuEl.getAttribute('id') || '';
    if (id) {
        id = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape(id) : id.replace(/"/g, '\\"');
    }
    return id;
}

// Attempt to read the device name from the Device View header (h1)
function getHeaderDeviceNameFromDeviceView() {
    try {
        const header = document.querySelector('[aria-label="Support header"]');
        if (!header) return '';
        const h1 = header.querySelector('h1[title], h1');
        const text = (h1?.getAttribute('title') || h1?.textContent || '').trim();
        return text || '';
    } catch (_) { return ''; }
}

// Generic injection into a discovered native actions menu (Device View, etc.)
function tryInjectIntoRootMenu(rootMenuEl) {
    if (!rootMenuEl) return false;
    try {
        // Prevent duplicate injections within this menu
        if (rootMenuEl.querySelector(`[${INJECTED_ATTR}]`)) return true;
        // Resolve controlling kebab button and prime the placeholder so columnName is available
        const safeId = getSafeId(rootMenuEl);
        const btn = safeId ? document.querySelector(`button[aria-controls="${safeId}"]`) : null;
        // Only inject on root action menus controlled by a row kebab button.
        // Native submenus are controlled by menuitems (not buttons), so skip them.
        if (!btn) return true;
        try { if (btn) initNqaPlaceholder(btn); } catch (_) {}

        // Filter menu asynchronously; only inject if there are eligible items
        getMenuFilteredByCurrentColumn((menus) => {
            if (!menus || !menus.length) return;

            // Container used to append our entry
            const container = rootMenuEl.querySelector('[role="menu"]') || rootMenuEl;

            // Build our submenu trigger (icon from a dedicated builder)
            const quickIconEl = buildQuickActionsIconSvg();
            const { outer, trigger } = buildSubmenuTrigger(container, 'Quick Actions', quickIconEl);

            outer.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Refresh placeholder for the current row just before rendering submenu
                try { if (btn) initNqaPlaceholder(btn); } catch (_) {}
                buildActionItemsForDevice((items) => {
                    try { showCustomSubmenu(trigger, items); } catch (_) {}
                });
            });

            const sep = buildMenuSeparator(container);
            if (sep) container.appendChild(sep);
            container.appendChild(outer);
        });
        /*
        bus = getNqaEventBus();
        bus.dispatchEvent(new CustomEvent('nqaEvent', {
            detail: { rootMenuEl: rootMenuEl, button: btn }
        }));
        // */

        return true;
    } catch (_) { return false; }
}

// Generic observer: watch for native actions menus being attached to the DOM (Device View, etc.)
try {
    const genericMenuObserver = new MutationObserver((muts) => {
        for (const m of muts) {
            for (const n of m.addedNodes) {
                if (!(n instanceof Element)) continue;
                // Direct match or within subtree
                let root = null;
                if (n.matches && n.matches('[role="menu"][id$="_actions"]')) root = n;
                else root = n.querySelector && n.querySelector('[role="menu"][id$="_actions"]');
                if (!root) continue;
                // Avoid duplicate injection
                if (root.querySelector(`[${INJECTED_ATTR}]`)) continue;
                tryInjectIntoRootMenu(root);
            }
        }
    });
    genericMenuObserver.observe(document.body, { childList: true, subtree: true });
} catch (_) { /* no-op */ }

// ----- Generic page context helpers (standalone, to be used later) -----
// Detects high-level page type from header h2: 'Device View' | 'Investigations' | ''
function detectPageContext() {
    try {
        const h2 = document.querySelector('header h2');
        return (h2?.textContent || '').trim();
    } catch (_) { return ''; }
}

// Extracts the table name from main h3 title, e.g. "1,20k Devices" → "Devices"
// Will be used for prefixing column keys
function getTableName() {
    try {
        const h3 = document.querySelector('main h3');
        const title = (h3?.title || '').trim();
        // Expect format like "1,20k Devices" or "567 Users"
        const match = title.match(/^[\d.,\s]*[kMGTPE]?[\s]+(\w+)/i);
        return match ? match[1] : '';
    } catch (_) { return ''; }
}

// Normalize a column header to a safe key: collapse non-alphanumerics to single underscore
function normalizeColumnKey(label) {
    let s = String(label || '')
        .replace(/\u200B|\u200C|\u200D|\uFEFF/g, '') // zero-width chars
        .trim();
    // Prefix with table name to reduce key collisions across different tables
    s = getTableName() + '_' + s
    return s
        .toLowerCase()
        .replace(/[^A-Za-z0-9]+/g, '_') // any non-alnum → _
        .replace(/_+/g, '_')            // collapse multiple _
        .replace(/^_+|_+$/g, '');       // trim leading/trailing _
}

// Extract visible column labels for Investigations grid
function getInvestigationColumnKeys() {
    try {
        const nodes = document.querySelectorAll(INVESTIGATION_COLUMN_SELECTOR);
        const keys = [];
        nodes.forEach((el) => {
            // Prefer text nodes only (ignore <wbr>); fallback to textContent
            let text = '';
            try {
                text = Array.from(el.childNodes)
                    .filter((n) => n.nodeType === Node.TEXT_NODE)
                    .map((n) => n.textContent || '')
                    .join('')
                    .trim();
            } catch (_) { text = (el.textContent || '').trim(); }
            const key = normalizeColumnKey(text);
            if (key) keys.push(key);
        });
        return keys;
    } catch (_) { return []; }
}

// Build a placeholder object for a given Investigations row (<tr> or descendant)
function buildInvestigationPlaceholder(rowLike) {
    const obj = {table_name:'', columnName:'', rawValues: {} };
    const table_name = getTableName();
    if (!table_name) return obj;
    obj.table_name = table_name;

    // Derive normalized columnName from the kebab button if available
    const colName = getNqaColumnNameFromKebab(rowLike);
    if (colName) obj.columnName = colName;

    const keys = getInvestigationColumnKeys();
    // Initialize rawValues with empty strings
    keys.forEach((k) => { obj.rawValues[k] = ''; });
    if (!rowLike) return obj; // empty scaffold if no row provided
    try {
        const row = rowLike.closest ? rowLike.closest('tr, [role="row"]') : null;
        if (!row) return obj;
        const cells = Array.from(row.querySelectorAll('td:not(:has(input[type="checkbox"]))'));
        keys.forEach((k, i) => {
            const cell = cells[i];
            if (!cell) return;
            let val = '';
            try {
                // Prefer link text if present (common for device/user columns)
                const link = cell.querySelector('a, [role="link"]');
                val = (link?.textContent || cell.textContent || '').trim();
            } catch (_) { val = (cell.textContent || '').trim(); }
            obj.rawValues[k] = val;
        });
    } catch (_) { /* ignore */ }
    return obj;
}

// Build a placeholder object for Device View
function buildDeviceViewPlaceholder() {
    const obj = { table_name: 'device_view', columnName: '', rawValues: { devices_name: '', login_name: '', full_name: '', ad_name: '' } };
    try {
        // Device name from the page title
        const h1 = document.querySelector('[aria-label="Support header"] h1, header h1');
        obj.rawValues.devices_name = ((h1?.getAttribute('title') || h1?.textContent) || '').trim();
    } catch (_) {}

    try {
        const assoc = document.querySelector('[data-insights="associatedUser-openUserOverview"]');
        let login = '', full = '';
        if (assoc) {
            // Extract only the value spans (avoid labels/dialog triggers)
            const vals = Array.from(assoc.querySelectorAll('span:not([aria-haspopup="dialog"])'))
                .map((el) => (el.textContent || '').trim());
            login = vals[0] || '';
            full = vals[1] || '';
        }

        obj.rawValues.login_name = login;
        obj.rawValues.full_name = full;
        // Windows vs mac hint: suffix after @ equals deviceName → mac; else Windows AD
        const at = (login || '').split('@');
        if (at.length === 2) {
            const suffix = at[1] || '';
            // Keep only the username part
            obj.rawValues.login_name = at[0] || '';
            if (suffix && (!obj.rawValues.devices_name || suffix !== obj.rawValues.devices_name)) {
                obj.rawValues.ad_name = suffix;
            }
        }
    } catch (_) {}
    if (!Object.prototype.hasOwnProperty.call(obj.rawValues, 'ad_name')) {
        try { obj.rawValues.ad_name = obj.rawValues.ad_name; } catch (_) {}
    }
    return obj;
}

// Public initializer to create/reset the global placeholder depending on context.
// - For Investigations: if a row is provided, fills values from that row; else keys only
// - For Device View: fills devices_name/login_name/full_name/(ad_name?)
function initNqaPlaceholder(rowLike) {
    try {
        const kind = detectPageContext();
        if (kind === 'Investigations') {
            window.nqaPlaceHolder = buildInvestigationPlaceholder(rowLike || null);
            return window.nqaPlaceHolder;
        }
        if (kind === 'Device View') {
            window.nqaPlaceHolder = buildDeviceViewPlaceholder();
            return window.nqaPlaceHolder;
        }
        // Unknown: initialize empty structure
        window.nqaPlaceHolder = { table_name: '', columnName: '', rawValues: {} };
        return window.nqaPlaceHolder;
    } catch (_) {
        window.nqaPlaceHolder = { table_name: '', columnName: '', rawValues: {} };
        return window.nqaPlaceHolder;
    }
}

// Lightweight global event bus for NQA events
function getNqaEventBus() {
    try {
        if (!window.nqaBusEvent) {
            window.nqaBusEvent = new EventTarget();
        }
        return window.nqaBusEvent;
    } catch (_) {
        // Fallback to document if EventTarget construction fails
        return document;
    }
}

// Independent listener: log NQA events to console
try {
    getNqaEventBus().addEventListener('nqaEvent', (e) => {
         try {
            console.log('[NQA][bus] nqaEvent:', e.detail);
            //initNqaPlaceholder(e.detail.rootMenuEl);
            console.log('[NQA][bus] current placeholder:', window.nqaPlaceHolder);
            let colName = getNqaColumnNameFromKebab(e.detail.rootMenuEl);
            console.log('[NQA][bus] derived column name:', colName);
        }
        catch (_) {}
    });
} catch (_) { /* no-op */ }
