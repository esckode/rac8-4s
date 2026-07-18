#!/usr/bin/env node
/**
 * Renders packages/frontend/public/icon.svg (Playwright chromium, already a
 * devDep — no new dependency) into the PNG sizes the PWA manifest + iOS need.
 * Re-run after editing icon.svg; outputs are committed as assets.
 *
 * Usage: node scripts/generate-icons.mjs
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'packages', 'frontend', 'public');
const svg = readFileSync(path.join(publicDir, 'icon.svg'), 'utf-8');

const targets = [
  { name: 'icon-192.png', size: 192 },
  { name: 'icon-512.png', size: 512 },
  { name: 'icon-maskable-512.png', size: 512 },
  { name: 'apple-touch-icon.png', size: 180 },
];

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const { name, size } of targets) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`
      <!doctype html>
      <html><head><style>
        html, body { margin: 0; padding: 0; }
        svg { display: block; width: ${size}px; height: ${size}px; }
      </style></head>
      <body>${svg}</body></html>
    `);
    const buffer = await page.screenshot({ omitBackground: false });
    writeFileSync(path.join(publicDir, name), buffer);
    console.log(`wrote ${name} (${size}x${size})`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
