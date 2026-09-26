// Cloning the live DOM into a static, self-contained tree.

export const EXPAND_ATTR = 'data-gx-expand';
export const SCROLL_ATTR = 'data-gx-scroll';

/** Marks the scroll container and its ancestors so the export can show all content. */
export function markExpanded(container) {
  const marked = [];
  for (let el = container; el; el = el.parentElement) {
    el.setAttribute(EXPAND_ATTR, '');
    marked.push(el);
  }
  return marked;
}

/** Records scroll offsets of inner scrolled elements (e.g. tables) so the HTML can restore them. */
export function markScrolled(skip) {
  const marked = [];
  for (const el of document.body.querySelectorAll('*')) {
    if ((el.scrollTop || el.scrollLeft) && !skip.has(el)) {
      el.setAttribute(SCROLL_ATTR, `${el.scrollTop},${el.scrollLeft}`);
      marked.push(el);
    }
  }
  return marked;
}

export function unmark(elements, attr) {
  for (const el of elements) el.removeAttribute(attr);
}

const CANVAS_STYLE_PROPS = [
  'display', 'position', 'top', 'right', 'bottom', 'left', 'width', 'height',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'vertical-align',
  'z-index', 'transform', 'transform-origin', 'opacity', 'float', 'box-sizing',
];

/**
 * Cloned canvases are blank (Grafana's time series are uPlot canvases). Each clone is
 * replaced by an <img> holding the original's current bitmap, with its computed box
 * styles inlined because CSS rules targeting `canvas` no longer apply.
 * Returns the number of canvases that could not be read (tainted by cross-origin content).
 */
export function replaceCanvases(original, clone) {
  const sources = original.querySelectorAll('canvas');
  const targets = clone.querySelectorAll('canvas');
  let tainted = 0;
  sources.forEach((canvas, i) => {
    const target = targets[i];
    if (!target) return;
    const img = document.createElement('img');
    for (const attr of target.attributes) {
      if (attr.name !== 'width' && attr.name !== 'height') img.setAttribute(attr.name, attr.value);
    }
    const cs = getComputedStyle(canvas);
    for (const prop of CANVAS_STYLE_PROPS) img.style.setProperty(prop, cs.getPropertyValue(prop));
    img.style.maxWidth = 'none';
    if (canvas.width && canvas.height) {
      try {
        img.setAttribute('src', canvas.toDataURL('image/png'));
      } catch {
        tainted++;
        img.style.background = 'repeating-linear-gradient(45deg,#8883 0 6px,transparent 6px 12px)';
      }
    }
    target.replaceWith(img);
  });
  return tainted;
}

/** Live form state (typed text, selected options) is not part of the DOM attributes. */
export function syncFormValues(original, clone) {
  const selector = 'input,textarea,select';
  const sources = original.querySelectorAll(selector);
  const targets = clone.querySelectorAll(selector);
  sources.forEach((el, i) => {
    const target = targets[i];
    if (!target) return;
    if (el.tagName === 'INPUT') {
      if (el.type === 'checkbox' || el.type === 'radio') {
        target.toggleAttribute('checked', el.checked);
      } else if (el.type === 'password' || el.type === 'file' || el.type === 'hidden') {
        target.removeAttribute('value'); // never export secrets
      } else {
        target.setAttribute('value', el.value);
      }
    } else if (el.tagName === 'TEXTAREA') {
      target.textContent = el.value;
    } else {
      [...target.options].forEach((opt, j) => opt.toggleAttribute('selected', !!(el.options[j] && el.options[j].selected)));
    }
  });
}

const REMOVED_ELEMENTS = [
  'script', 'noscript', 'style', 'template', 'object', 'embed',
  'link[rel~="stylesheet"]', 'link[rel="preload"]', 'link[rel="modulepreload"]', 'link[rel="prefetch"]',
  'picture source',
].join(',');

const URL_ATTRS = ['href', 'src', 'action', 'formaction', 'xlink:href'];

/**
 * Makes the clone inert and portable: no scripts, no inline event handlers, no
 * javascript: URLs, absolute links. Stylesheets are removed because they are re-embedded.
 */
export function sanitizeClone(root) {
  root.querySelectorAll(REMOVED_ELEMENTS).forEach((el) => el.remove());
  for (const el of [root, ...root.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (URL_ATTRS.includes(name)) {
        const value = attr.value.trim();
        if (/^javascript:/i.test(value)) {
          el.removeAttribute(attr.name);
        } else if (name !== 'src' && value && !value.startsWith('#') && !value.startsWith('data:')) {
          try {
            el.setAttribute(attr.name, new URL(value, document.baseURI).href);
          } catch {
            /* keep as is */
          }
        }
      }
    }
  }
  // Iframes (e.g. text panels embedding pages) would load live content: keep a placeholder box.
  for (const frame of root.querySelectorAll('iframe')) {
    frame.removeAttribute('srcdoc');
    const src = frame.getAttribute('src');
    if (src) {
      try {
        frame.setAttribute('src', new URL(src, document.baseURI).href);
      } catch {
        frame.removeAttribute('src');
      }
    }
    frame.setAttribute('sandbox', '');
  }
}
