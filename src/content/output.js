// Turning the processed clone + CSS into HTML, SVG or PNG.

import { EXPAND_ATTR, SCROLL_ATTR } from './capture.js';
import { escapeStyleContent } from './css-text.js';

const XHTML_NS = 'http://www.w3.org/1999/xhtml';

const escapeAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** CSS added on top of the page's own styles to lay the snapshot out like the live page. */
export function snapshotCss({ width, height, svg, background }) {
  const html = svg ? '.gx-html' : 'html';
  const body = svg ? '.gx-body' : 'body';
  let css =
    `[${EXPAND_ATTR}]{overflow:visible!important;height:auto!important;max-height:none!important;bottom:auto!important}\n` +
    `${html},${body}{min-width:${width}px}`;
  if (svg) {
    css +=
      `\n.gx-html{width:${width}px;height:${height}px;overflow:hidden;background:${background}}` +
      `\n.gx-body{min-height:${height}px}` +
      // An image cannot scroll, and rendered as one, Chrome draws classic scrollbars that
      // take up space and shift the layout.
      `\n.gx-html *{scrollbar-width:none!important}` +
      `\n.gx-html ::-webkit-scrollbar{display:none!important}`;
  }
  return css;
}

export function buildHtml({ body, htmlAttributes, css, width, title, sourceUrl, date, restoreRootScroll }) {
  const attrs = htmlAttributes.map(([n, v]) => ` ${n}="${escapeAttr(v)}"`).join('');
  const restore =
    `<script>addEventListener('load',function(){` +
    `document.querySelectorAll('[${SCROLL_ATTR}]').forEach(function(e){` +
    `var p=e.getAttribute('${SCROLL_ATTR}').split(',');e.scrollTop=+p[0];e.scrollLeft=+p[1];});` +
    (restoreRootScroll ? `scrollTo(${restoreRootScroll.x},${restoreRootScroll.y});` : '') +
    `});</script>`;
  const comment = `Grafana snapshot of ${sourceUrl} taken ${date.toISOString()}`.replace(/--/g, '- -');
  const bodyHtml = body.outerHTML.replace(/<\/body>\s*$/i, restore + '</body>');
  return (
    `<!DOCTYPE html>\n<!-- ${comment} -->\n<html${attrs}>\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=${width}">\n` +
    `<title>${escapeText(title)} (snapshot)</title>\n` +
    `<style id="gx-snapshot-css">\n${escapeStyleContent(css)}\n</style>\n</head>\n${bodyHtml}\n</html>\n`
  );
}

/**
 * Wraps the page in <svg><foreignObject>. <html> and <body> become <div class="gx-html">
 * and <div class="gx-body"> (the CSS was collected with matching selectors).
 * Note: moves the children out of `body`.
 */
export function buildSvg({ body, htmlAttributes, css, width, height, title }) {
  const root = document.createElementNS(XHTML_NS, 'div');
  for (const [name, value] of htmlAttributes) {
    if (name === 'xmlns') continue;
    try {
      root.setAttribute(name, value);
    } catch {
      /* invalid attribute name in XML */
    }
  }
  root.classList.add('gx-html');

  const style = document.createElementNS(XHTML_NS, 'style');
  style.textContent = css;

  const bodyDiv = document.createElementNS(XHTML_NS, 'div');
  for (const attr of body.attributes) {
    try {
      bodyDiv.setAttribute(attr.name, attr.value);
    } catch {
      /* invalid attribute name in XML */
    }
  }
  bodyDiv.classList.add('gx-body');
  while (body.firstChild) bodyDiv.appendChild(body.firstChild);
  root.append(style, bodyDiv);

  const xml = new XMLSerializer().serializeToString(root);
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<title>${escapeText(title)}</title>` +
    `<foreignObject x="0" y="0" width="${width}" height="${height}">${xml}</foreignObject></svg>\n`
  );
}

// Chrome's canvas limits: 32767px per side, ~268M pixels in total.
const MAX_SIDE = 32_000;
const MAX_AREA = 250e6;

export function pngScale(width, height, devicePixelRatio = 1) {
  return Math.max(
    0.1,
    Math.min(devicePixelRatio, MAX_SIDE / width, MAX_SIDE / height, Math.sqrt(MAX_AREA / (width * height)))
  );
}

export async function svgToPng(svgText, width, height) {
  const scale = pngScale(width, height, window.devicePixelRatio || 1);
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('the browser could not render the page as an image'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
  });
  await new Promise((r) => setTimeout(r, 150));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('the page is too large for a PNG'))), 'image/png')
  );
}

export function pageBackground() {
  for (const el of [document.body, document.documentElement]) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(bg)) return bg;
  }
  return '#ffffff';
}
