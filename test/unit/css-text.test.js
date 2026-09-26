import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  absolutizeCssUrls,
  escapeStyleContent,
  extractCssUrls,
  normalizeFontFamily,
  normalizeUnicodeRange,
  replaceCssUrls,
  rewriteRootSelectors,
  rewriteRuleSelectors,
  stripDynamicPseudo,
} from '../../src/content/css-text.js';

const BASE = 'https://grafana.example.com/public/build/app.css';

describe('CSS url() handling', () => {
  it('extracts quoted and unquoted URLs, skipping local ones', () => {
    const css = `
      a { background: url(img/a.png) }
      b { background: url("img/b.svg") }
      c { background: url( 'img/c.gif' ) }
      d { filter: url(#blur); background: url(data:image/png;base64,AAAA) }
      e { background: url(blob:https://x/1) }`;
    assert.deepEqual([...extractCssUrls(css)], ['img/a.png', 'img/b.svg', 'img/c.gif']);
  });

  it('makes relative URLs absolute against the stylesheet URL', () => {
    assert.equal(
      absolutizeCssUrls('@font-face{src:url(../fonts/inter.woff2)}', BASE),
      '@font-face{src:url("https://grafana.example.com/public/fonts/inter.woff2")}'
    );
    assert.equal(absolutizeCssUrls('x{mask:url(#m)}', BASE), 'x{mask:url(#m)}');
  });

  it('replaces only mapped URLs', () => {
    const out = replaceCssUrls('a{b:url(x.png)} c{d:url(y.png)}', (u) => (u === 'x.png' ? 'data:X' : undefined));
    assert.equal(out, 'a{b:url("data:X")} c{d:url(y.png)}');
  });

  it('keeps data URLs containing parentheses intact when quoted', () => {
    const css = `a{b:url("data:image/svg+xml,<svg>(1)</svg>")}`;
    assert.equal(absolutizeCssUrls(css, BASE), css);
  });
});

describe('stripDynamicPseudo', () => {
  it('removes interaction and generated-content pseudos', () => {
    assert.equal(stripDynamicPseudo('.btn:hover > .icon::before'), '.btn > .icon');
    assert.equal(stripDynamicPseudo('input:focus-visible'), 'input');
    assert.equal(stripDynamicPseudo('input::placeholder'), 'input');
    assert.equal(stripDynamicPseudo('input:placeholder-shown'), 'input');
    assert.equal(stripDynamicPseudo('::-webkit-scrollbar'), '');
  });

  it('keeps structural pseudo-classes', () => {
    assert.equal(stripDynamicPseudo('li:first-child:not(.x)'), 'li:first-child:not(.x)');
    assert.equal(stripDynamicPseudo('input:checked'), 'input:checked');
  });
});

describe('rewriteRootSelectors', () => {
  it('maps :root, html and body to the SVG wrappers', () => {
    assert.equal(rewriteRootSelectors(':root'), '.gx-html');
    assert.equal(rewriteRootSelectors('html, body'), '.gx-html, .gx-body');
    assert.equal(rewriteRootSelectors('body.theme-dark .panel'), '.gx-body.theme-dark .panel');
    assert.equal(rewriteRootSelectors('html>body'), '.gx-html>.gx-body');
    assert.equal(rewriteRootSelectors(':is(html) body'), ':is(.gx-html) .gx-body');
  });

  it('does not touch lookalike names', () => {
    assert.equal(rewriteRootSelectors('.body-wrapper'), '.body-wrapper');
    assert.equal(rewriteRootSelectors('[class*=html]'), '[class*=html]');
    assert.equal(rewriteRootSelectors('tbody td'), 'tbody td');
    assert.equal(rewriteRootSelectors('#htmlPanel'), '#htmlPanel');
  });

  it('only rewrites the selector part of a rule', () => {
    assert.equal(rewriteRuleSelectors('body { content: "body html"; }'), '.gx-body { content: "body html"; }');
  });
});

describe('font matching helpers', () => {
  it('normalizes families and unicode ranges', () => {
    assert.equal(normalizeFontFamily('"Inter"'), 'inter');
    assert.equal(normalizeFontFamily("'Roboto Mono' "), 'roboto mono');
    assert.equal(normalizeUnicodeRange('U+0000-00FF, U+0131'), 'u+0000-00ff,u+0131');
    assert.equal(normalizeUnicodeRange(''), 'u+0-10ffff');
  });
});

describe('escapeStyleContent', () => {
  it('prevents closing the <style> element', () => {
    assert.equal(escapeStyleContent('a{content:"</style><script>"}'), 'a{content:"<\\/style><script>"}');
  });
});
