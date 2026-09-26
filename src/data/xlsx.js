// XLSX (SpreadsheetML) generation from normalized panels. Pure: no DOM access.
//
// Panel shape (see collect.js):
//   { id, title, timeZone, timeRange: {from, to} | null,
//     frames: [{ name, refId, fields: [{ name, type, unit, labels, values }] }] }

import { zip } from './zip.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const MAX_ROWS = 1_048_576;
export const MAX_COLUMNS = 16_384;
export const MAX_CELL_CHARS = 32_767;

const STYLE_DATE = 1;
const STYLE_BOLD = 2;
const NS_MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

export function escapeXml(value) {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 0 -> A, 25 -> Z, 26 -> AA … */
export function columnName(index) {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** Excel sheet names: max 31 chars, no []:*?/\, no leading/trailing ', unique (case-insensitive). */
export function sheetName(title, used) {
  const base =
    String(title || '')
      .replace(/[[\]:*?/\\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^'+|'+$/g, '')
      .slice(0, 31)
      .trim() || 'Panel';
  let name = /^history$/i.test(base) ? 'History panel' : base;
  for (let i = 2; used.has(name.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    name = base.slice(0, 31 - suffix.length).trimEnd() + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

/**
 * Returns `offset(ms, timeZone)` in milliseconds, so dates in Excel read the same as on the
 * dashboard. timeZone is Grafana's: 'browser' | 'utc' | IANA name.
 */
export function createTimeZoneOffset() {
  const formatters = new Map();
  const cache = new Map();

  function ianaOffset(ms, tz) {
    let fmt = formatters.get(tz);
    if (!fmt) {
      fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      formatters.set(tz, fmt);
    }
    const p = Object.fromEntries(fmt.formatToParts(ms).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return asUtc - Math.floor(ms / 1000) * 1000;
  }

  return function offset(ms, tz) {
    if (tz === 'utc' || tz === 'UTC') return 0;
    // Offsets only change on quarter-hour boundaries: cache per 15 minutes.
    const key = `${tz}|${Math.floor(ms / 900_000)}`;
    let value = cache.get(key);
    if (value === undefined) {
      if (!tz || tz === 'browser') {
        value = -new Date(ms).getTimezoneOffset() * 60_000;
      } else {
        try {
          value = ianaOffset(ms, tz);
        } catch {
          value = -new Date(ms).getTimezoneOffset() * 60_000;
        }
      }
      cache.set(key, value);
    }
    return value;
  };
}

/** Epoch milliseconds (already shifted to local wall time) -> Excel serial date. */
export function excelSerial(localMs) {
  return localMs / 86_400_000 + 25_569;
}

const cellType = (field) =>
  field.type === 'time' ? 'd' : field.type === 'number' ? 'n' : field.type === 'boolean' ? 'b' : 's';

const headerCell = (name, unit) => ({ v: unit ? `${name} (${unit})` : name, s: STYLE_BOLD });

/**
 * Time series: one table joined by timestamp, one column per series (like Grafana's
 * "Series joined by time"). Returns null when the panel is not purely time series.
 */
export function joinByTime(panel) {
  const frames = panel.frames;
  if (!frames.length) return null;
  const timeIndex = [];
  for (const frame of frames) {
    const times = frame.fields.filter((f) => f.type === 'time');
    if (times.length !== 1 || frame.fields.length < 2) return null;
    timeIndex.push(frame.fields.indexOf(times[0]));
  }

  const columns = [];
  frames.forEach((frame, fi) =>
    frame.fields.forEach((field, i) => {
      if (i !== timeIndex[fi]) columns.push({ frame: fi, field });
    })
  );

  const nameCount = new Map();
  for (const c of columns) nameCount.set(c.field.name, (nameCount.get(c.field.name) || 0) + 1);
  const label = (c) => {
    const frame = frames[c.frame];
    const tag = frame.name || frame.refId;
    return nameCount.get(c.field.name) > 1 && tag ? `${c.field.name} [${tag}]` : c.field.name;
  };

  const lookups = columns.map((c) => {
    const times = frames[c.frame].fields[timeIndex[c.frame]].values;
    const map = new Map();
    c.field.values.forEach((v, i) => map.set(times[i], v));
    return map;
  });
  const allTimes = new Set();
  frames.forEach((frame, fi) => {
    for (const t of frame.fields[timeIndex[fi]].values) if (Number.isFinite(t)) allTimes.add(t);
  });
  const times = [...allTimes].sort((a, b) => a - b);

  const rows = [[{ v: 'Time', s: STYLE_BOLD }, ...columns.map((c) => headerCell(label(c), c.field.unit))]];
  for (const t of times) {
    rows.push([{ v: t, t: 'd' }, ...columns.map((c, i) => ({ v: lookups[i].get(t), t: cellType(c.field) }))]);
  }
  return { rows, widths: [20, ...columns.map(() => 18)], freeze: true };
}

/** Tables, bar charts, stats…: frames stacked vertically, each with its own header row. */
export function stackFrames(panel) {
  const rows = [];
  let maxColumns = 0;
  panel.frames.forEach((frame, fi) => {
    if (fi > 0) rows.push([]);
    if (panel.frames.length > 1) rows.push([{ v: frame.name || frame.refId || `Frame ${fi + 1}`, s: STYLE_BOLD }]);
    rows.push(frame.fields.map((f) => headerCell(f.name, f.unit)));
    const length = frame.fields.reduce((n, f) => Math.max(n, f.values.length), 0);
    for (let r = 0; r < length; r++) rows.push(frame.fields.map((f) => ({ v: f.values[r], t: cellType(f) })));
    maxColumns = Math.max(maxColumns, frame.fields.length);
  });
  const widths = Array.from({ length: maxColumns }, (_, i) =>
    panel.frames.some((fr) => fr.fields[i] && fr.fields[i].type === 'time') ? 20 : 18
  );
  return { rows, widths, freeze: panel.frames.length === 1 };
}

export function panelLayout(panel) {
  return joinByTime(panel) || stackFrames(panel);
}

function cellXml(ref, cell, toLocalSerial) {
  if (!cell || cell.v === null || cell.v === undefined || cell.v === '') return '';
  let { v } = cell;
  const style = cell.s ? ` s="${cell.s}"` : '';
  if (cell.t === 'd') {
    return Number.isFinite(v) ? `<c r="${ref}" s="${STYLE_DATE}"><v>${toLocalSerial(v)}</v></c>` : '';
  }
  if (typeof v === 'number') {
    return Number.isFinite(v) ? `<c r="${ref}"${style}><v>${v}</v></c>` : '';
  }
  if (typeof v === 'boolean') return `<c r="${ref}"${style} t="b"><v>${v ? 1 : 0}</v></c>`;
  if (typeof v === 'object') v = JSON.stringify(v);
  const text = String(v).slice(0, MAX_CELL_CHARS);
  return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

export function sheetXml({ rows, widths = [], freeze = false }, toLocalSerial = excelSerial) {
  const out = [XML_HEADER, `<worksheet xmlns="${NS_MAIN}">`];
  if (freeze) {
    out.push(
      '<sheetViews><sheetView workbookViewId="0">' +
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
        '</sheetView></sheetViews>'
    );
  }
  if (widths.length) {
    out.push('<cols>');
    widths.forEach((w, i) => out.push(`<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`));
    out.push('</cols>');
  }
  out.push('<sheetData>');
  rows.forEach((row, r) => {
    if (!row || !row.length) return;
    let cells = '';
    for (let c = 0; c < row.length; c++) cells += cellXml(columnName(c) + (r + 1), row[c], toLocalSerial);
    out.push(`<row r="${r + 1}">${cells}</row>`);
  });
  out.push('</sheetData></worksheet>');
  return out.join('');
}

/** Clamps a layout to Excel's grid limits. */
export function clampLayout(layout, title, warnings) {
  let { rows } = layout;
  if (rows.length > MAX_ROWS) {
    warnings.push(`"${title}": truncated to ${MAX_ROWS} rows`);
    rows = rows.slice(0, MAX_ROWS);
  }
  if (rows.some((r) => r.length > MAX_COLUMNS)) {
    warnings.push(`"${title}": truncated to ${MAX_COLUMNS} columns`);
    rows = rows.map((r) => r.slice(0, MAX_COLUMNS));
  }
  return { ...layout, rows, widths: layout.widths.slice(0, MAX_COLUMNS) };
}

const STYLES_XML =
  XML_HEADER +
  `<styleSheet xmlns="${NS_MAIN}">` +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm:ss"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs></styleSheet>';

/**
 * Builds the workbook parts: a "Summary" sheet followed by one sheet per panel.
 * @returns {{ files: Record<string,string>, sheets: string[], warnings: string[] }}
 */
export function buildWorkbook(panels, { dashboard, url, exportedAt = new Date(), formatDate = (ms) => new Date(ms).toISOString() }) {
  const warnings = [];
  const used = new Set(['summary']);
  const tzOffset = createTimeZoneOffset();
  const sheets = [];

  const summary = [
    [{ v: dashboard, s: STYLE_BOLD }],
    [{ v: 'URL' }, { v: url }],
    [{ v: 'Exported at' }, { v: formatDate(exportedAt.getTime()) }],
    [],
    ['Sheet', 'Panel', 'ID', 'Series', 'Rows', 'Units', 'From', 'To'].map((v) => ({ v, s: STYLE_BOLD })),
  ];

  for (const panel of panels) {
    const name = sheetName(panel.title, used);
    const layout = clampLayout(panelLayout(panel), panel.title, warnings);
    const toLocalSerial = (ms) => excelSerial(ms + tzOffset(ms, panel.timeZone));
    sheets.push({ name, xml: sheetXml(layout, toLocalSerial) });

    const fields = panel.frames.flatMap((f) => f.fields);
    const units = [...new Set(fields.map((f) => f.unit).filter(Boolean))].join(', ');
    const series = fields.filter((f) => f.type !== 'time').length;
    const rowCount = panel.frames.reduce((n, fr) => n + fr.fields.reduce((m, f) => Math.max(m, f.values.length), 0), 0);
    const range = panel.timeRange;
    summary.push([
      { v: name },
      { v: panel.title },
      { v: panel.id ?? '' },
      { v: series },
      { v: rowCount },
      { v: units },
      { v: range ? formatDate(range.from) : '' },
      { v: range ? formatDate(range.to) : '' },
    ]);
  }
  sheets.unshift({ name: 'Summary', xml: sheetXml({ rows: summary, widths: [24, 36, 8, 8, 8, 16, 22, 22] }) });

  const files = {
    '[Content_Types].xml':
      XML_HEADER +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join('') +
      '</Types>',
    '_rels/.rels':
      XML_HEADER +
      `<Relationships xmlns="${NS_PKG_REL}">` +
      `<Relationship Id="rId1" Type="${NS_REL}/officeDocument" Target="xl/workbook.xml"/>` +
      '</Relationships>',
    'xl/workbook.xml':
      XML_HEADER +
      `<workbook xmlns="${NS_MAIN}" xmlns:r="${NS_REL}"><sheets>` +
      sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      XML_HEADER +
      `<Relationships xmlns="${NS_PKG_REL}">` +
      sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="${NS_REL}/styles" Target="styles.xml"/>` +
      '</Relationships>',
    'xl/styles.xml': STYLES_XML,
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = s.xml));

  return { files, sheets: sheets.map((s) => s.name), warnings };
}

export async function buildXlsx(panels, meta) {
  const { files, warnings } = buildWorkbook(panels, meta);
  return { blob: await zip(files, XLSX_MIME), warnings };
}
