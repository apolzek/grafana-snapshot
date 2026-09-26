// Pure string helpers for CSS processing (no DOM access; unit-tested in Node).

const CSS_URL_RE = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)'"]*?))\s*\)/g;

const urlOf = (a, b, c) => (a ?? b ?? c ?? '').trim();

/** URLs that must be left untouched: already inline, fragment refs (SVG filters), etc. */
export function isLocalUrl(url) {
  return !url || /^(data:|#|about:|blob:)/i.test(url);
}

export function resolveUrl(url, base) {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

/** Distinct url(...) references in a CSS string, excluding local ones. */
export function extractCssUrls(css) {
  const urls = new Set();
  for (const m of css.matchAll(CSS_URL_RE)) {
    const u = urlOf(m[1], m[2], m[3]);
    if (!isLocalUrl(u)) urls.add(u);
  }
  return urls;
}

/** Replaces url(...) references using `map(original) -> replacement | undefined`. */
export function replaceCssUrls(css, map) {
  return css.replace(CSS_URL_RE, (match, a, b, c) => {
    const u = urlOf(a, b, c);
    if (isLocalUrl(u)) return match;
    const next = map(u);
    return next === undefined ? match : `url("${next.replace(/"/g, '%22')}")`;
  });
}

/** Makes relative url(...) references absolute so the file works outside the Grafana origin. */
export function absolutizeCssUrls(css, base) {
  return replaceCssUrls(css, (u) => resolveUrl(u, base));
}

const DYNAMIC_PSEUDO =
  /::?(?:hover|focus-visible|focus-within|focus|active|visited|any-link|link|target|before|after|first-line|first-letter|placeholder-shown|placeholder|selection|marker|backdrop|file-selector-button|-webkit-[\w-]+|-moz-[\w-]+|-ms-[\w-]+)(?:\([^()]*\))?/gi;

/**
 * Removes pseudo-classes/elements that depend on interaction or generate content, so
 * `document.querySelector` can tell whether a rule could apply to anything on the page.
 */
export function stripDynamicPseudo(selector) {
  return selector.replace(DYNAMIC_PSEUDO, '').trim();
}

/**
 * Inside SVG <foreignObject> there is no <html>/<body>/:root of the page, so those are
 * replaced by wrapper classes.
 */
export function rewriteRootSelectors(selector) {
  return selector
    .replace(/:root\b/g, '.gx-html')
    .replace(/(^|[\s,>+~(])html(?=$|[\s,.:#[>+~)])/g, '$1.gx-html')
    .replace(/(^|[\s,>+~(])body(?=$|[\s,.:#[>+~)])/g, '$1.gx-body');
}

/** Rewrites the selector part of a serialized style rule ("sel { decls }"). */
export function rewriteRuleSelectors(cssText) {
  const i = cssText.indexOf('{');
  if (i < 0) return cssText;
  return rewriteRootSelectors(cssText.slice(0, i)) + cssText.slice(i);
}

export function normalizeFontFamily(family) {
  return String(family || '')
    .replace(/["']/g, '')
    .trim()
    .toLowerCase();
}

export function normalizeUnicodeRange(range) {
  return String(range || 'U+0-10FFFF')
    .replace(/\s+/g, '')
    .toLowerCase();
}

/** Prevents a stylesheet from closing the <style> element it is embedded in. */
export function escapeStyleContent(css) {
  return css.replace(/<\/style/gi, '<\\/style');
}
