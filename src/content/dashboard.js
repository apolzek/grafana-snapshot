// Locating the dashboard's scroll container and forcing lazy panels to load.

const GRID_SELECTOR = '.react-grid-layout';
const LOADING_SELECTOR = [
  '[aria-label*="loading bar" i]',
  '[data-testid*="loading bar" i]',
  '.panel-loading',
].join(',');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function isScrollable(el) {
  const overflow = getComputedStyle(el).overflowY;
  return (
    (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') &&
    el.scrollHeight > el.clientHeight + 1
  );
}

/**
 * Grafana <= 11 scrolls the dashboard inside a container element; newer versions may
 * scroll the document itself. Falls back to the largest scrollable element.
 */
export function findScrollContainer() {
  const root = document.scrollingElement || document.documentElement;
  const grid = document.querySelector(GRID_SELECTOR);
  for (let el = grid && grid.parentElement; el && el !== document.body; el = el.parentElement) {
    if (isScrollable(el)) return el;
  }
  if (root.scrollHeight > root.clientHeight + 1) return root;

  let best = null;
  let bestArea = 0;
  for (const el of document.body.querySelectorAll('*')) {
    if (el.clientHeight < innerHeight * 0.4 || !isScrollable(el)) continue;
    const area = el.clientWidth * el.clientHeight;
    if (area > bestArea) {
      best = el;
      bestArea = area;
    }
  }
  return best || root;
}

/** Waits until no panel shows a loading bar (or the timeout expires) and fonts are ready. */
export async function waitForIdle({ timeout = 15_000, onProgress = () => {} } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const busy = [...document.querySelectorAll(LOADING_SELECTOR)].some((el) => el.getClientRects().length > 0);
    if (!busy) break;
    onProgress('Waiting for queries to finish…');
    await sleep(250);
  }
  try {
    await document.fonts.ready;
  } catch {
    /* ignore */
  }
  await nextFrame();
  await nextFrame();
  await sleep(250);
}

/**
 * Grafana renders panels only once they enter the viewport. Scroll through the whole
 * dashboard, wait for the queries, then restore the user's scroll position.
 */
export async function loadAllPanels(container, { onProgress = () => {}, stepDelay = 400 } = {}) {
  const original = container.scrollTop;
  let y = 0;
  for (let i = 0; i < 500; i++) {
    const max = container.scrollHeight - container.clientHeight;
    container.scrollTo({ top: y, behavior: 'instant' });
    onProgress(`Loading panels… ${Math.round((Math.min(y, max) / Math.max(1, max)) * 100)}%`);
    await sleep(stepDelay);
    if (y >= max) break;
    y = Math.min(max, y + Math.max(200, container.clientHeight * 0.8));
  }
  await waitForIdle({ onProgress });
  container.scrollTo({ top: original, behavior: 'instant' });
  await waitForIdle({ timeout: 3000, onProgress });
}

/** Page height once the scroll container is expanded to show all of its content. */
export function estimateFullHeight(container) {
  const root = document.documentElement;
  let height = Math.max(root.scrollHeight, document.body.scrollHeight, innerHeight);
  if (container !== root && container !== document.body && container !== document.scrollingElement) {
    const rect = container.getBoundingClientRect();
    height = Math.max(height, Math.ceil(rect.top + scrollY + container.scrollHeight));
  }
  return height;
}
