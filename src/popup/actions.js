// Extension-side orchestration: injects the page scripts into a tab and runs an export.
// Kept free of UI code so end-to-end tests can drive it directly.

async function run(tabId, { files, func, args = [], world = 'ISOLATED' }) {
  if (files) await chrome.scripting.executeScript({ target: { tabId }, files, world });
  const [injection] = await chrome.scripting.executeScript({ target: { tabId }, func, args, world });
  return injection && injection.result;
}

/** HTML / SVG / PNG snapshot of the page. */
export function exportSnapshot(tabId, format, options) {
  return run(tabId, {
    files: ['content.js'],
    func: (f, o) => window.__gxExport(f, o),
    args: [format, options],
  });
}

/** XLSX / JSON export of the data every panel is displaying. */
export async function exportData(tabId, format, { loadAll }) {
  await run(tabId, {
    files: ['content.js'],
    func: (o) => window.__gxPrepare(o),
    args: [{ loadAll }],
  });
  return run(tabId, {
    files: ['data.js'],
    func: (f) => window.__gxData(f),
    args: [format],
    world: 'MAIN',
  });
}

export async function looksLikeGrafana(tabId) {
  return run(tabId, {
    func: () =>
      !!document.querySelector('.react-grid-layout, [data-viz-panel-key], [data-panelid]') ||
      /grafana/i.test(document.title),
  });
}

/** Toggles Grafana's kiosk mode, which hides the navigation so only panels are exported. */
export function kioskUrl(url) {
  const next = new URL(url);
  if (next.searchParams.has('kiosk')) next.searchParams.delete('kiosk');
  else next.searchParams.set('kiosk', 'true');
  return next.toString();
}
