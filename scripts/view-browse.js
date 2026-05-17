#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dirname, '..', '.browser-data');

async function viewBrowse() {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 500,
  });

  const page = await context.newPage();
  
  console.log('Opening http://localhost:5173/browse');
  await page.goto('http://localhost:5173/browse', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  
  await page.screenshot({ path: '/tmp/browse-tournaments.png' });
  console.log('✓ Screenshot saved to /tmp/browse-tournaments.png');
  
  await context.close();
}

viewBrowse().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
