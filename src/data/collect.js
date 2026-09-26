// Reading the data each rendered panel is displaying, from React's internal fiber tree.
//
// Every panel plugin component receives `{ id, title, data: PanelData, fieldConfig,
// timeRange, timeZone, ... }` as props. `data.series` are the frames *after*
// transformations and field config, i.e. exactly what the panel draws. This works across
// Grafana versions (classic and Scenes dashboards) and needs no re-query.

export const PANEL_SELECTOR = '[data-viz-panel-key], .react-grid-item, [data-panelid]';

const MAX_START_NODES = 60;
const MAX_DEPTH = 150;

export function fiberOf(el) {
  for (const key of Object.keys(el)) {
    if (key.startsWith('__reactFiber$')) return el[key];
  }
  return null;
}

export function isPanelProps(props) {
  return !!(props && props.data && Array.isArray(props.data.series) && 'fieldConfig' in props);
}

/**
 * Walks up the fiber tree from elements inside `container` (deepest first, since the
 * visualization sits below the panel header) until the panel plugin's props are found.
 */
export function findPanelProps(container) {
  const elements = container.querySelectorAll('*');
  let tried = 0;
  for (let i = elements.length - 1; i >= 0 && tried < MAX_START_NODES; i--) {
    const start = fiberOf(elements[i]);
    if (!start) continue;
    tried++;
    for (let fiber = start, depth = 0; fiber && depth < MAX_DEPTH; fiber = fiber.return, depth++) {
      if (isPanelProps(fiber.memoizedProps)) return fiber.memoizedProps;
      if (fiber.stateNode === container) break;
    }
  }
  return null;
}

/** Arrays in Grafana >= 10; Vector objects with toArray() before that. */
export function toArray(values) {
  if (Array.isArray(values)) return values;
  if (values && typeof values.toArray === 'function') return values.toArray();
  return Array.from(values || []);
}

/** The series name as shown in the legend. */
export function fieldDisplayName(field) {
  const config = field.config || {};
  const shown = (field.state && field.state.displayName) || config.displayName || config.displayNameFromDS;
  if (shown) return String(shown);
  const labels = field.labels && Object.keys(field.labels).length
    ? ` {${Object.entries(field.labels).map(([k, v]) => `${k}="${v}"`).join(', ')}}`
    : '';
  return (field.name || '') + labels;
}

function toMillis(time) {
  if (time === null || time === undefined) return null;
  const ms = typeof time === 'number' ? time : +time; // moment/dayjs/Date all coerce to epoch ms
  return Number.isFinite(ms) ? ms : null;
}

/** Converts panel props into the plain, serializable shape used by the exporters. */
export function normalizePanel(props, fallbackTitle = '') {
  const range = props.timeRange || props.data.timeRange;
  const from = range ? toMillis(range.from) : null;
  const to = range ? toMillis(range.to) : null;
  return {
    id: props.id ?? null,
    title: String(props.title || fallbackTitle || `Panel ${props.id ?? ''}`).trim(),
    timeZone: props.timeZone || 'browser',
    timeRange: from !== null && to !== null ? { from, to } : null,
    frames: props.data.series.map((frame) => ({
      name: frame.name || '',
      refId: frame.refId || '',
      fields: (frame.fields || []).map((field) => ({
        name: fieldDisplayName(field),
        type: field.type || 'other',
        unit: (field.config && field.config.unit) || undefined,
        labels: field.labels && Object.keys(field.labels).length ? { ...field.labels } : undefined,
        values: toArray(field.values),
      })),
    })),
  };
}

function headerTitle(container) {
  const heading = container.querySelector('h2, h6, [data-testid*="panel header" i] [title]');
  return heading ? heading.textContent.trim() : '';
}

/** All rendered panels of the page, in document order, deduplicated. */
export function collectPanels(root = document) {
  const seen = new Set();
  const panels = [];
  for (const container of root.querySelectorAll(PANEL_SELECTOR)) {
    const props = findPanelProps(container);
    if (!props || seen.has(props.data)) continue;
    seen.add(props.data);
    panels.push(normalizePanel(props, headerTitle(container)));
  }
  return panels;
}
