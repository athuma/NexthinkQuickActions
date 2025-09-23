# Changelog

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

