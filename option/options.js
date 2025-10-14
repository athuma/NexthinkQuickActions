document.addEventListener("DOMContentLoaded", () => {
    try {
        const manifest = chrome.runtime.getManifest();
        const v = manifest?.version ? `v ${manifest.version}` : "";
        const el = document.getElementById("version");
        if (el) el.textContent = v;
        const brand = document.getElementById("brandIcon");
        if (brand) {
            try {
                brand.src = chrome?.runtime?.getURL
                    ? chrome.runtime.getURL("icons/spark16x16.svg")
                    : "../icons/spark16x16.svg";
            } catch (_) {
                brand.src = "../icons/spark16x16.svg";
            }
        }
    } catch (_) {
        // no-op if not available
    }

    const tbody = document.getElementById("cfgTbody");
    // Menu table (avoid selecting the instance table)
    const menuTable = document.querySelector("#menuSection .cfg-table");
    const empty = document.getElementById("emptyState");
    const addBtn = document.getElementById("addBtn");
    // Instance section DOM
    const instSection = document.getElementById("instanceSection");
    const instAddBtn = document.getElementById("instAddBtn");
    const instTable = document.getElementById("instTable");
    const instTbody = document.getElementById("instTbody");
    const importBtn = document.getElementById("importBtn");
    const exportBtn = document.getElementById("exportBtn");
    const importFile = document.getElementById("importFile");
    const templateBtn = document.getElementById("templateBtn");
    const templateModal = document.getElementById("templateModal");
    const templateList = document.getElementById("templateList");
    const templateCancelBtn = document.getElementById("templateCancelBtn");
    const templateAddBtn = document.getElementById("templateAddBtn");
    const exportSaveStatus = document.getElementById("exportSaveStatus");
    const csvDelimiterInput = document.getElementById("csvDelimiterInput");
    const csvDelimiterErr = document.getElementById("csvDelimiterErr");
    const clipboardFormatRadios = Array.from(
        document.querySelectorAll('input[name="clipboardFormat"]')
    );
    const modifierCard = document.getElementById("clipboardModifierCard");
    const modifierAltLabel = document.getElementById("clipboardModifierAlt");
    const modifierShiftLabel = document.getElementById("clipboardModifierShift");
    const modifierAltRow = document.getElementById("clipboardModifierAltRow");
    const modifierShiftRow = document.getElementById("clipboardModifierShiftRow");
    // Import modal elements
    const importModal = document.getElementById("importModal");
    const importSummary = document.getElementById("importSummary");
    const importCancelBtn = document.getElementById("importCancelBtn");
    const importAddBtn = document.getElementById("importAddBtn");
    const importReplaceBtn = document.getElementById("importReplaceBtn");
    // Delete modal elements
    const deleteModal = document.getElementById("deleteModal");
    const deleteDialog = document.querySelector("#deleteModal .modal-dialog");
    const deleteSummary = document.getElementById("deleteSummary");
    const deleteCancelBtn = document.getElementById("deleteCancelBtn");
    const deleteConfirmBtn = document.getElementById("deleteConfirmBtn");
    // legacy delete state removed (handled by controllers)
    // Instance modal elements
    const instanceModal = document.getElementById("instanceModal");
    const instanceDialog = document.querySelector(
        "#instanceModal .modal-dialog"
    );
    const instPrefixInput = document.getElementById("instPrefixInput");
    const instRegionSelect = document.getElementById("instRegionSelect");
    const instPrefixErr = document.getElementById("instPrefixErr");
    const instPreviewUrl = document.getElementById("instPreviewUrl");
    const instCopyUrlBtn = document.getElementById("instCopyUrlBtn");
    const instCopyPlaceholderBtn = document.getElementById(
        "instCopyPlaceholderBtn"
    );
    const instPlaceholderToken = document.getElementById(
        "instPlaceholderToken"
    );
    const instPlaceholderValue = document.getElementById(
        "instPlaceholderValue"
    );
    const instCancelBtn = document.getElementById("instCancelBtn");
    const instSaveBtn = document.getElementById("instSaveBtn");
    // legacy instance edit state removed (handled by NqaInstanceSection)

    // Centralized copy for help/errors
    const URL_HELP =
        "Example: http(s)://hostname/path{keyword} <br>{keyword} is a column name and will be replaced by the captured value from the investigation<br>{*keyword} will match the first column name ending with keyword<br>Use {instance_name} to inject the configured tenant prefix";
    const URL_ERR_INVALID = "Invalid URL";

    const TEMPLATE_SOURCE = chrome.runtime.getURL("option/templates.json");
    const templateState = {
        loaded: false,
        templates: [],
        selected: new Set(),
    };

    const escapeHtml = (str) =>
        String(str ?? "").replace(
            /[&<>"]/g,
            (ch) =>
                ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch])
        );

    const updateTemplateAddDisabled = () => {
        if (templateAddBtn)
            templateAddBtn.disabled = templateState.selected.size === 0;
    };

    const resetTemplateSelection = () => {
        templateState.selected.clear();
        updateTemplateAddDisabled();
    };

    const hideTemplateModal = () => {
        try {
            if (templateModal) templateModal.hidden = true;
        } catch (_) {}
        resetTemplateSelection();
    };

    const renderTemplateList = () => {
        if (!templateList) return;
        if (!templateState.templates.length) {
            templateList.innerHTML =
                '<div class="template-list-empty">No templates available.</div>';
            return;
        }
        const items = templateState.templates.map((tpl, idx) => {
            const name = escapeHtml(tpl?.name || `Template ${idx + 1}`);
            const title = escapeHtml(tpl?.url || "");
            return `<label class="template-item" title="${title}">
        <input type="checkbox" data-index="${idx}" />
        <span class="template-name">${name}</span>
      </label>`;
        });
        templateList.innerHTML = items.join("");
        resetTemplateSelection();
    };

    const ensureTemplatesLoaded = async () => {
        if (templateState.loaded) return;
        try {
            const resp = await fetch(TEMPLATE_SOURCE);
            if (!resp.ok) throw new Error("Failed to load templates");
            const data = await resp.json();
            if (Array.isArray(data)) {
                templateState.templates = data.filter(
                    (tpl) => tpl && tpl.name && tpl.url
                );
            } else {
                templateState.templates = [];
            }
        } catch (_) {
            templateState.templates = [];
        } finally {
            templateState.loaded = true;
        }
    };

    const openTemplateModal = async () => {
        if (!templateModal || !templateBtn || templateBtn.disabled) return;
        await ensureTemplatesLoaded();
        renderTemplateList();
        templateModal.hidden = false;
        setTimeout(() => {
            try {
                templateModal.querySelector('input[type="checkbox"]').focus();
            } catch (_) {}
        }, 0);
    };

    const applySelectedTemplates = async () => {
        if (!templateState.selected.size) {
            hideTemplateModal();
            return;
        }
        const templates = Array.from(templateState.selected)
            .map((idx) => templateState.templates[idx])
            .filter((tpl) => tpl && tpl.name && tpl.url);
        if (!templates.length) {
            hideTemplateModal();
            return;
        }
        try {
            const current = await getMenu();
            const next = Array.isArray(current) ? current.slice() : [];
            templates.forEach((tpl) => {
                const entry = { name: tpl.name, url: tpl.url };
                if (window.NqaConfigStore.isValidMenuItem(entry))
                    next.push(entry);
            });
            await setMenu(next);
            try {
                window.__nqaMenuController?.render?.();
            } catch (_) {}
        } catch (_) {
            /* ignore */
        }
        hideTemplateModal();
    };

    // Placeholder hook: currently return values verbatim, but keep the function so controllers can
    // re-enable decoding behaviour later without signature changes.
    const decodeForDisplay = (val) => {
        return val;
    };

    // Placeholder hook: upstream controllers expect to call this before persisting URLs. Leave the
    // function ready in case re-encoding logic needs to be reintroduced.
    const encodeTemplateUrlForStorage = (input) => {
        return input;
    };

    const isValidNqaUrl = (str) => {
        const s = String(str || "").trim();
        // Must contain at least one placeholder like {name}
        const PH_RE = /\{[*A-Za-z0-9_:-]+\}/g;
        if (!PH_RE.test(s)) return false;
        // Validate base URL with all placeholders replaced
        const base = s.replace(PH_RE, "X");
        try {
            const u = new URL(base);
            return (
                (u.protocol === "http:" || u.protocol === "https:") &&
                !!u.hostname
            );
        } catch (_) {
            return false;
        }
    };

    // Instance base URL must be protocol+host (and optional port), no path/search/hash, no trailing slash in user input
    const isValidInstanceUrl = (str) => {
        const s = String(str || "").trim();
        if (!s) return false;
        if (/\/$/.test(s)) return false; // no trailing slash
        try {
            const u = new URL(s);
            if (!(u.protocol === "http:" || u.protocol === "https:"))
                return false;
            if (!u.hostname) return false;
            if (u.search || u.hash) return false;
            // URL() normalizes pathname to '/' even if not present; ensure input had no path by checking after host there was nothing
            // Basic check: disallow any extra slash after host in input
            const afterHost = s
                .replace(/^https?:\/\//i, "")
                .replace(/^\[[^\]]+\]/, "")
                .replace(/^[^/]+/, "");
            if (afterHost !== "") return false;
            return true;
        } catch (_) {
            return false;
        }
    };

    const setTemplateButtonEnabled = (flag) => {
        if (templateBtn) {
            templateBtn.disabled = !flag;
        }
        if (!flag) hideTemplateModal();
    };

    // Use shared storage class (mandatory)
    const store = new window.NqaConfigStore();
    const getMenu = () => store.getMenu();
    const setMenu = (items) => store.setMenu(items);
    const getExportPrefs = () => store.getExportPrefs();
    const setExportPrefs = (prefs) => store.setExportPrefs(prefs);

    const DEFAULT_EXPORT_PREFS = window.NqaConfigStore
        ?.DEFAULT_EXPORT_PREFS || {
        csvDelimiter: ",",
        clipboardFormat: "html",
    };

    const EXPORT_AUTOSAVE_DELAY = 250;
    let exportStatusTimer = null;
    let exportAutosaveTimer = null;
    let currentExportPrefs = {
        csvDelimiter: DEFAULT_EXPORT_PREFS.csvDelimiter,
        clipboardFormat: DEFAULT_EXPORT_PREFS.clipboardFormat,
    };

    const toDisplayDelimiter = (value) => (value === "\t" ? "\\t" : value);
    const fromDisplayDelimiter = (value) => (value === "\\t" ? "\t" : value);

    const getSelectedClipboardFormat = () => {
        const checked = clipboardFormatRadios.find((radio) => radio.checked);
        return checked ? checked.value : null;
    };

    const setSelectedClipboardFormat = (format) => {
        clipboardFormatRadios.forEach((radio) => {
            radio.checked = radio.value === format;
        });
    };

    const getFormatEntries = () => {
        return clipboardFormatRadios.map((radio) => {
            const labelSpan =
                radio.closest(".radio-option")?.querySelector("span");
            return {
                value: radio.value,
                label: labelSpan
                    ? labelSpan.textContent.trim()
                    : radio.value.toUpperCase(),
            };
        });
    };

    const updateClipboardModifierHints = () => {
        if (!modifierCard) return;
        const entries = getFormatEntries();
        if (!entries.length) {
            modifierCard.hidden = true;
            return;
        }
        const selected =
            getSelectedClipboardFormat() ||
            DEFAULT_EXPORT_PREFS.clipboardFormat;
        const selectedEntry =
            entries.find((entry) => entry.value === selected) || entries[0];
        const alternatives = entries.filter(
            (entry) => entry.value !== selectedEntry.value
        );

        const pickEntry = (idx) => {
            if (alternatives[idx]) return alternatives[idx];
            if (alternatives.length) return alternatives[alternatives.length - 1];
            return selectedEntry;
        };

        const altEntry = pickEntry(0);
        const shiftEntry = pickEntry(1);

        if (modifierAltLabel)
            modifierAltLabel.textContent = altEntry?.label || "—";
        if (modifierShiftLabel)
            modifierShiftLabel.textContent = shiftEntry?.label || "—";

        if (modifierAltRow) {
            modifierAltRow.classList.toggle(
                "modifier-disabled",
                !altEntry || altEntry.value === selectedEntry.value
            );
        }
        if (modifierShiftRow) {
            modifierShiftRow.classList.toggle(
                "modifier-disabled",
                !shiftEntry || shiftEntry.value === selectedEntry.value
            );
        }

        modifierCard.hidden = entries.length < 2;
    };

    const showExportStatus = (message, isError = false) => {
        if (!exportSaveStatus) return;
        exportSaveStatus.textContent = message || "";
        exportSaveStatus.classList.toggle("error", !!isError);
        if (exportStatusTimer) {
            clearTimeout(exportStatusTimer);
            exportStatusTimer = null;
        }
        if (message) {
            exportStatusTimer = setTimeout(() => {
                exportSaveStatus.textContent = "";
                exportSaveStatus.classList.remove("error");
                exportStatusTimer = null;
            }, 2500);
        }
    };

    const populateExportForm = (prefs) => {
        const effective = { ...DEFAULT_EXPORT_PREFS, ...(prefs || {}) };
        if (csvDelimiterInput) {
            csvDelimiterInput.value = toDisplayDelimiter(effective.csvDelimiter);
            currentExportPrefs.csvDelimiter = fromDisplayDelimiter(
                csvDelimiterInput.value
            ) || DEFAULT_EXPORT_PREFS.csvDelimiter;
        }
        if (clipboardFormatRadios.length) {
            const acceptable = ["markdown", "ascii", "html"];
            const fmt = acceptable.includes(effective.clipboardFormat)
                ? effective.clipboardFormat
                : DEFAULT_EXPORT_PREFS.clipboardFormat;
            setSelectedClipboardFormat(fmt);
            currentExportPrefs.clipboardFormat = fmt;
        }
        updateClipboardModifierHints();
    };

    const broadcastExportPrefs = (prefs) => {
        if (!prefs) return;
        try {
            if (chrome?.runtime?.sendMessage) {
                chrome.runtime.sendMessage(
                    { type: "nqa-export-prefs-updated", prefs },
                    () => {
                        // Ignore missing receivers (no open content scripts)
                        void chrome.runtime?.lastError;
                    }
                );
            }
        } catch (_) {
            /* ignore */
        }
    };

    const loadExportPrefs = async () => {
        try {
            const prefs = await getExportPrefs();
            populateExportForm(prefs);
        } catch (_) {
            populateExportForm(DEFAULT_EXPORT_PREFS);
        }
    };

    const handleExportSave = async () => {
        if (!csvDelimiterInput) return;
        const rawDelimiter = csvDelimiterInput.value
            ? csvDelimiterInput.value.trim()
            : "";
        const parsedDelimiter = fromDisplayDelimiter(rawDelimiter);
        if (!parsedDelimiter) {
            if (csvDelimiterErr) csvDelimiterErr.hidden = false;
            csvDelimiterInput.focus();
            showExportStatus("Separator is required.", true);
            return;
        }
        if (csvDelimiterErr) csvDelimiterErr.hidden = true;

        let format = getSelectedClipboardFormat();
        if (!format) format = DEFAULT_EXPORT_PREFS.clipboardFormat;

        if (
            parsedDelimiter === currentExportPrefs.csvDelimiter &&
            format === currentExportPrefs.clipboardFormat
        ) {
            return;
        }

        showExportStatus("Saving…");
        try {
            const saved = await setExportPrefs({
                csvDelimiter: parsedDelimiter,
                clipboardFormat: format,
            });
            populateExportForm(saved);
            showExportStatus("Preferences saved.");
            broadcastExportPrefs(saved);
        } catch (err) {
            showExportStatus("Unable to save preferences.", true);
        }
    };

    // Schedule a debounced save to avoid hammering storage on every keystroke.
    const queueExportSave = () => {
        if (exportAutosaveTimer) clearTimeout(exportAutosaveTimer);
        exportAutosaveTimer = setTimeout(() => {
            exportAutosaveTimer = null;
            handleExportSave();
        }, EXPORT_AUTOSAVE_DELAY);
    };

    if (csvDelimiterInput) {
        csvDelimiterInput.addEventListener("input", () => {
            if (csvDelimiterErr) csvDelimiterErr.hidden = true;
        });
        csvDelimiterInput.addEventListener("change", () => {
            queueExportSave();
        });
        csvDelimiterInput.addEventListener("blur", () => {
            queueExportSave();
        });
    }

    clipboardFormatRadios.forEach((radio) => {
        radio.addEventListener("change", () => {
            updateClipboardModifierHints();
            queueExportSave();
        });
    });

    loadExportPrefs();
    updateClipboardModifierHints();

    // Icons rendered via CSS masks; no runtime URL required

    if (templateBtn)
        templateBtn.addEventListener("click", () => openTemplateModal());
    if (templateCancelBtn)
        templateCancelBtn.addEventListener("click", () => hideTemplateModal());
    if (templateAddBtn)
        templateAddBtn.addEventListener("click", () =>
            applySelectedTemplates()
        );
    if (templateList)
        templateList.addEventListener("change", (ev) => {
            const checkbox =
                ev.target &&
                ev.target.closest &&
                ev.target.closest('input[type="checkbox"]');
            if (!checkbox) return;
            const idx = Number(checkbox.getAttribute("data-index"));
            if (Number.isNaN(idx)) return;
            if (checkbox.checked) templateState.selected.add(idx);
            else templateState.selected.delete(idx);
            updateTemplateAddDisabled();
        });

    setTemplateButtonEnabled(true);

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

        // Retrieve managed storage values (or {} on error) so policies can be evaluated.
        const fetchManagedConfig = () => {
            return new Promise((resolve) => {
                try {
                    chrome.storage.managed.get(null, (res) =>
                        resolve(res || {})
                    );
                } catch (_) {
                    resolve({});
                }
            });
        };

        // Toggle the ability for users to add/edit menu entries depending on policy.
        const setUserEntriesAccess = async (allowed) => {
            if (typeof menuController?.setUserEntriesAllowed === "function") {
                await menuController.setUserEntriesAllowed(allowed);
            } else if (addBtn) {
                addBtn.disabled = !allowed;
            }
        };

        // Apply the seed policy: replace user config with managed defaults when required.
        const applySeedPolicy = async (store, managed, policy) => {
            const rawMenu = Array.isArray(managed.menu) ? managed.menu : [];
            const validMenu = rawMenu.filter(
                window.NqaConfigStore.isValidMenuItem
            );
            const currentMenu = await store.getMenu();
            const shouldReplace =
                policy.seedReplace ||
                !(Array.isArray(currentMenu) && currentMenu.length);
            if (!shouldReplace) return;
            if (validMenu.length) await store.setMenu(validMenu);
            if (
                managed.instance &&
                window.NqaConfigStore.isValidInstance(managed.instance)
            ) {
                await store.setInstance(managed.instance);
            }
        };

        // Render menu controller while swallowing unexpected errors (avoid breaking UI).
        const renderMenuSafely = () => {
            try {
                menuController.render();
            } catch (_) {}
        };

        // Main policy orchestrator: fetch managed config, apply seed/overlay rules, then update UI state.
        const applyManagedPolicy = async () => {
            const store = new window.NqaConfigStore();
            const managed = await fetchManagedConfig();
            const policy = await store.getManagedPolicy(managed);
            if (policy.mode === "seed") {
                try {
                    await applySeedPolicy(store, managed, policy);
                } catch (_) {}
                await setUserEntriesAccess(true);
                setTemplateButtonEnabled(true);
                return;
            }
            const allowUsers = policy.allowUserEntries !== false;
            await setUserEntriesAccess(allowUsers);
            setTemplateButtonEnabled(allowUsers);
        };

        applyManagedPolicy()
            .catch(() => {})
            .finally(renderMenuSafely);
        window.__nqaMenuController = menuController;
    } catch (_) {
        /* class may be missing if script not loaded */
    }

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
                prefixInput: instPrefixInput,
                regionSelect: instRegionSelect,
                prefixErr: instPrefixErr,
                previewUrl: instPreviewUrl,
                copyUrlBtn: instCopyUrlBtn,
                copyPlaceholderBtn: instCopyPlaceholderBtn,
                placeholderEl: instPlaceholderToken,
                placeholderValue: instPlaceholderValue,
                cancelBtn: instCancelBtn,
                saveBtn: instSaveBtn,
                deleteModal,
                deleteDialog,
                deleteSummary,
                deleteCancelBtn,
                deleteConfirmBtn,
            },
            store,
        });
        instanceController.attach();
        // Render once and on storage changes
        instanceController.render();
        try {
            chrome.storage?.onChanged?.addListener(() => {
                instanceController && instanceController.render();
            });
        } catch (_) {}
        // Expose for debug if needed
        window.__nqaInstanceController = instanceController;
    } catch (_) {
        /* class may be missing if script not loaded */
    }

    // Wire Import/Export toolbar (modular controller)
    try {
        const toolbar = new window.NqaImportExportToolbar({
            els: {
                importBtn,
                exportBtn,
                importFile,
                importModal,
                importSummary,
                importCancelBtn,
                importAddBtn,
                importReplaceBtn,
            },
            store,
            onMenuChanged: () => {
                try {
                    window.__nqaMenuController?.render?.();
                } catch (_) {}
            },
            onInstanceChanged: () => {
                try {
                    instanceController.render();
                } catch (_) {}
            },
            isValidNqaUrl,
            isValidInstanceUrl,
        });
        toolbar.attach();
    } catch (_) {
        /* noop if class missing */
    }

    // Close modal on Escape
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            // Close modals via toolbar controller (if any)
            try {
                if (importModal && !importModal.hidden)
                    importModal.hidden = true;
            } catch (_) {}
            if (deleteModal && !deleteModal.hidden) {
                try {
                    deleteModal.hidden = true;
                } catch (_) {}
                if (deleteDialog) {
                    deleteDialog.style.position = "";
                    deleteDialog.style.left = "";
                    deleteDialog.style.top = "";
                }
            }
            if (templateModal && !templateModal.hidden) hideTemplateModal();
        }
    });

    // Re-render on storage changes
    try {
        chrome.storage?.onChanged?.addListener(() => {
            window.__nqaMenuController?.render?.();
            (instanceController || window.__nqaInstanceController)?.render?.();
        });
    } catch (_) {}
});
