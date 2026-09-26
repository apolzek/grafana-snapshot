import { extractCssUrls, isLocalUrl, replaceCssUrls, resolveUrl } from './css-text.js';

const XLINK_NS = 'http://www.w3.org/1999/xlink';
const FETCH_TIMEOUT_MS = 15_000;

function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * Fetches resources as data: URLs, deduplicating concurrent requests. Runs in the page's
 * origin: Grafana's own assets are fetched with the user's session, while cookies are
 * never sent to third-party hosts.
 * Resolves to null when a resource cannot be fetched (CORS, 404, timeout).
 */
export function createFetcher() {
  const cache = new Map();
  return function fetchAsDataURL(url) {
    if (!url || url.startsWith('data:')) return Promise.resolve(url);
    if (!cache.has(url)) {
      cache.set(
        url,
        (async () => {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
          try {
            const res = await fetch(url, { credentials: 'same-origin', signal: ctrl.signal });
            return res.ok ? await blobToDataURL(await res.blob()) : null;
          } catch {
            return null;
          } finally {
            clearTimeout(timer);
          }
        })()
      );
    }
    return cache.get(url);
  };
}

/** Inlines every url(...) of a CSS string; unreachable ones become absolute URLs. */
export async function inlineCssUrls(css, base, fetchAsDataURL) {
  const map = new Map();
  await Promise.all(
    [...extractCssUrls(css)].map(async (u) => {
      const full = resolveUrl(u, base);
      map.set(u, (await fetchAsDataURL(full)) || full);
    })
  );
  return replaceCssUrls(css, (u) => map.get(u));
}

/** Embeds <img>, SVG <image> and inline-style images of the cloned tree. */
export async function inlineResources(root, fetchAsDataURL) {
  const tasks = [];
  const base = document.baseURI;

  for (const img of root.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src');
    img.removeAttribute('srcset');
    img.removeAttribute('loading');
    if (isLocalUrl(src)) continue;
    const full = resolveUrl(src, base);
    tasks.push(fetchAsDataURL(full).then((d) => img.setAttribute('src', d || full)));
  }

  for (const image of root.querySelectorAll('image')) {
    const href = image.getAttribute('href') || image.getAttributeNS(XLINK_NS, 'href');
    if (isLocalUrl(href)) continue;
    const full = resolveUrl(href, base);
    tasks.push(
      fetchAsDataURL(full).then((d) => {
        image.removeAttributeNS(XLINK_NS, 'href');
        image.setAttribute('href', d || full);
      })
    );
  }

  for (const el of root.querySelectorAll('[style*="url("]')) {
    tasks.push(
      inlineCssUrls(el.getAttribute('style'), base, fetchAsDataURL).then((s) => el.setAttribute('style', s))
    );
  }

  await Promise.all(tasks);
}
