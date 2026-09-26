// Data export, injected into the page's MAIN world: React's fiber tree is only visible
// to the page's own JavaScript, not to isolated content scripts.
// Exposes window.__gxData(format).

import { downloadBlob } from '../shared/download.js';
import { dashboardTitle, makeFilename } from '../shared/filename.js';
import { collectPanels } from './collect.js';
import { buildJson } from './json.js';
import { buildXlsx } from './xlsx.js';

async function exportData(format) {
  const started = performance.now();
  if (format !== 'xlsx' && format !== 'json') return { ok: false, error: `unknown format: ${format}` };

  const panels = collectPanels(document);
  if (!panels.length) {
    return { ok: false, error: 'no panel data found — is this a Grafana dashboard?' };
  }

  const meta = { dashboard: dashboardTitle(document.title), url: location.href, exportedAt: new Date() };
  let blob;
  let warnings = [];
  if (format === 'json') {
    blob = new Blob([JSON.stringify(buildJson(panels, meta), null, 2)], { type: 'application/json' });
  } else {
    ({ blob, warnings } = await buildXlsx(panels, { ...meta, formatDate: (ms) => new Date(ms).toLocaleString() }));
  }

  const filename = makeFilename('grafana-data', document.title, format);
  downloadBlob(blob, filename);
  const series = panels.reduce(
    (n, p) => n + p.frames.reduce((m, f) => m + f.fields.filter((x) => x.type !== 'time').length, 0),
    0
  );
  return {
    ok: true,
    filename,
    size: blob.size,
    ms: Math.round(performance.now() - started),
    panels: panels.length,
    series,
    warnings,
  };
}

// Always (re)define: this runs in the page's world, where a stale or foreign definition
// must not be trusted.
window.__gxData = async (format) => {
  try {
    return await exportData(format);
  } catch (e) {
    console.error('[Dashboard Snapshot]', e);
    return { ok: false, error: String((e && e.message) || e) };
  }
};
