#!/usr/bin/env node
// Throwaway helper: opens the webapp in a headed Chromium (snap) using the same
// persistent .browser-data profile as browser.js, and STAYS OPEN for manual review.
// Console errors + failed requests are appended to scratchpad/manual-browser-errors.log.
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dirname, '..', '.browser-data');
const logPath = process.env.ERR_LOG || '/tmp/manual-browser-errors.log';
const url = process.env.APP_URL || 'http://localhost:5173/';

function logLine(s) {
  const line = `[${new Date().toISOString()}] ${s}\n`;
  process.stdout.write(line);
  try { fs.appendFileSync(logPath, line); } catch {}
}

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  executablePath: '/snap/bin/chromium',
  // viewport:null -> page uses the REAL window content size, so a `position:fixed`
  // bottom nav pins to the visible window bottom (no off-screen clipping). Keep the
  // window narrow so the mobile layout (bottom tab bar) stays active.
  viewport: null,
  args: ['--window-size=400,760', '--window-position=60,0'],
});

const page = context.pages()[0] || await context.newPage();

page.on('console', msg => {
  if (msg.type() === 'error') logLine(`CONSOLE-ERROR: ${msg.text()}`);
});
page.on('pageerror', err => logLine(`PAGE-ERROR: ${err.message}`));
page.on('requestfailed', req =>
  logLine(`REQUEST-FAILED: ${req.method()} ${req.url()} — ${req.failure()?.errorText || ''}`));
page.on('response', res => {
  if (res.status() >= 400) logLine(`HTTP-${res.status()}: ${res.request().method()} ${res.url()}`);
});

logLine(`Opening ${url}`);
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  logLine(`Loaded. Title: ${await page.title()}`);
} catch (e) {
  logLine(`Failed to open ${url}: ${e.message}`);
}

// Keep the process (and browser window) alive until the browser is closed.
context.on('close', () => { logLine('Browser closed — exiting.'); process.exit(0); });
await new Promise(() => {}); // never resolves
