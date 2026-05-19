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
    executablePath: '/snap/bin/chromium',
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

  // Navigate to localhost:5173
  console.log('Opening http://localhost:5173/');
  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
  } catch (error) {
    console.error('❌ Site is not live:', error.message);
    await context.close();
    process.exit(1);
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
    console.log(`✓ Site is live and has content`);
  } else {
    console.warn(`⚠ Site loaded but appears empty`);
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

  // Verify key elements exist
  const elementsToCheck = [
    { selector: 'nav, header, [role="navigation"]', name: 'Navigation' },
    { selector: 'main, [role="main"]', name: 'Main content area' },
    { selector: 'button, a, [role="button"]', name: 'Interactive elements' },
  ];

  console.log('\n📋 Element validation:');
  for (const elem of elementsToCheck) {
    const exists = await page.locator(elem.selector).first().isVisible().catch(() => false);
    if (exists) {
      console.log(`  ✓ ${elem.name}`);
    } else {
      console.warn(`  ⚠ ${elem.name} not found`);
    }
  }

  // Take screenshot
  console.log('\nTaking screenshot...');
  await page.screenshot({ path: '/tmp/localhost-5173.png' });
  console.log('Screenshot saved to /tmp/localhost-5173.png');

  // Close and exit
  await context.close();
  console.log('\n✓ Validation complete. Webapp is live!');
}

runBrowser().catch(console.error);
