#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dirname, '..', '.browser-data');

async function debugReact() {
  console.log('Debugging React app...\n');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 300,
    executablePath: '/snap/bin/chromium',
  });

  const page = await context.newPage();

  // Capture all console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    });
    console.log(`[${msg.type()}] ${msg.text()}`);
  });

  // Capture JavaScript errors
  page.on('pageerror', error => {
    console.error('[PAGE ERROR]', error);
  });

  // Capture uncaught promise rejections
  page.on('requestfailed', request => {
    console.warn(`[REQUEST FAILED] ${request.method()} ${request.url()}`);
  });

  try {
    // Test 1: Landing page
    console.log('=== Test 1: Landing Page ===\n');
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    let bodyText = await page.locator('body').textContent();
    console.log(`Landing page has content: ${bodyText && bodyText.trim().length > 50}\n`);

    // Test 2: Browse page
    console.log('=== Test 2: Browse Page ===\n');
    await page.goto('http://localhost:5173/browse', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    bodyText = await page.locator('body').textContent();
    console.log(`Browse page has content: ${bodyText && bodyText.trim().length > 50}\n`);

    // Test 3: Tournament Detail page
    console.log('=== Test 3: Tournament Detail Page ===\n');
    consoleMessages.length = 0; // Clear previous messages
    await page.goto('http://localhost:5173/tournament/1/standings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    bodyText = await page.locator('body').textContent();
    console.log(`Tournament detail page has content: ${bodyText && bodyText.trim().length > 50}`);
    console.log(`Body text: "${bodyText?.substring(0, 100) || 'EMPTY'}"`);

    console.log('\nChecking for React...');
    const hasReactDevTools = await page.evaluate(() => {
      return typeof window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== 'undefined';
    });
    console.log(`Has React: ${hasReactDevTools}`);

    console.log('\nChecking for error boundaries...');
    const errorElements = await page.locator('[role="alert"]').count();
    console.log(`Error banners found: ${errorElements}`);

    // Take screenshot
    await page.screenshot({ path: '/tmp/debug-react.png' });
    console.log('\nScreenshot: /tmp/debug-react.png');

    // Log all console messages
    console.log('\n=== Console Messages ===');
    consoleMessages.forEach(msg => {
      console.log(`[${msg.type()}] ${msg.text()}`);
    });

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  }

  await context.close();
}

debugReact().catch(console.error);
