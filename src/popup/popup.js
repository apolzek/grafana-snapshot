import * as actions from './actions.js';

const OPTION_IDS = ['loadAll', 'expand', 'embedFonts', 'pruneCss'];
const STORAGE_KEY = 'gx-options';

const statusEl = document.getElementById('status');
const buttons = [...document.querySelectorAll('button[data-snapshot], button[data-data]')];
let activeTabId = null;

function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = `status ${kind}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readOptions() {
  return Object.fromEntries(OPTION_IDS.map((id) => [id, document.getElementById(id).checked]));
}

function restoreOptions() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    /* ignore corrupt settings */
  }
  for (const id of OPTION_IDS) {
    const input = document.getElementById(id);
    if (id in saved) input.checked = !!saved[id];
    input.addEventListener('change', () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(readOptions()));
      } catch {
        /* storage unavailable */
      }
    });
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function describeError(error) {
  const message = String((error && error.message) || error).replace(/\.+$/, '');
  if (/cannot be scripted|chrome:\/\/|Cannot access/i.test(message)) {
    return `${message}. Browser pages (chrome://, the Web Store) cannot be captured.`;
  }
  return message;
}

async function runExport(label, task) {
  buttons.forEach((b) => (b.disabled = true));
  setStatus(`${label}…`);
  try {
    const tab = await getActiveTab();
    activeTabId = tab.id;
    const result = await task(tab.id);
    if (result && result.ok) {
      const details = [formatSize(result.size), `${(result.ms / 1000).toFixed(1)}s`];
      if (result.panels !== undefined) details.unshift(`${result.panels} panels, ${result.series} series`);
      const warnings = result.warnings && result.warnings.length ? ` — ${result.warnings.join('; ')}` : '';
      setStatus(`Saved ${result.filename} (${details.join(', ')})${warnings}`, 'ok');
    } else {
      setStatus(`Error: ${(result && result.error) || 'unknown failure'}`, 'err');
    }
  } catch (e) {
    setStatus(`Error: ${describeError(e)}`, 'err');
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === 'gx-progress' && (!sender.tab || sender.tab.id === activeTabId)) {
    setStatus(message.text);
  }
});

for (const button of buttons) {
  button.addEventListener('click', () => {
    const options = readOptions();
    if (button.dataset.snapshot) {
      runExport('Starting', (tabId) => actions.exportSnapshot(tabId, button.dataset.snapshot, options));
    } else {
      runExport('Loading panels', (tabId) => actions.exportData(tabId, button.dataset.data, options));
    }
  });
}

document.getElementById('kiosk').addEventListener('click', async () => {
  try {
    const tab = await getActiveTab();
    await chrome.tabs.update(tab.id, { url: actions.kioskUrl(tab.url) });
    window.close();
  } catch (e) {
    setStatus(`Error: ${describeError(e)}`, 'err');
  }
});

restoreOptions();
getActiveTab()
  .then((tab) => actions.looksLikeGrafana(tab.id))
  .then((isGrafana) => {
    document.getElementById('warn').hidden = !!isGrafana;
  })
  .catch(() => {
    /* page cannot be scripted; an export attempt will report why */
  });

// Test hook: end-to-end tests open this page in a tab and drive exports directly.
window.gxActions = actions;
