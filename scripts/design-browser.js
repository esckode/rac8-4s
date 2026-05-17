#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dirname, '..', '.browser-data');

async function runBrowser() {
  console.log(`Launching Chromium with persistent state at: ${userDataDir}`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 500, // Slow down for visibility
  });

  const page = await context.newPage();

  const consoleErrors = [];
  const networkErrors = [];

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Capture network errors
  page.on('requestfailed', request => {
    networkErrors.push(`${request.method()} ${request.url()}`);
  });

  // Navigate to localhost:8000
  console.log('Opening http://localhost:8000/design/index.html');
  try {
    await page.goto('http://localhost:8000/design/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000); // Wait for page to render
  } catch (error) {
    console.error('❌ Design server is not live:', error.message);
    await context.close();
    process.exit(1);
  }

  // Look for and click on 03.Browse Tournaments in 03.Mobile app
  console.log('\nSearching for 03.Browse Tournaments view...');
  try {
    // Wait a bit for the design page to fully load
    await page.waitForTimeout(1000);

    // Scroll down to find the Browse Tournaments section
    console.log('Scrolling to find Browse Tournaments section...');
    let scrollCount = 0;
    while (scrollCount < 5) {
      await page.evaluate(() => window.scrollBy(0, 300));
      await page.waitForTimeout(500);
      scrollCount++;
    }

    // Try to find elements containing "Browse Tournaments"
    const browseElements = await page.locator('text=/Browse Tournaments/i').all();
    console.log(`Found ${browseElements.length} elements with "Browse Tournaments"`);

    if (browseElements.length > 0) {
      console.log('Found Browse Tournaments! Clicking on it...');
      // Get the first visible one
      for (const elem of browseElements) {
        const visible = await elem.isVisible().catch(() => false);
        if (visible) {
          await elem.click();
          await page.waitForTimeout(1000);
          break;
        }
      }
    }
  } catch (error) {
    console.log('Could not auto-navigate to Browse Tournaments:', error.message);
  }

  // Validate site is live
  const title = await page.title();
  console.log(`✓ Page loaded successfully`);
  console.log(`  Title: ${title}`);

  const url = page.url();
  console.log(`  URL: ${url}`);

  // Check if page has content
  const bodyText = await page.locator('body').textContent();
  const hasContent = bodyText && bodyText.trim().length > 0;

  if (hasContent) {
    console.log(`✓ Design server is live and has content`);
  } else {
    console.warn(`⚠ Design server loaded but appears empty`);
    await context.close();
    process.exit(1);
  }

  // Check for console errors
  if (consoleErrors.length > 0) {
    console.warn(`⚠ Console errors detected (${consoleErrors.length}):`);
    consoleErrors.forEach(err => console.warn(`  - ${err}`));
  } else {
    console.log(`✓ No console errors`);
  }

  // Check for network errors
  if (networkErrors.length > 0) {
    console.warn(`⚠ Network errors detected (${networkErrors.length}):`);
    networkErrors.forEach(err => console.warn(`  - ${err}`));
  } else {
    console.log(`✓ No network errors`);
  }

  // Take full page screenshot first
  console.log('\nTaking full page screenshot...');
  await page.screenshot({ path: '/tmp/localhost-8000-design-full.png', fullPage: true });
  console.log('Full page screenshot saved to /tmp/localhost-8000-design-full.png');

  // Find and focus on Browse Tournaments mobile mockup
  console.log('\nLocating Browse Tournaments mockup...');
  try {
    // Look for the section with "Browse" as a title in mobile phone context
    // First find all divs that might be phone mockups (390px width)
    const phoneElements = await page.evaluate(() => {
      const elements = [];
      document.querySelectorAll('div').forEach(el => {
        const style = window.getComputedStyle(el);
        const width = style.width;
        // Look for 390px width phone mockups
        if (width === '390px' && el.textContent.includes('Browse')) {
          elements.push({
            el,
            top: el.getBoundingClientRect().top,
            text: el.textContent.substring(0, 50)
          });
        }
      });
      return elements.map(e => e.top);
    });

    if (phoneElements.length > 0) {
      console.log(`Found ${phoneElements.length} potential phone mockups`);
      // Scroll to the first one (the Browse mockup should be one of these)
      await page.evaluate((top) => window.scrollTo(0, window.scrollY + top - 200), phoneElements[0]);
      await page.waitForTimeout(800);
    } else {
      console.log('Could not find phone mockups, scrolling down...');
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(500);
    }
  } catch (error) {
    console.log('Error finding mockup:', error.message);
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(500);
  }

  // Take viewport screenshot
  console.log('Taking viewport screenshot...');
  await page.screenshot({ path: '/tmp/localhost-8000-design.png' });
  console.log('✓ Screenshot saved to /tmp/localhost-8000-design.png');

  // Try to take a zoomed screenshot of just the Browse mockup
  console.log('Taking zoomed screenshot of Browse mockup...');
  try {
    // Find the Browse mockup div and take a screenshot of just that element
    const browsePhone = await page.evaluate(() => {
      const allDivs = document.querySelectorAll('div[style*="390"]');
      for (const div of allDivs) {
        if (div.textContent.includes('Browse') && div.textContent.includes('Find a night')) {
          return div;
        }
      }
      return null;
    });

    if (browsePhone) {
      const elem = await page.locator('text="Find a night, find a tournament"').first();
      const box = await elem.boundingBox();
      if (box) {
        // Get the parent phone mockup by looking for a 390px wide container
        const phoneParent = await elem.evaluate(el => {
          let p = el;
          for (let i = 0; i < 15; i++) {
            const style = window.getComputedStyle(p);
            if (style.width === '390px') return p;
            p = p.parentElement;
            if (!p) break;
          }
          return p;
        });

        if (phoneParent) {
          const rect = await elem.evaluate(el => {
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

          if (rect) {
            console.log(`Browse mockup found: x=${rect.x}, y=${rect.y}, width=${rect.width}, height=${rect.height}`);
            await page.screenshot({
              path: '/tmp/localhost-8000-design-browse-zoom.png',
              clip: {
                x: Math.max(0, rect.x - 10),
                y: Math.max(0, rect.y - 10),
                width: rect.width + 20,
                height: rect.height + 20
              }
            });
            console.log('✓ Zoomed screenshot saved to /tmp/localhost-8000-design-browse-zoom.png');
          }
        }
      }
    }
  } catch (error) {
    console.log('Could not take zoomed screenshot:', error.message);
  }

  // Close and exit
  await context.close();
  console.log('\n✓ Design server validation complete!');
}

runBrowser().catch(console.error);
