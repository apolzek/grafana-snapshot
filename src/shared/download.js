/**
 * Saves a blob through a detached <a download>. Being detached, the click never
 * bubbles up to Grafana's router, which intercepts link clicks on the document.
 */
export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
