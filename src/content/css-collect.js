import {
  absolutizeCssUrls,
  normalizeFontFamily,
  normalizeUnicodeRange,
  resolveUrl,
  rewriteRuleSelectors,
  stripDynamicPseudo,
} from './css-text.js';
import { inlineCssUrls } from './resources.js';

/**
 * Serializes the page's stylesheets into one CSS string.
 *
 * Grafana styles components with emotion, which inserts rules through the CSSOM: the
 * <style> elements have no text, so rules must be read from document.styleSheets.
 *
 * - Media queries are frozen to their current state, so the export keeps the layout the
 *   user was looking at regardless of the viewer's window size.
 * - With `pruneCss`, rules whose selectors match nothing on the page are dropped.
 * - With `embedFonts`, only the @font-face rules the browser actually loaded are inlined.
 * - With `svg`, html/body/:root selectors are mapped to the foreignObject wrappers.
 *
 * Caches are per instance: create a new collector for every export.
 */
export function createCssCollector({ svg, pruneCss, embedFonts, fetchAsDataURL, onProgress = () => {} }) {
  const selectorCache = new Map();
  const imports = [];
  let loadedFaces = null;

  function mediaMatches(text) {
    if (!text || text === 'all') return true;
    try {
      return matchMedia(text).matches;
    } catch {
      return true;
    }
  }

  function selectorUsed(selector) {
    let used = selectorCache.get(selector);
    if (used === undefined) {
      try {
        const s = stripDynamicPseudo(selector);
        used = s ? document.querySelector(s) !== null : true;
      } catch {
        used = true; // unsupported selector: keep the rule
      }
      selectorCache.set(selector, used);
    }
    return used;
  }

  function fontFaceLoaded(rule) {
    if (!loadedFaces) {
      loadedFaces = new Set();
      document.fonts.forEach((f) => {
        if (f.status === 'loaded') {
          loadedFaces.add(normalizeFontFamily(f.family) + '|' + normalizeUnicodeRange(f.unicodeRange));
        }
      });
    }
    const family = normalizeFontFamily(rule.style.getPropertyValue('font-family'));
    const range = normalizeUnicodeRange(rule.style.getPropertyValue('unicode-range'));
    return loadedFaces.has(family + '|' + range);
  }

  async function nested(rule, base, wrap) {
    const inner = await serializeRules(rule.cssRules, base);
    return inner ? wrap(inner) : '';
  }

  async function serializeRule(rule, base) {
    if (rule instanceof CSSStyleRule) {
      if (pruneCss && !selectorUsed(rule.selectorText)) return '';
      const text = svg ? rewriteRuleSelectors(rule.cssText) : rule.cssText;
      return absolutizeCssUrls(text, base);
    }
    if (rule instanceof CSSMediaRule) {
      return mediaMatches(rule.media.mediaText) ? serializeRules(rule.cssRules, base) : '';
    }
    if (rule instanceof CSSSupportsRule) {
      return nested(rule, base, (inner) => `@supports ${rule.conditionText}{${inner}}`);
    }
    if (rule instanceof CSSFontFaceRule) {
      return embedFonts && fontFaceLoaded(rule)
        ? inlineCssUrls(rule.cssText, base, fetchAsDataURL)
        : absolutizeCssUrls(rule.cssText, base);
    }
    if (rule instanceof CSSImportRule) {
      if (!mediaMatches(rule.media.mediaText)) return '';
      let rules = null;
      try {
        rules = rule.styleSheet && rule.styleSheet.cssRules;
      } catch {
        /* cross-origin import */
      }
      if (rules) return serializeRules(rules, rule.styleSheet.href || resolveUrl(rule.href, base));
      imports.push(`@import url("${resolveUrl(rule.href, base)}");`);
      return '';
    }
    if (typeof CSSLayerBlockRule !== 'undefined' && rule instanceof CSSLayerBlockRule) {
      return nested(rule, base, (inner) => `@layer ${rule.name}{${inner}}`);
    }
    if (typeof CSSContainerRule !== 'undefined' && rule instanceof CSSContainerRule) {
      return nested(rule, base, (inner) => `@container ${rule.conditionText}{${inner}}`);
    }
    // @keyframes, @property, @page, @layer statements…
    return absolutizeCssUrls(rule.cssText, base);
  }

  async function serializeRules(rules, base) {
    const out = [];
    for (const rule of rules) {
      try {
        const text = await serializeRule(rule, base);
        if (text) out.push(text);
      } catch {
        /* skip a rule that cannot be serialized */
      }
    }
    return out.join('\n');
  }

  async function collect() {
    const sheets = [...document.styleSheets, ...(document.adoptedStyleSheets || [])];
    const chunks = [];
    let n = 0;
    for (const sheet of sheets) {
      onProgress(`Processing CSS ${++n}/${sheets.length}…`);
      if (sheet.disabled || (sheet.media && !mediaMatches(sheet.media.mediaText))) continue;
      const base = sheet.href || document.baseURI;
      let rules = null;
      try {
        rules = sheet.cssRules;
      } catch {
        /* cross-origin sheet: rules are not readable */
      }
      if (rules) {
        chunks.push(await serializeRules(rules, base));
      } else if (sheet.href) {
        try {
          const res = await fetch(sheet.href);
          if (!res.ok) throw new Error(String(res.status));
          chunks.push(absolutizeCssUrls(await res.text(), sheet.href));
        } catch {
          imports.push(`@import url("${sheet.href}");`);
        }
      }
    }
    // @import must precede every other rule.
    return [...imports, ...chunks].join('\n');
  }

  return { collect };
}
