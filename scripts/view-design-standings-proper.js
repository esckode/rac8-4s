#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dirname, '..', '.browser-data');

async function viewDesignStandings() {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 500,
  });

  const page = await context.newPage();
  
  console.log('Opening design server...');
  await page.goto('http://localhost:8000/design/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  // Reset scroll to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // Look for "Friday Night Smash" which is in the Standings mockup
  const allElements = await page.locator('text="Friday Night Smash"').all();
  console.log(`Found ${allElements.length} "Friday Night Smash" elements`);

  for (const elem of allElements) {
    const visible = await elem.isVisible().catch(() => false);
    if (visible) {
      const rect = await elem.evaluate(el => {
        let p = el;
        // Find the parent with 390px width (phone mockup)
        for (let i = 0; i < 20; i++) {
          const style = window.getComputedStyle(p);
          if (style.width === '390px') {
            return p.getBoundingClientRect();
          }
          p = p.parentElement;
          if (!p) break;
        }
        return null;
      });

      if (rect) {
        console.log(`Found Standings mockup at: x=${rect.x}, y=${rect.y}`);
        await elem.scrollIntoViewIfNeeded();
        await page.waitForTimeout(800);
        break;
      }
    }
  }

  // Take screenshot of viewport after scrolling
  await page.screenshot({ path: '/tmp/design-standings-mockup.png' });
  console.log('✓ Screenshot saved to /tmp/design-standings-mockup.png');

  await context.close();
}

viewDesignStandings().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
