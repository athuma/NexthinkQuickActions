# Nexthink Quick Actions

Nexthink Quick Actions is a Chrome/Edge extension that augments the Nexthink web console with configurable shortcuts. It lets support teams open downstream tools (ServiceNow, JAMF, Workday, etc.) straight from a device or user row, while keeping the configuration manageable through both an options UI and enterprise policies.

## What the extension delivers
- **Context menu quick actions** – injects a "Quick Actions" submenu in Nexthink kebab menus (Device View and Investigations). Entries open new tabs using placeholders that are resolved from the selected row.
- **Browser action popup** – provides a compact launcher that jumps directly to Device View for a device name, with a shortcut to the settings page when the instance is not yet configured.
- **Cheat-sheet toggle** – adds a QuickAction icon to the Nexthink top menubar that reveals a panel listing all detected column placeholders, with one-click copy to help authors build URLs.
- **Friendly configuration surface** – an options page to maintain the Nexthink instance URL, manage quick action rows, reorder entries, and import/export JSON bundles.
- **Policy-driven deployment** – supports Chrome managed storage, including overlay vs seed modes, so administrators can pre-load and lock menus or instance settings. Sample payloads are available in `debug/`.

## Configuration workflow
### Accessing the options page
- From the browser toolbar popup, click the cog icon (or `Add Nexthink instance`) to open `option/options.html`.
- The first section stores the Nexthink **Instance** (name + base URL without path). The table stays hidden until an instance exists. Only `https://host` or `http://host` formats are accepted—trailing slashes, paths, query strings, and hashes are rejected.
- The **Quick Actions** section maintains the menu entries consumed by the content script. Each entry is a name and a URL template that must contain at least one placeholder such as `{devices_name}` or `{*full_name}`.

### Editing quick actions
- Click **Add** to create a new row or the pencil icon to edit an existing one. Rows can be reordered with the up/down arrows; managed entries show the lock state and disable editing when policies require it.
- URL templates accept multi-line input for readability; line breaks are stripped before injection.
- The helper text explains the placeholder syntax. Validation ensures the template is `http(s)://` and contains at least one `{placeholder}` token. Wildcards (`*`) inside placeholders act as glob-like patterns matched against captured column keys.

### Import/export and JSON format
- Use the toolbar buttons to export the current dataset to `NQA_Configuration.json` or import another JSON document. The modal lets you **Add** (append) or **Replace** the existing menu, and optionally override the instance when provided.
- The expected structure matches `debug/NQA_Configuration+wildcard.json`:
  ```json
  {
    "menu": [{ "name": "Ouvrir dans ServiceNow", "url": "https://…{devices_name}…" }],
    "instance": { "name": "PROD", "url": "http://corp.eu.nexthink.cloud" },
    "version": "1.0.0"
  }
  ```

### Chrome managed policies
- The storage layer (`option/lib/config-store.js`) reads both `chrome.storage.sync` (user data) and `chrome.storage.managed` (enterprise policy).
- Policies accept two modes:
  - **Overlay** (default): managed entries are merged into the user list. Flags `allowUserEntries` and `lockManagedEntries` control whether users may add/edit their own entries.
  - **Seed**: managed data seeds the user profile once. With `seedReplace=true`, it overwrites any existing configuration on first load.
- For Chrome Enterprise or macOS deployment, adapt `debug/NQA_Chrome_Managed.mobileconfig` by replacing the placeholder extension ID (`XXXXXXXX`). The managed payload sets the instance and menu under `ExtensionSettings`.

## Runtime behaviour in Nexthink
### Quick Actions submenu
- The content script (`content.js`) observes Nexthink menus to locate kebab action panels on Device View and Investigations screens.
- When a menu opens, the script resolves the controlling row/button, extracts the currently selected column (`window.nqaPlaceHolder.columnName`), filters configured entries for matching placeholders, and injects a native-looking submenu.
- Clicking a quick action opens the resolved URL in a new tab. The submenu closes automatically and tracks focus state so multiple menus cannot overlap.

### Placeholder resolution
- During injection, placeholders such as `{devices_name}` or wildcard forms like `{*full_name}` are replaced with the values exposed by `window.nqaPlaceHolder.rawValues`.
- Placeholders without a matching key remain untouched, which keeps URLs predictable during troubleshooting.

### Cheat-sheet toggle and panel
- `content-cheatsheet.js` watches for the Investigations context. Once active, it clones the Nexthink menubar structure to append a **QuickAction** icon with a toggle state.
- The floating panel lists every column detected in the current table along with its normalized placeholder (e.g. `{devices_name}`). Copy buttons and toast notifications simplify building URLs for new actions.
- A dark-mode friendly stylesheet (`#nqa-cheatsheet-style`) keeps the panel visually aligned with the Nexthink UI.

## Browser action popup
- `popup/popup.js` loads the shared store, checks whether an instance exists, and adjusts the UI accordingly:
  - When configured, the form accepts a device name and opens Device View at `/sup/device/search/{query}` in a new tab.
  - When no instance is found, the popup shows a call-to-action that opens the options page.
- Storage listeners update the popup live after changes in the options page.

## Project layout
- `manifest.json` – entry point (MV3) declaring content scripts, popup, options page, and managed schema.
- `option/lib/` – reusable controllers for the options UI (`config-store`, `menu-entries-controller`, `instance-section`, `import-export-toolbar`).
- `content.js` – main injector for row menus and submenu creation.
- `content-cheatsheet.js` – Investigations placeholder helper + menu toggle.
- `popup/` – browser action markup, styles, and logic.
- `debug/` – sample managed payloads and reference HTML assets.

## Getting started
1. Load the folder as an unpacked extension in Chrome/Edge (`chrome://extensions` → Developer mode → Load unpacked).
2. Configure the Nexthink instance and quick actions via the options page, or import the sample JSON from `debug/`.
3. Open a Nexthink Device View or Investigation, trigger the kebab menu, and use the "Quick Actions" submenu to launch downstream tools.
4. Use the QuickAction toggle in the menubar to review available placeholders while authoring new links.

## Troubleshooting tips
- If the submenu does not appear, confirm that the column you are using has a matching placeholder in your URL template. The cheat-sheet panel shows the exact keys the script detects.
- Managed policies override user settings depending on the chosen mode. Inspect `chrome://policy` to verify the payload applied by your organization.
- The options page surfaces validation errors inline (invalid URLs, missing placeholders). Correct them before saving.

