// Generates the Chrome Web Store images from real exports of the demo dashboard.
//
//   npm run grafana:up
//   GRAFANA_URL=http://localhost:3000 npm run store-assets
//
// Writes store/screenshots/*.png (1280x800), store/promo-small.png (440x280) and
// store/icon-128.png.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { unzipText } from '../test/unit/helpers/unzip.js';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'store');
const grafana = process.env.GRAFANA_URL || 'http://localhost:3000';
const W = 1280;
const H = 800;

execFileSync(process.execPath, [path.join(root, 'scripts/build.mjs'), '--test'], { stdio: 'inherit' });
const dist = path.join(root, 'dist-test');
const extensionId = (await fs.readFile(path.join(dist, 'extension-id.txt'), 'utf8')).trim();
await fs.mkdir(path.join(out, 'screenshots'), { recursive: true });

const context = await chromium.launchPersistentContext('', {
  executablePath: process.env.CHROMIUM_PATH || undefined,
  channel: process.env.CHROMIUM_PATH ? undefined : 'chromium',
  viewport: { width: W, height: H },
  colorScheme: 'dark',
  acceptDownloads: true,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'store-assets-'));
const dataUrl = async (file, type = 'image/png') => `data:${type};base64,${(await fs.readFile(file)).toString('base64')}`;

// --- the dashboard, and real exports through the popup ------------------------------

const dashboard = await context.newPage();
await dashboard.goto(`${grafana}/d/demo/demo-api-production?orgId=1`);
await dashboard.getByText('CPU by host').first().waitFor({ timeout: 60_000 });
await dashboard.waitForTimeout(2500);

const popup = await context.newPage();
await popup.setViewportSize({ width: 320, height: 420 });
await popup.goto(`chrome-extension://${extensionId}/popup.html`);

async function exportVia(selector) {
  await dashboard.bringToFront();
  const download = dashboard.waitForEvent('download', { timeout: 170_000 });
  await popup.click(selector);
  await popup.locator('#status.ok').waitFor({ timeout: 170_000 });
  const saved = await download;
  const file = path.join(tmp, saved.suggestedFilename());
  await saved.saveAs(file);
  return file;
}

const pngFile = await exportVia('button[data-snapshot="png"]');
const xlsxFile = await exportVia('button[data-data="xlsx"]');
const jsonFile = await exportVia('button[data-data="json"]');
await exportVia('button[data-snapshot="html"]'); // leaves the popup showing an HTML export status

await dashboard.bringToFront();
await dashboard.waitForTimeout(500);
const dashboardShot = path.join(tmp, 'dashboard.png');
await dashboard.screenshot({ path: dashboardShot });
const popupShot = path.join(tmp, 'popup.png');
const popupHeight = await popup.evaluate(() => document.body.scrollHeight);
await popup.screenshot({ path: popupShot, clip: { x: 0, y: 0, width: 320, height: popupHeight } });

// --- composition helpers ------------------------------------------------------------

const FONT = `font-family: Inter, "Segoe UI", system-ui, -apple-system, sans-serif;`;
const icon = await fs.readFile(path.join(root, 'extension/icons/icon.svg'), 'utf8');

async function render(html, file, width = W, height = H) {
  const page = await context.newPage();
  await page.setViewportSize({ width, height });
  await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { margin: 0; width: ${width}px; height: ${height}px; overflow: hidden; ${FONT} color: #e6e8eb; }
  </style></head><body>${html}</body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: file });
  await page.close();
}

