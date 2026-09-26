import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { kioskUrl } from '../../src/popup/actions.js';
import { pngScale, snapshotCss } from '../../src/content/output.js';

describe('kioskUrl', () => {
  it('toggles the kiosk parameter, keeping everything else', () => {
    const on = kioskUrl('https://g.example/d/abc/demo?orgId=1&from=now-6h');
    assert.equal(on, 'https://g.example/d/abc/demo?orgId=1&from=now-6h&kiosk=true');
    assert.equal(kioskUrl(on), 'https://g.example/d/abc/demo?orgId=1&from=now-6h');
    assert.equal(kioskUrl('https://g.example/d/abc?kiosk'), 'https://g.example/d/abc');
  });
});

describe('pngScale', () => {
  it('uses the device pixel ratio for normal pages', () => {
    assert.equal(pngScale(1600, 3000, 2), 2);
    assert.equal(pngScale(1600, 3000, 1), 1);
  });

  it('stays within Chrome canvas limits for huge pages', () => {
    const w = 1920;
    const h = 60_000;
    const s = pngScale(w, h, 2);
    assert.ok(w * s <= 32_000 && h * s <= 32_000);
    assert.ok(w * s * h * s <= 250e6);
  });
});

describe('snapshotCss', () => {
  it('expands marked containers in every format', () => {
    for (const svg of [false, true]) {
      const css = snapshotCss({ width: 1600, height: 3000, svg, background: '#111' });
      assert.match(css, /\[data-gx-expand\]\{overflow:visible!important;height:auto!important/);
      assert.match(css, svg ? /\.gx-html,\.gx-body\{min-width:1600px\}/ : /html,body\{min-width:1600px\}/);
    }
  });

  it('sizes the SVG canvas and hides scrollbars, which an image cannot use', () => {
    const css = snapshotCss({ width: 1600, height: 3000, svg: true, background: 'rgb(17, 18, 23)' });
    assert.match(css, /\.gx-html\{width:1600px;height:3000px;overflow:hidden;background:rgb\(17, 18, 23\)\}/);
    assert.match(css, /scrollbar-width:none/);
    assert.doesNotMatch(snapshotCss({ width: 1600, height: 3000, svg: false }), /scrollbar/);
  });
});
