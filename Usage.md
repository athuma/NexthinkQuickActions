# Nexthink Quick Actions – User Guide

This guide explains how to configure and use the Nexthink Quick Actions browser extension to accelerate your daily tasks in the Nexthink web console.

## 1. Before you start
- Make sure the extension is installed and enabled in Chrome/Edge (`chrome://extensions`).
- Pin the extension icon to the toolbar so you can reach the popup quickly.
- Keep a list of the external tools you want to launch (ServiceNow, JAMF, Workday, etc.).

## 2. Configure the extension
1. **Open the settings page**
   - Click the extension icon in the browser toolbar.
   - Press the gear button (or *Add Nexthink instance* if prompted). The options page opens in a new tab.
2. **Set the Nexthink instance**
   - In the *Nexthink Instance* card, click *Add Instance*.
   - Enter a friendly name (e.g. `Production`).
   - Enter the base URL in the form `https://host.<eu|us|pac|meta>.nexthink.cloud` (no trailing slash, no path).
   - Save; the instance appears in the table.
3. **Add quick action links**
   - In *Quick Actions menu entries*, press *Add*.
   - Supply a menu name (the text you will see in the Quick Action Menu).
   - Paste the destination URL template. Replace the dynamic parts with placeholders like `{devices_name}` or `{*full_name}`.
   - The placeholder will be replaced by current value of row in investigation.
   - {*Keyword} match the first column ending with Keyword
   - Use the helper text under the textarea as a reminder of placeholder rules.
   - Save the entry. Repeat for any additional links.
4. **Organise or edit entries**
   - Use the up/down arrows to reorder actions.
   - Click the pencil icon to modify an entry, or the trash icon to remove it.
   - Managed (locked) items may be present if your administrator preconfigured them.

## 3. Use quick actions inside Nexthink
1. Navigate to **Device View** or **Investigations** in Nexthink.
2. Open the kebab menu (three dots) for a device or row.
3. A new submenu named **Quick Actions** appears when at least one entry matches the current column.
4. Hover over **Quick Actions** to see your shortcuts. Each option opens in a new browser tab and automatically fills placeholders with the values from the selected row.
5. If no actions appear, check that your template includes a placeholder that matches the current column. Use the cheat sheet (below) to verify keys.

## 4. Toolbar popup launcher
- Click the extension icon to open the popup.
- Type a device name and press **Open** (or hit Enter) to jump straight to Device View`.
- If no instance is configured yet, the popup displays an *Add Nexthink instance* button that opens the options page.

## 5. QuickAction cheat sheet panel
1. On the left Nexthink menubar, a **QuickAction** icon is appended at the end.
2. Click the icon to toggle the cheat sheet panel. The icon switches style when the panel is visible.
3. The panel lists every detected column with its corresponding placeholder (e.g. `{devices_name}`).
4. Click either the placeholder or *Copier* to copy it to your clipboard, then paste it into a quick action URL.
5. The panel updates automatically as the table content changes. Close it by clicking the QuickAction icon again.

## 6. Importing or exporting configurations
- On the options page, use the **Export** button to download a JSON backup of your menus and instance.
- Use **Import** to load a JSON file (for example the template in `debug/NQA_Configuration+wildcard.json`). Choose *Add* to append entries or *Replace* to overwrite your current list.
- When importing, the dialog shows whether an instance will be updated in addition to the menu entries.

## 7. Tips & best practices
- Keep menu names short and action-oriented (e.g. `Open in ServiceNow`).
- Test each action after editing: open the kebab menu, run the link, and confirm that placeholders resolved correctly.
- Reuse the cheat sheet often; it reflects the exact keys the content script reads from the current view.
- Managed environments may disable editing for certain rows. Contact your administrator if an entry is locked.

## 8. Troubleshooting
- **Quick Actions submenu missing**: ensure you are in Device View or Investigations and that at least one entry contains a placeholder matching the current column.
- **Invalid URL warning**: check that the template starts with `http://` or `https://` and contains at least one `{placeholder}`.
- **Popup shows “Add Nexthink instance”**: configure the instance in the options page so the popup knows where to redirect.
- **Links open but show incorrect results**: verify the placeholder names via the cheat sheet and adjust your templates accordingly.

For any other issue, reopen the options page, review your configuration, and try again. If your organisation manages the extension centrally, reach out to your administrator for further assistance.
