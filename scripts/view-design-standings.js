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

  // Scroll and find Standings mockup
  console.log('Looking for Standings mockup...');
  await page.evaluate(() => window.scrollBy(0, 800));
  await page.waitForTimeout(1000);

  // Find and click on "STANDINGS" text
  const standingsElements = await page.locator('text=/Standings/i').all();
  console.log(`Found ${standingsElements.length} Standings elements`);

  for (const elem of standingsElements) {
    const visible = await elem.isVisible().catch(() => false);
    if (visible) {
      const text = await elem.textContent();
      if (text && text.includes('Standing')) {
        console.log(`Found Standings: ${text.substring(0, 50)}`);
        await elem.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        break;
      }
    }
  }

  // Take screenshot of full page
  await page.screenshot({ path: '/tmp/design-standings-full.png' });
  console.log('✓ Full page screenshot saved');

  // Try to capture zoomed standings mockup
  try {
    const standingsPhone = await page.evaluate(() => {
      const allDivs = document.querySelectorAll('div[style*="390"]');
      for (const div of allDivs) {
        if (div.textContent.includes('Standings') && div.textContent.includes('LIVE')) {
          return div;
        }
      }
      return null;
    });

    if (standingsPhone) {
      const elem = await page.locator('text="Friday Night Smash"').first();
      const phoneParent = await elem.evaluate(el => {
        let p = el;
        for (let i = 0; i < 15; i++) {
          const style = window.getComputedStyle(p);
          if (style.width === '390px') {
            return p.getBoundingClientRect();
          }
          p = p.parentElement;
          if (!p) break;
        }
        return null;
      });

      if (phoneParent) {
        console.log(`Found Standings mockup at position`);
        await page.screenshot({
          path: '/tmp/design-standings-zoom.png',
          clip: {
            x: Math.max(0, phoneParent.x - 10),
            y: Math.max(0, phoneParent.y - 10),
            width: phoneParent.width + 20,
            height: phoneParent.height + 20
          }
        });
        console.log('✓ Zoomed screenshot saved to /tmp/design-standings-zoom.png');
      }
    }
  } catch (error) {
    console.log('Could not capture zoomed view');
  }

  await context.close();
}

viewDesignStandings().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
