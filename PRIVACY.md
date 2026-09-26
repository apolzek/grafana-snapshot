# Privacy Policy

_Last updated: September 26, 2026_

Dashboard Snapshot for Grafana ("the extension") exports the Grafana dashboard you are viewing to a file on your computer. It is designed to work entirely inside your browser.

## Data collection

The extension does **not** collect, store, transmit, sell or share any personal or usage data. It has no servers, no analytics, no telemetry and no advertising.

## What the extension accesses, and when

The extension does nothing until you click one of its export buttons. At that moment, and only on the tab you are viewing, it reads the page's content:

- the dashboard's layout and styles;
- the charts as currently drawn;
- the data displayed by each panel.

It uses that content only to build the file you asked for, which your browser saves to your downloads folder.

To make exported files work offline, the extension re-downloads fonts and images the dashboard already uses. Those requests go to the servers the page itself references, normally your Grafana server. Your cookies are sent only to the page's own server, never to third-party hosts.

Password fields are never included in exports.

## Permissions

- **activeTab:** access to the current tab, granted only when you click the extension.
- **scripting:** runs the export code in that tab.

The extension requests no access to other websites, your browsing history, or any other browser data.

## Local settings

Your choice of export options is saved in the extension's local storage on your device and never leaves it.

## Contact

Questions or concerns: open an issue at <https://github.com/apolzek/grafana-snapshot/issues>.
