#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dirname, '..', '.browser-data');

async function debugTournamentDetail() {
  console.log('Debugging Tournament Detail page...\n');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 300,
    executablePath: '/snap/bin/chromium',
  });

  const page = await context.newPage();

  try {
    // Navigate directly to tournament detail page
    console.log('1. Navigating to /tournament/1/standings...');
    await page.goto('http://localhost:5173/tournament/1/standings', { waitUntil: 'networkidle' });

    console.log(`   URL: ${page.url()}`);
    console.log(`   Title: ${await page.title()}\n`);

    // Get console messages
    const messages = [];
    page.on('console', msg => {
      messages.push(`[${msg.type()}] ${msg.text()}`);
    });

    await page.waitForTimeout(1000);

    console.log('2. Checking page content...');
    const bodyText = await page.locator('body').textContent();
    console.log(`   Body text length: ${bodyText?.length || 0} characters`);
    console.log(`   Body HTML length: ${(await page.content()).length} characters\n`);

    // Take screenshot
    console.log('3. Taking screenshot...');
    await page.screenshot({ path: '/tmp/debug-tournament-detail.png' });
    console.log('   Screenshot: /tmp/debug-tournament-detail.png\n');

    // Check for elements
    console.log('4. Checking for page elements...');
    const headingCount = await page.locator('h1, h2, h3').count();
    console.log(`   Found ${headingCount} headings`);

    const buttonCount = await page.locator('button').count();
    console.log(`   Found ${buttonCount} buttons`);

    const tabCount = await page.locator('[role="tab"]').count();
    console.log(`   Found ${tabCount} tabs (role="tab")\n`);

    // Check page structure
    console.log('5. Checking page structure...');
    const hasNav = await page.locator('nav, header').count() > 0;
    console.log(`   Has nav/header: ${hasNav}`);

    const hasMain = await page.locator('main, [role="main"]').count() > 0;
    console.log(`   Has main content: ${hasMain}`);

    const hasErrorBanner = await page.locator('[role="alert"]').count() > 0;
    console.log(`   Has error banner: ${hasErrorBanner}`);

    // Get HTML structure
    console.log('\n6. Page HTML structure (first 2000 chars):');
    const html = await page.content();
    const bodyStart = html.indexOf('<body');
    const bodyEnd = html.indexOf('</body>') + 7;
    const bodyHtml = html.substring(bodyStart, Math.min(bodyEnd, bodyStart + 2000));
    console.log(bodyHtml);

    if (messages.length > 0) {
      console.log('\n7. Console messages:');
      messages.forEach(msg => console.log(`   ${msg}`));
    }
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error(error);
  }

  await context.close();
}

debugTournamentDetail().catch(console.error);
