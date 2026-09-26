// End-to-end tests against a mock dashboard (no Grafana needed).
import fs from 'node:fs';
import { unzipText } from '../unit/helpers/unzip.js';
import { expect, openExport, readPngSize, test } from './extension.js';

const URL = 'http://127.0.0.1:4174/mock-dashboard.html';
const PANELS = 8;

test.describe('mock dashboard', () => {
  let page;

  test.beforeEach(async ({ context }) => {
    page = await context.newPage();
    await page.goto(URL);
    await page.selectOption('#env', 'prod');
    await page.fill('#search', 'cpu');
    await page.fill('#secret', 'hunter2');
    // Only the panels in the first screen are rendered until the dashboard is scrolled.
    expect(await page.locator('[data-rendered]').count()).toBeLessThan(PANELS);
  });

  test('HTML snapshot is complete, self-contained and inert', async ({ context, exportVia }) => {
    const { file, filename } = await exportVia(page, 'snapshot', 'html');
    expect(filename).toMatch(/^grafana_Mock-Service_\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d\.html$/);

    const html = fs.readFileSync(file, 'utf8');
    expect(html).not.toContain('should be stripped'); // inline handler removed
    expect(html).not.toContain('hunter2'); // password never exported
    expect(html).not.toContain('unused-rule-for-tests'); // unused CSS pruned
    expect(html).not.toContain('insertRule'); // page scripts removed
    expect(html).toMatch(/<select id="env">.*<option selected="">prod<\/option>/s);
    expect(html).toContain('value="cpu"');

    const snap = await openExport(context, file);
    // Every lazy panel was loaded and its canvas converted to an embedded image.
    const charts = snap.locator('.viz img');
    await expect(charts).toHaveCount(PANELS);
    for (const img of await charts.all()) {
      expect(await img.getAttribute('src')).toMatch(/^data:image\/png;base64,/);
      expect(await img.evaluate((i) => i.naturalWidth)).toBe(600);
    }
    // Relative image embedded; CSSOM + regular stylesheet styles applied.
    expect(await snap.locator('.logo').getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(await snap.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(17, 18, 23)');
    expect(await snap.locator('select').evaluate((s) => getComputedStyle(s).backgroundColor)).toBe('rgb(42, 45, 51)');
    // The whole dashboard is visible without the inner scroll container.
    const lastPanel = await snap.locator('.react-grid-item').last().boundingBox();
    const pageHeight = await snap.evaluate(() => document.documentElement.scrollHeight);
    expect(lastPanel.y + lastPanel.height).toBeLessThanOrEqual(pageHeight);
    expect(pageHeight).toBeGreaterThan(2400);
  });

  test('the live page is left as it was', async ({ exportVia }) => {
    await page.locator('.scroll-view').evaluate((el) => (el.scrollTop = 300));
    await exportVia(page, 'snapshot', 'html');
    expect(await page.locator('.scroll-view').evaluate((el) => el.scrollTop)).toBe(300);
    expect(await page.locator('[data-gx-expand], [data-gx-scroll]').count()).toBe(0);
  });

  test('SVG snapshot is well-formed and renders', async ({ context, exportVia }) => {
    const { file } = await exportVia(page, 'snapshot', 'svg');
    const svg = await openExport(context, file);
    expect(await svg.evaluate(() => document.documentElement.localName)).toBe('svg');
    expect(await svg.locator('parsererror').count()).toBe(0);

    // Rendering it as an <img> is the strictest check: external resources are not allowed.
    const rendered = await svg.evaluate(async (src) => {
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
      await img.decode();
      return { w: img.naturalWidth, h: img.naturalHeight };
    }, fs.readFileSync(file, 'utf8'));
    expect(rendered.w).toBe(1600);
    expect(rendered.h).toBeGreaterThan(2400);
  });

  test('PNG snapshot covers the whole dashboard', async ({ exportVia }) => {
    const { file } = await exportVia(page, 'snapshot', 'png');
    const { width, height } = readPngSize(file);
    expect(width).toBe(1600);
    expect(height).toBeGreaterThan(2400);
  });

  test('visible-area-only option keeps the viewport size', async ({ exportVia }) => {
    const { file } = await exportVia(page, 'snapshot', 'png', { expand: false });
    expect(readPngSize(file)).toEqual({ width: 1600, height: 900 });
  });

  test('Excel export has a summary and one sheet per panel', async ({ exportVia }) => {
    const { file, status } = await exportVia(page, 'data', 'xlsx');
    expect(status).toContain(`${PANELS} panels, ${PANELS} series`);
    const parts = await unzipText(fs.readFileSync(file));
    const workbook = parts.get('xl/workbook.xml');
    const names = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toEqual(['Summary', ...Array.from({ length: PANELS }, (_, i) => `Panel ${i + 1}`)]);
    const sheet = parts.get('xl/worksheets/sheet2.xml');
    expect(sheet).toContain('series-1 (percent)');
    expect((sheet.match(/<row /g) || []).length).toBe(31); // header + 30 points
  });

  test('JSON export contains every panel with its values', async ({ exportVia }) => {
    const { file } = await exportVia(page, 'data', 'json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(data.dashboard).toBe('Mock Service');
    expect(data.panels).toHaveLength(PANELS);
    const [time, value] = data.panels[0].frames[0].fields;
    expect(time.values[0]).toBe('2026-01-15T12:00:00.000Z');
    expect(value).toMatchObject({ name: 'series-1', unit: 'percent' });
    expect(value.values).toHaveLength(30);
    expect(value.values[4]).toBeCloseTo(50 + 40 * Math.sin(1), 2); // mock: 50 + 40·sin(k/4 + i)
  });
});

test('pages without panels report a clear error', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4174/plain.html');
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await page.bringToFront();
  await popup.setChecked('#loadAll', false);
  await popup.click('button[data-data="json"]');
  await expect(popup.locator('#status')).toHaveText(/no panel data found/);
});
