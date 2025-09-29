# Changelog

- Feat: Added a selection export feature with two delivery modes: downloadable CSV (configurable delimiter) and clipboard copy (Markdown, ASCII, HTML).
- Fix: Limited Quick Actions menu injection to the Device View header kebabs to avoid duplicating entries elsewhere.
- Fix: Moved the "Add menu" button inside the Quick Action menu section so it aligns with the Nexthink instance layout.
- Docs: Expanded documentation (README/Usage) with extract feature details, project layout notes, ASCII font guidance, updated Workday example.

## v1.0.1

- Reworked instance editor with tenant prefix + region picker, live URL preview, and exposed `{instance_name}` token.
- `{instance_name}` is now validated, exported, and resolved across the app (menu filtering, placeholder replacement, docs).
- Added a template catalog with curated ServiceNow/Jamf/Workday actions and a selector modal.
- Introduced shared `instance-utils` helper to avoid duplicate prefix/region logic.
- Added global shortcut `Alt+Shift+Q` to open the popup.
- UI polish: stable two-column layout, green *Save* button, template button disabled when policies block edits.
- Documentation refreshed with new workflow details and ready-to-use URL samples.

## v1.0.0

- Initial public release.
