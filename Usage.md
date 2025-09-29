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
   - Enter the tenant prefix (lowercase letters, numbers, hyphen) and pick the region (`eu`, `us`, `pac`, `meta`).
   - Review the generated URL (`https://<tenant>.<region>.nexthink.cloud`) and save.
   - The preview shows `{instance_name}` alongside the resolved prefix so you know exactly what value will be injected in your URLs.
3. **Add quick action links**
   - In *Quick Actions menu entries*, press *Add entry*.
   - Alternatively, click *Templates* in the toolbar to insert one or more ready-made actions.
   - Supply a menu name (the text you will see inside the Quick Actions menu).
   - Paste the destination URL template. Replace the dynamic parts with placeholders such as `{devices_name}` or `{*full_name}`.
   - Placeholders are replaced by the values of the selected row in Investigations/Device View.
   - Wildcards like `{*keyword}` match the first column name that ends with `keyword`.
   - Use the helper text under the textarea as a reminder of placeholder rules, then save the entry. Repeat for any additional links.
4. **Organise or edit entries**
   - Use the up/down arrows to reorder actions.
   - Click the pencil icon to modify an entry, or the trash icon to remove it.
   - Managed (locked) items may be present if your administrator preconfigured them.
5. **Tune export settings (optional)**
   - In the *Export settings* card, adjust the **CSV separator** used when downloading selections.
   - Pick the **Clipboard format** (`Markdown`, `ASCII table`, or `HTML table`) applied when copying rows from Investigations. Use the HTML option when pasting into Outlook or other rich-text editors.
   - Click **Save**; changes are applied immediately in all Nexthink tabs.

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
- A global shortcut (`Alt+Shift+Q` by défaut sur Windows et macOS) ouvre aussi le popup et peut être ajusté via `chrome://extensions/shortcuts`.

## 5. QuickAction cheat sheet panel
1. On the left Nexthink menubar, a **QuickAction** icon is appended at the end.
2. Click the icon to toggle the cheat sheet panel. The icon switches style when the panel is visible.
3. The panel lists every detected column with its corresponding placeholder (e.g. `{devices_name}`).
4. Click either the placeholder or *Copier* to copy it to your clipboard, then paste it into a quick action URL.
5. The panel updates automatically as the table content changes. Close it by clicking the QuickAction icon again.

## 6. Export selected rows from Investigations
1. Select one or more rows in an Investigation (use the checkboxes on the left).
2. The Nexthink selection toolbar appears; it now includes the Spark icon followed by two actions:
   - **Copy selection** – copies the selected rows plus column headers to the clipboard using the format chosen in the options page.
   - **Download CSV** – downloads a CSV file using the configured separator.
3. Toast notifications confirm the number of rows exported and warn when a row limit is reached (default 200).
4. When copying in ASCII format, paste into a monospaced font (Courier, Consolas, Monaco, Menlo, etc.) so the table columns stay aligned. HTML table output keeps the layout intact in Outlook and other HTML-aware clients.

## 7. Importing or exporting configurations
- On the options page, use the **Export** button to download a JSON backup of your menus and instance.
- Use **Import** to load a JSON file (for example one shared by your team or generated from another browser). Choose *Add* to append entries or *Replace* to overwrite your current list.
- When importing, the dialog shows whether an instance will be updated in addition to the menu entries.

## 8. Tips & best practices
- Keep menu names short and action-oriented (e.g. `Open in ServiceNow`).
- Test each action after editing: open the kebab menu, run the link, and confirm that placeholders resolved correctly.
- Reuse the cheat sheet often; it reflects the exact keys the content script reads from the current view.
- Managed environments may disable editing for certain rows. Contact your administrator if an entry is locked.

## 9. Sample URL templates
Use the examples below as a starting point and adapt the placeholders to match the data captured in your Nexthink view. Each URL already includes `{instance_name}` so it works once the tenant prefix is configured in the options page.

- **Search device in ServiceNow** (match on device name)
  - `https://{instance_name}.service-now.com/nav_to.do?uri=cmdb_ci_computer_list.do%3Fsysparm_query%3DnameLIKE{devices_name}`
- **Open active incidents in ServiceNow** (active incidents for the device)
  - `https://{instance_name}.service-now.com/nav_to.do?uri=incident_list.do%3Fsysparm_query%3Dactive%253Dtrue%255EstateNOT%2520IN150%252C3%255Ecmdb_ci.name%253D{devices_name}`
- **List all incidents in ServiceNow**
  - `https://{instance_name}.service-now.com/nav_to.do?uri=incident_list.do%3Fsysparm_query%3Dcmdb_ci.name%253D{devices_name}`
- **Search user in ServiceNow** (match on last name / AD username)
  - `https://{instance_name}.service-now.com/nav_to.do?uri=sys_user_list.do%3Fsysparm_query%3Dlast_name%253D{*ad_username}`
- **Open device in Jamf Pro**
  - `https://{instance_name}.jamfcloud.com/computers.html?queryType=COMPUTERS&version=&query={devices_name}`
- **Open user in Workday** (replace `<cluster>` and `<tenant_name>` with your company's values)
  - `https://<cluster>.myworkday.com/<tenant_name>/d/search.htmld?contextualsearchpill=true&state=searchCategory-all:default&q={*full_name}`
  - **`<cluster>`**: Your instance's data center (e.g., `wd3`, `wd5`, `wd103`).
  - **`<tenant_name>`**: Your company's unique identifier on Workday.

## 10. Troubleshooting
- **Quick Actions submenu missing**: ensure you are in Device View or Investigations and that at least one entry contains a placeholder matching the current column.
- **Invalid URL warning**: check that the template starts with `http://` or `https://` and contains at least one `{placeholder}`.
- **Popup shows “Add Nexthink instance”**: configure the instance in the options page so the popup knows where to redirect.
- **Links open but show incorrect results**: verify the placeholder names via the cheat sheet and adjust your templates accordingly.

For any other issue, reopen the options page, review your configuration, and try again. If your organisation manages the extension centrally, reach out to your administrator for further assistance.
