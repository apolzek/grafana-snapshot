// Playwright fixtures: a Chromium with the built extension (dist-test/) loaded, and an
// `exportVia` helper that drives the real popup UI, exactly like a user would.
import fs from 'node:fs';
import path from 'node:path';
import { test as base, chromium, expect } from '@playwright/test';

const dist = path.resolve(import.meta.dirname, '../../dist-test');

export const test = base.extend({
  context: async ({}, use) => {
    if (!fs.existsSync(path.join(dist, 'manifest.json'))) {
      throw new Error('dist-test/ is missing: run the tests with `npm run test:e2e`');
    }
    const context = await chromium.launchPersistentContext('', {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      channel: process.env.CHROMIUM_PATH ? undefined : 'chromium',
      viewport: { width: 1600, height: 900 },
      acceptDownloads: true,
      args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({}, use) => {
    await use(fs.readFileSync(path.join(dist, 'extension-id.txt'), 'utf8').trim());
  },

  /**
   * exportVia(page, 'snapshot' | 'data', format, options?) -> { file, filename, status }
   * Opens the popup, sets the options, clicks the button and saves the download.
   */
  exportVia: async ({ context, extensionId }, use, testInfo) => {
    await use(async (page, kind, format, options = {}) => {
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      for (const [id, checked] of Object.entries(options)) await popup.setChecked(`#${id}`, checked);

      // The popup exports the active tab of its window.
      await page.bringToFront();
      const download = page.waitForEvent('download', { timeout: 170_000 });
      await popup.click(kind === 'data' ? `button[data-data="${format}"]` : `button[data-snapshot="${format}"]`);
      const status = popup.locator('#status');
      await expect(status).toHaveClass(/\b(ok|err)\b/, { timeout: 170_000 });
      const text = await status.textContent();
      if (!/\bok\b/.test(await status.getAttribute('class'))) throw new Error(`export failed: ${text}`);

      const saved = await download;
      const file = testInfo.outputPath(saved.suggestedFilename());
      await saved.saveAs(file);
      await popup.close();
      return { file, filename: saved.suggestedFilename(), status: text };
    });
  },
});

export { expect };

/** Opens an exported file in a fresh tab. */
export async function openExport(context, file) {
  const page = await context.newPage();
  await page.goto(`file://${file}`);
  return page;
}

export function readPngSize(file) {
  const bytes = fs.readFileSync(file);
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
