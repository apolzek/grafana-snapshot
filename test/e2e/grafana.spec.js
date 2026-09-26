// End-to-end tests against a real Grafana running the demo dashboard
// (test/grafana/dashboards/demo.json). Skipped unless GRAFANA_URL is set:
//
//   npm run grafana:up            # docker, http://localhost:3000
//   GRAFANA_URL=http://localhost:3000 npm run test:e2e
import fs from 'node:fs';
import { unzipText } from '../unit/helpers/unzip.js';
import { expect, openExport, readPngSize, test } from './extension.js';

const GRAFANA_URL = process.env.GRAFANA_URL;
const PANEL_TITLES = [
  'CPU by host',
  'Requests/s',
  'p95 latency',
  'Services',
  'Errors by service',
  'Memory cluster 1',
  'Memory cluster 2',
  'Memory cluster 3',
  'Memory cluster 4',
  'Bottom panel (lazy loaded)',
];

test.describe('real Grafana', () => {
  test.skip(!GRAFANA_URL, 'set GRAFANA_URL to run against a Grafana instance');

  let page;

  test.beforeEach(async ({ context }) => {
    page = await context.newPage();
    await page.goto(`${GRAFANA_URL}/d/demo/demo-api-production?orgId=1`);
    await expect(page.getByText('CPU by host').first()).toBeVisible({ timeout: 60_000 });
  });

  test('HTML snapshot contains every panel, including lazy ones', async ({ context, exportVia }) => {
    const { file } = await exportVia(page, 'snapshot', 'html');
    const html = fs.readFileSync(file, 'utf8');
    for (const title of PANEL_TITLES) expect(html).toContain(title);
    expect(html).not.toMatch(/<script(?![^>]*>addEventListener\('load')/); // only our scroll-restore script

    const snap = await openExport(context, file);
    // Charts are canvases in Grafana: all must have become embedded images.
    const charts = snap.locator('img[src^="data:image/png"]');
    expect(await charts.count()).toBeGreaterThanOrEqual(7);
    const broken = await charts.evaluateAll((imgs) => imgs.filter((i) => !i.complete || i.naturalWidth === 0).length);
    expect(broken).toBe(0);
    await expect(snap.getByText('Bottom panel (lazy loaded)')).toBeVisible();
  });

  test('PNG snapshot covers the whole dashboard', async ({ exportVia }) => {
    const { file } = await exportVia(page, 'snapshot', 'png');
    const { width, height } = readPngSize(file);
    expect(width).toBe(1600);
    expect(height).toBeGreaterThan(1200);
  });

  test('SVG snapshot is well-formed', async ({ context, exportVia }) => {
    const { file } = await exportVia(page, 'snapshot', 'svg');
    const svg = await openExport(context, file);
    expect(await svg.locator('parsererror').count()).toBe(0);
    expect(await svg.evaluate(() => document.querySelectorAll('foreignObject').length)).toBe(1);
  });

  test('JSON export reads every panel with display names and units', async ({ exportVia }) => {
    const { file } = await exportVia(page, 'data', 'json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(data.dashboard).toBe('Demo API Production');
    expect(data.panels.map((p) => p.title).sort()).toEqual([...PANEL_TITLES].sort());

    const cpu = data.panels.find((p) => p.title === 'CPU by host');
    const series = cpu.frames.flatMap((f) => f.fields).filter((f) => f.type === 'number');
    expect(series.map((f) => f.name).sort()).toEqual(['db-1', 'web-1', 'web-2']);
    expect(series.every((f) => f.unit === 'percent' && f.values.length > 100)).toBe(true);

    const services = data.panels.find((p) => p.title === 'Services');
    const names = services.frames[0].fields.map((f) => f.name);
    expect(names).toEqual(['service', 'status', 'errors', 'latency_ms']);
    expect(services.frames[0].fields[0].values).toEqual(['api', 'auth', 'billing', 'search']);
  });

  test('Excel export joins time series and keeps tables', async ({ exportVia }) => {
    const { file } = await exportVia(page, 'data', 'xlsx');
    const parts = await unzipText(fs.readFileSync(file));
    const names = [...parts.get('xl/workbook.xml').matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
    expect(names).toHaveLength(1 + PANEL_TITLES.length);
    expect(names).toContain('Requests s'); // "/" is not allowed in sheet names

    const sheetOf = (name) => parts.get(`xl/worksheets/sheet${names.indexOf(name) + 1}.xml`);
    const cpu = sheetOf('CPU by host');
    for (const header of ['Time', 'web-1 (percent)', 'web-2 (percent)', 'db-1 (percent)']) expect(cpu).toContain(`>${header}<`);
    expect(sheetOf('Services')).toContain('>degraded<');
  });
});
