import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  MAX_ROWS,
  buildWorkbook,
  buildXlsx,
  clampLayout,
  columnName,
  createTimeZoneOffset,
  escapeXml,
  excelSerial,
  joinByTime,
  panelLayout,
  sheetName,
  stackFrames,
} from '../../src/data/xlsx.js';
import { T0, tablePanel, timeSeriesPanel } from './fixtures.js';
import { unzipText } from './helpers/unzip.js';

const soffice = (() => {
  for (const bin of ['soffice', 'libreoffice']) {
    try {
      execFileSync(bin, ['--version'], { stdio: 'ignore' });
      return bin;
    } catch {
      /* try next */
    }
  }
  return null;
})();

describe('columnName', () => {
  it('converts indexes to spreadsheet column letters', () => {
    assert.deepEqual([0, 1, 25, 26, 27, 51, 52, 701, 702, 16383].map(columnName), [
      'A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA', 'XFD',
    ]);
  });
});

describe('sheetName', () => {
  it('removes forbidden characters and limits length', () => {
    const used = new Set();
    assert.equal(sheetName('Requests/s [p95]: *api*?', used), 'Requests s p95 api');
    const long = sheetName('x'.repeat(40), used);
    assert.equal(long.length, 31);
  });

  it('deduplicates case-insensitively within 31 characters', () => {
    const used = new Set();
    assert.equal(sheetName('Memory', used), 'Memory');
    assert.equal(sheetName('memory', used), 'memory (2)');
    assert.equal(sheetName('Memory', used), 'Memory (3)');
    const a = sheetName('y'.repeat(31), used);
    const b = sheetName('y'.repeat(31), used);
    assert.notEqual(a, b);
    assert.equal(b.length, 31);
  });

  it('avoids empty, apostrophe-wrapped and reserved names', () => {
    const used = new Set();
    assert.equal(sheetName('', used), 'Panel');
    assert.equal(sheetName("'quoted'", used), 'quoted');
    assert.equal(sheetName('History', used), 'History panel');
  });
});

describe('time zones', () => {
  const offset = createTimeZoneOffset();

  it('handles utc and IANA zones, including DST', () => {
    assert.equal(offset(T0, 'utc'), 0);
    assert.equal(offset(T0, 'America/Sao_Paulo'), -3 * 3600_000);
    assert.equal(offset(Date.UTC(2026, 0, 15), 'Europe/Berlin'), 1 * 3600_000);
    assert.equal(offset(Date.UTC(2026, 6, 15), 'Europe/Berlin'), 2 * 3600_000);
    assert.equal(offset(T0, 'Asia/Kolkata'), 5.5 * 3600_000);
  });

  it('uses the browser offset for "browser" and unknown zones', () => {
    const expected = -new Date(T0).getTimezoneOffset() * 60_000;
    assert.equal(offset(T0, 'browser'), expected);
    assert.equal(offset(T0, 'Not/AZone'), expected);
  });

  it('converts to Excel serial dates', () => {
    assert.equal(excelSerial(0), 25569);
    assert.equal(excelSerial(Date.UTC(2026, 0, 15, 12)), 46037.5);
  });
});

describe('joinByTime', () => {
  it('joins series on the union of timestamps', () => {
    const { rows, freeze } = joinByTime(timeSeriesPanel);
    assert.equal(freeze, true);
    assert.deepEqual(rows[0].map((c) => c.v), ['Time', 'web-1 (percent)', 'web-2 (percent)']);
    assert.equal(rows.length, 1 + 4);
    assert.deepEqual(rows.slice(1).map((r) => r.map((c) => c.v)), [
      [T0, 10, undefined],
      [T0 + 60_000, 20, 1.5],
      [T0 + 120_000, 30, null],
      [T0 + 180_000, undefined, 3.5],
    ]);
  });

  it('disambiguates identical series names from different frames', () => {
    const panel = structuredClone(timeSeriesPanel);
    panel.frames[1].fields[1].name = 'web-1';
    const header = joinByTime(panel).rows[0].map((c) => c.v);
    assert.deepEqual(header, ['Time', 'web-1 [web-1] (percent)', 'web-1 [web-2] (percent)']);
  });

  it('declines panels that are not pure time series', () => {
    assert.equal(joinByTime(tablePanel), null);
    assert.equal(joinByTime({ frames: [] }), null);
  });
});

