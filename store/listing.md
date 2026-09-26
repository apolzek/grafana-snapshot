# Chrome Web Store listing

Copy these into the Developer Dashboard. Images are in this folder; regenerate them with `npm run store-assets` (see `docs/publishing.md`).

## Store listing tab

**Name** (from the manifest)

```
Dashboard Snapshot for Grafana
```

**Summary** (from the manifest, 132 characters max)

```
Export Grafana dashboards exactly as displayed (HTML, SVG, PNG) and every panel's data (Excel, JSON), all locally.
```

**Description**

```
Export a Grafana dashboard exactly as you see it, and the data behind every panel at once.

SNAPSHOTS
• HTML: a single self-contained file that opens offline in any browser, with selectable text.
• SVG: the whole page as one vector image.
• PNG: a full-page image at your screen's resolution.

Snapshots are complete: panels below the fold are loaded first and the whole dashboard is captured, not only the visible part. Your theme, time range, variables and charts are kept exactly as displayed.

PANEL DATA
• Excel (.xlsx): a summary sheet plus one sheet per panel. Time series are joined by timestamp, with real Excel dates and numbers.
• JSON: every panel with its series, labels, units and values in a single file.

Data is read exactly as the panels display it (after transformations, with legend names and units), without running any query again. No more exporting CSV files one panel at a time.

PRIVATE BY DESIGN
Everything happens in your browser. The extension has no servers, no analytics, and only acts on the current tab when you click it.

Tested with Grafana 10, 11, 12 and 13.
Tip: "Toggle kiosk mode" hides Grafana's menus, so exports contain only the panels.

Open source (MIT): https://github.com/apolzek/grafana-snapshot

Independent project, not affiliated with or endorsed by Grafana Labs. Grafana is a trademark of Grafana Labs.
```

**Category:** Developer Tools
**Language:** English

**Graphic assets**

| Field | File |
| --- | --- |
| Store icon (128×128) | `store/icon-128.png` |
| Screenshots (1280×800) | `store/screenshots/1-popup.png`, `2-full-dashboard.png`, `3-panel-data.png` |
| Small promo tile (440×280) | `store/promo-small.png` |

**Additional fields**

| Field | Value |
| --- | --- |
| Official URL | none |
| Homepage URL | `https://github.com/apolzek/grafana-snapshot` |
| Support URL | `https://github.com/apolzek/grafana-snapshot/issues` |
| Mature content | No |

## Privacy tab

**Single purpose**

```
Export the Grafana dashboard in the current tab to a file: a visual snapshot (HTML, SVG or PNG) or the data displayed by its panels (Excel or JSON).
```

**Permission justification: activeTab**

```
Grants access to the tab the user is viewing, only after the user clicks the extension, so it can read the dashboard the user asked to export. No other tabs or sites are accessed.
```

**Permission justification: scripting**

```
Injects the export code into the current tab when the user clicks an export button. The code captures the dashboard's rendered content (and, for data exports, the data its panels display) and saves it as a file on the user's computer.
```

**Are you using remote code?** No, I am not using remote code.

**Data usage:** leave every data category unchecked. The extension does not collect or transmit any user data.

Check all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL**

```
https://github.com/apolzek/grafana-snapshot/blob/main/PRIVACY.md
```

## Distribution tab

- **Visibility:** Public
- **Regions:** All regions
