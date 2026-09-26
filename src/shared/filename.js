/** Strips Grafana's " - Dashboards - Grafana" suffix from a document title. */
export function dashboardTitle(docTitle) {
  const title = String(docTitle || '')
    .replace(/\s+-\s+(Dashboards|Grafana)\b.*$/i, '')
    .trim();
  return title || 'dashboard';
}

/** ASCII-only, filesystem-safe slug. */
export function slugify(text, maxLength = 80) {
  const slug = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, maxLength)
    .replace(/[-.]+$/, '');
  return slug || 'dashboard';
}

export function timestamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}_` +
    `${p(date.getHours())}-${p(date.getMinutes())}-${p(date.getSeconds())}`
  );
}

/** e.g. grafana_My-Dashboard_2026-09-26_10-36-25.html */
export function makeFilename(prefix, docTitle, ext, date = new Date()) {
  return `${prefix}_${slugify(dashboardTitle(docTitle))}_${timestamp(date)}.${ext}`;
}