function caption(title, points) {
  return `
    <div style="display:flex;flex-direction:column;justify-content:center;gap:22px;width:390px;flex:none">
      <div style="width:56px;height:56px">${icon.replace('<svg ', '<svg width="56" height="56" ')}</div>
      <div style="font-size:38px;font-weight:700;line-height:1.15;letter-spacing:-0.5px">${title}</div>
      <ul style="margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:12px;font-size:19px;color:#b7bdc6">
        ${points.map((p) => `<li style="display:flex;gap:10px"><span style="color:#ff8a1f">&#10003;</span>${p}</li>`).join('')}
      </ul>
    </div>`;
}

const backdrop = `background: radial-gradient(1200px 700px at 85% 10%, #2a1a0d 0%, #111217 55%) #111217;`;

// 1. The popup over the live dashboard.
await render(
  `<div style="position:relative;width:${W}px;height:${H}px;background:url('${await dataUrl(dashboardShot)}') 0 0/cover">
     <div style="position:absolute;inset:0;background:rgba(0,0,0,.28)"></div>
     <img src="${await dataUrl(popupShot)}" style="position:absolute;top:14px;right:22px;width:320px;border-radius:10px;
          box-shadow:0 18px 50px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.08)">
   </div>`,
  path.join(out, 'screenshots/1-popup.png')
);

// 2. The full-page PNG export, lazy panels included.
const pngSize = JSON.parse(
  await (async () => {
    const b = await fs.readFile(pngFile);
    return JSON.stringify({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });
  })()
);
const frameHeight = H - 80;
const frameWidth = Math.round((pngSize.w / pngSize.h) * frameHeight);
await render(
  `<div style="display:flex;gap:48px;align-items:center;justify-content:center;height:100%;padding:0 56px;${backdrop}">
     ${caption('The whole dashboard, in one file', [
       'HTML, SVG or PNG',
       'Panels below the fold are loaded first',
       'Your theme, time range and variables',
       'Opens offline, no Grafana needed',
     ])}
     <div style="flex:none;border-radius:10px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.1)">
       <div style="height:26px;background:#2b2e33;display:flex;align-items:center;gap:6px;padding:0 10px">
         <i style="width:10px;height:10px;border-radius:50%;background:#ff5f57"></i>
         <i style="width:10px;height:10px;border-radius:50%;background:#febc2e"></i>
         <i style="width:10px;height:10px;border-radius:50%;background:#28c840"></i>
         <span style="margin-left:10px;font-size:12px;color:#9da5b0">${path.basename(pngFile)}</span>
       </div>
       <img src="${await dataUrl(pngFile)}" style="display:block;width:${frameWidth}px;height:${frameHeight - 26}px;object-fit:cover;object-position:top">
     </div>
   </div>`,
  path.join(out, 'screenshots/2-full-dashboard.png')
);

// 3. The panel data, as it appears in the spreadsheet.
const data = JSON.parse(await fs.readFile(jsonFile, 'utf8'));
const cpu = data.panels.find((p) => p.title === 'CPU by host');
const time = cpu.frames[0].fields.find((f) => f.type === 'time').values;
const series = cpu.frames.flatMap((fr) => fr.fields.filter((f) => f.type === 'number'));
const workbook = (await unzipText(await fs.readFile(xlsxFile))).get('xl/workbook.xml');
const sheets = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const cols = ['Time', ...series.map((s) => `${s.name} (${s.unit})`)];
const rows = time.slice(0, 17).map((t, i) => [fmtTime(t), ...series.map((s) => s.values[i]?.toFixed(2) ?? '')]);
const cell = 'border-right:1px solid #d5d8dc;border-bottom:1px solid #d5d8dc;padding:4px 10px;white-space:nowrap';
const letters = ['', 'A', 'B', 'C', 'D'];
await render(
  `<div style="display:flex;gap:48px;align-items:center;justify-content:center;height:100%;padding:0 56px;${backdrop}">
     ${caption("Every panel's data, in one spreadsheet", [
       'One sheet per panel, plus a summary',
       'Time series joined by timestamp',
       'Real Excel dates and numbers',
       'Or one JSON file for scripts',
     ])}
     <div style="flex:none;width:700px;border-radius:10px;overflow:hidden;background:#fff;color:#1f2328;font-size:13px;
                 box-shadow:0 20px 60px rgba(0,0,0,.6)">
       <div style="height:34px;background:#1d6f42;color:#fff;display:flex;align-items:center;padding:0 14px;font-size:13px;font-weight:600">
         ${path.basename(xlsxFile)}
       </div>
       <table style="border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums">
         <tr style="background:#f3f4f6;color:#6b7280;font-size:12px">${letters
           .map((l) => `<td style="${cell};text-align:center;${l ? '' : 'width:34px'}">${l}</td>`)
           .join('')}</tr>
         <tr><td style="${cell};background:#f3f4f6;color:#6b7280;text-align:center">1</td>${cols
           .map((c) => `<td style="${cell};font-weight:700">${c}</td>`)
           .join('')}</tr>
         ${rows
           .map(
             (r, i) =>
               `<tr><td style="${cell};background:#f3f4f6;color:#6b7280;text-align:center">${i + 2}</td>${r
                 .map((v, j) => `<td style="${cell};${j ? 'text-align:right' : ''}">${v}</td>`)
                 .join('')}</tr>`
           )
           .join('')}
       </table>
       <div style="display:flex;background:#f3f4f6;border-top:1px solid #d5d8dc;font-size:12px;overflow:hidden;white-space:nowrap">
         ${sheets
           .slice(0, 6)
           .map(
             (s) =>
               `<span style="padding:7px 12px;border-right:1px solid #d5d8dc;${s === 'CPU by host' ? 'background:#fff;color:#1d6f42;font-weight:700' : 'color:#4b5563'}">${s}</span>`
           )
           .join('')}
         <span style="padding:7px 12px;color:#9ca3af">+${Math.max(0, sheets.length - 6)} more</span>
       </div>
     </div>
   </div>`,
  path.join(out, 'screenshots/3-panel-data.png')
);

// Small promo tile.
await render(
  `<div style="height:100%;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:0 34px;${backdrop}">
     <div style="display:flex;align-items:center;gap:14px">
       <div style="width:64px;height:64px;flex:none">${icon.replace('<svg ', '<svg width="64" height="64" ')}</div>
       <div style="font-size:27px;font-weight:700;line-height:1.1">Dashboard Snapshot<br><span style="font-weight:400;color:#b7bdc6;font-size:20px">for Grafana</span></div>
     </div>
     <div style="font-size:17px;color:#d6dae0;line-height:1.35">Export dashboards exactly as you see them, and every panel's data.</div>
   </div>`,
  path.join(out, 'promo-small.png'),
  440,
  280
);

await fs.copyFile(path.join(root, 'extension/icons/icon128.png'), path.join(out, 'icon-128.png'));
await context.close();
await fs.rm(tmp, { recursive: true, force: true });
console.log('Store assets written to store/');