describe('stackFrames', () => {
  it('writes each frame with its header', () => {
    const { rows } = stackFrames(tablePanel);
    assert.deepEqual(rows.map((r) => r.map((c) => c.v)), [
      ['service', 'healthy', 'errors'],
      ['api', true, 3],
      ['auth & <sso>', false, 17],
    ]);
    assert.deepEqual(panelLayout(tablePanel).rows, rows);
  });

  it('titles and separates multiple frames', () => {
    const panel = { ...tablePanel, frames: [tablePanel.frames[0], { ...tablePanel.frames[0], name: 'second' }] };
    const values = stackFrames(panel).rows.map((r) => r.map((c) => c.v));
    assert.deepEqual(values[0], ['A']); // unnamed frame: labelled by refId
    assert.deepEqual(values[4], []);
    assert.deepEqual(values[5], ['second']);
  });
});

describe('clampLayout', () => {
  it('truncates to Excel limits with a warning', () => {
    const warnings = [];
    const rows = { length: MAX_ROWS + 5, slice: (a, b) => new Array(b - a).fill([]), some: () => false };
    const out = clampLayout({ rows, widths: [] }, 'Huge', warnings);
    assert.equal(out.rows.length, MAX_ROWS);
    assert.match(warnings[0], /Huge.*truncated/);
  });
});

describe('escapeXml', () => {
  it('escapes markup and strips characters invalid in XML', () => {
    assert.equal(escapeXml('a<b>&"c"\u0001￾'), 'a&lt;b&gt;&amp;&quot;c&quot;');
  });
});

describe('buildWorkbook', () => {
  const meta = { dashboard: 'Demo', url: 'https://g/d/demo', exportedAt: new Date(T0) };

  it('creates a summary sheet plus one sheet per panel', async () => {
    const { files, sheets, warnings } = buildWorkbook([timeSeriesPanel, tablePanel], meta);
    assert.deepEqual(sheets, ['Summary', 'CPU by host', 'Services']);
    assert.deepEqual(warnings, []);
    assert.match(files['xl/workbook.xml'], /<sheet name="CPU by host" sheetId="2" r:id="rId2"\/>/);
    assert.match(files['[Content_Types].xml'], /sheet3\.xml/);

    const cpu = files['xl/worksheets/sheet2.xml'];
    assert.match(cpu, /<pane ySplit="1"/);
    // First data row: time as a styled serial date (UTC panel), then the value.
    assert.match(cpu, new RegExp(`<c r="A2" s="1"><v>${excelSerial(T0)}</v></c><c r="B2"><v>10</v></c>`));

    const services = files['xl/worksheets/sheet3.xml'];
    assert.match(services, /<t xml:space="preserve">auth &amp; &lt;sso&gt;<\/t>/);
    assert.match(services, /<c r="B2" t="b"><v>1<\/v><\/c>/);

    const summary = files['xl/worksheets/sheet1.xml'];
    assert.match(summary, />Demo</);
    assert.match(summary, />percent</);
  });

  it('produces a valid zip with every part', async () => {
    const { blob } = await buildXlsx([timeSeriesPanel], meta);
    const parts = await unzipText(await blob.arrayBuffer());
    assert.deepEqual([...parts.keys()].sort(), [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
    ]);
  });

  it('opens in LibreOffice with the expected cells', { skip: !soffice }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gx-xlsx-'));
    const file = path.join(dir, 'book.xlsx');
    const { blob } = await buildXlsx([timeSeriesPanel, tablePanel], meta);
    fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
    execFileSync(soffice, [
      '--headless',
      `-env:UserInstallation=file://${dir}/profile`,
      '--convert-to',
      'csv:Text - txt - csv (StarCalc):44,34,76,1,,0,false,true,false,false,false,-1',
      '--outdir',
      dir,
      file,
    ], { stdio: 'ignore', timeout: 120_000 });
    const cpu = fs.readFileSync(path.join(dir, 'book-CPU by host.csv'), 'utf8').trim().split('\n');
    assert.equal(cpu[0], 'Time,web-1 (percent),web-2 (percent)');
    assert.equal(cpu[1], '2026-01-15 12:00:00,10,');
    assert.equal(cpu[4], '2026-01-15 12:03:00,,3.5');
    const services = fs.readFileSync(path.join(dir, 'book-Services.csv'), 'utf8').trim().split('\n');
    assert.equal(services[2], 'auth & <sso>,FALSE,17');
  });
});
