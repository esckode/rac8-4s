#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dirname, '..', '.browser-data');

async function viewStandingsMobile() {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 500,
    viewport: { width: 390, height: 844 }
  });

  const page = await context.newPage();
  
  console.log('Opening http://localhost:5173/standings in mobile view (390x844)');
  await page.goto('http://localhost:5173/standings', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  
  await page.screenshot({ path: '/tmp/standings-page-mobile.png' });
  console.log('✓ Mobile screenshot saved to /tmp/standings-page-mobile.png');
  
  await context.close();
}

viewStandingsMobile().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
