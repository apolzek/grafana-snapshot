// Content script (isolated world), injected on demand by the popup.
// Exposes window.__gxExport(format, options) and window.__gxPrepare(options).

import { downloadBlob } from '../shared/download.js';
import { makeFilename } from '../shared/filename.js';
import {
  EXPAND_ATTR,
  SCROLL_ATTR,
  markExpanded,
  markScrolled,
  replaceCanvases,
  sanitizeClone,
  syncFormValues,
  unmark,
} from './capture.js';
import { createCssCollector } from './css-collect.js';
import { estimateFullHeight, findScrollContainer, loadAllPanels, waitForIdle } from './dashboard.js';
import { buildHtml, buildSvg, pageBackground, snapshotCss, svgToPng } from './output.js';
import { createFetcher, inlineResources } from './resources.js';

const FORMATS = ['html', 'svg', 'png'];

function progress(text) {
  try {
    chrome.runtime.sendMessage({ type: 'gx-progress', text }).catch(() => {});
  } catch {
    /* popup closed or extension reloaded */
  }
}

async function prepare({ loadAll }) {
  const container = findScrollContainer();
  if (loadAll) await loadAllPanels(container, { onProgress: progress });
  else await waitForIdle({ timeout: 8000, onProgress: progress });
  return container;
}

async function capture(format, options) {
  const started = performance.now();
  const warnings = [];
  const container = await prepare(options);

  progress('Capturing the page…');
  const width = document.documentElement.clientWidth;
  const height = options.expand ? estimateFullHeight(container) : innerHeight;
  const rootScroll = { x: scrollX, y: scrollY };
  const background = pageBackground();

  // Marker attributes exist on the live page only for the instant of cloning.
  const expanded = options.expand ? markExpanded(container) : [];
  const scrolled = markScrolled(new Set(expanded));
  const htmlAttributes = [...document.documentElement.attributes].map((a) => [a.name, a.value]);
  let body;
  try {
    body = document.body.cloneNode(true);
  } finally {
    unmark(expanded, EXPAND_ATTR);
    unmark(scrolled, SCROLL_ATTR);
  }

  progress('Converting charts…');
  const tainted = replaceCanvases(document.body, body);
  if (tainted) warnings.push(`${tainted} cross-origin canvas(es) could not be copied`);
  syncFormValues(document.body, body);
  sanitizeClone(body);

  progress('Embedding images…');
  const fetchAsDataURL = createFetcher();
  await inlineResources(body, fetchAsDataURL);

  const svg = format !== 'html';
  const collector = createCssCollector({
    svg,
    pruneCss: options.pruneCss,
    embedFonts: options.embedFonts,
    fetchAsDataURL,
    onProgress: progress,
  });
  const css = (await collector.collect()) + '\n' + snapshotCss({ width, height, svg, background });

  progress('Building file…');
  const title = document.title;
  let blob;
  if (format === 'html') {
    const html = buildHtml({
      body,
      htmlAttributes,
      css,
      width,
      title,
      sourceUrl: location.href,
      date: new Date(),
      restoreRootScroll: options.expand ? null : rootScroll,
    });
    blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  } else {
    const svgText = buildSvg({ body, htmlAttributes, css, width, height, title });
    if (format === 'svg') {
      blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    } else {
      progress('Rendering PNG…');
      blob = await svgToPng(svgText, width, height);
    }
  }

  const filename = makeFilename('grafana', document.title, format);
  downloadBlob(blob, filename);
  return { ok: true, filename, size: blob.size, ms: Math.round(performance.now() - started), warnings };
}

if (!window.__gxExport) {
  let busy = false;

  window.__gxExport = async (format, options = {}) => {
    if (!FORMATS.includes(format)) return { ok: false, error: `unknown format: ${format}` };
    if (busy) return { ok: false, error: 'an export is already running in this tab' };
    busy = true;
    try {
      return await capture(format, options);
    } catch (e) {
      console.error('[Dashboard Snapshot]', e);
      return { ok: false, error: String((e && e.message) || e) };
    } finally {
      busy = false;
    }
  };

  // Used before a data export so every panel has been rendered with its data.
  window.__gxPrepare = async (options = {}) => {
    await prepare(options);
    return true;
  };
}
