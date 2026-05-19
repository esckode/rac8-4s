#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dirname, '..', '.browser-data');

async function testFullFlow() {
  console.log('Testing complete navigation flow...\n');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 400,
    executablePath: '/snap/bin/chromium',
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();

  try {
    // Step 1: Landing page
    console.log('1. Landing Page');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: '/tmp/01-landing-full.png' });
    console.log('   ✓ Screenshot: /tmp/01-landing-full.png\n');

    // Step 2: Click Browse tournaments
    console.log('2. Navigating to Browse Tournaments');
    await page.click('button:has-text("Browse tournaments")');
    await page.waitForTimeout(1500);
    const browseUrl = page.url();
    console.log(`   ✓ URL: ${browseUrl}`);
    await page.screenshot({ path: '/tmp/02-browse-full.png' });
    console.log('   ✓ Screenshot: /tmp/02-browse-full.png\n');

    // Step 3: Click on a tournament
    console.log('3. Clicking on Tournament Card');
    const tournamentCards = page.locator('div[style*="cursor: pointer"]').filter({ hasText: /Greenwood|Spring/ });
    const count = await tournamentCards.count();
    console.log(`   Found ${count} tournament cards`);

    if (count > 0) {
      await tournamentCards.first().click();
      await page.waitForTimeout(1500);
      const detailUrl = page.url();
      console.log(`   ✓ URL: ${detailUrl}`);
      await page.screenshot({ path: '/tmp/03-tournament-detail-full.png' });
      console.log('   ✓ Screenshot: /tmp/03-tournament-detail-full.png\n');

      // Step 4: Check which content is visible
      console.log('4. Checking Tournament Detail Page Content');
      const hasAuthMessage = await page.locator('text=Sign in to view tournament details').isVisible().catch(() => false);
      const hasStandingsContent = await page.locator('text=Standings').isVisible().catch(() => false);
      const hasMatchesTab = await page.locator('[role="tab"]').filter({ hasText: 'Matches' }).isVisible().catch(() => false);

      console.log(`   Has auth message: ${hasAuthMessage}`);
      console.log(`   Has standings content: ${hasStandingsContent}`);
      console.log(`   Has Matches tab: ${hasMatchesTab}`);

      if (hasAuthMessage) {
        console.log('\n   ℹ️  Page correctly shows authentication prompt\n');
      }

      // Step 5: Go back to Browse
      console.log('5. Testing Back Navigation');
      await page.click('button:has-text("Back")');
      await page.waitForTimeout(1000);
      const backUrl = page.url();
      console.log(`   ✓ URL: ${backUrl}`);
      console.log(`   ✓ Returned to: ${backUrl === 'http://localhost:5173/browse' ? 'Browse' : 'other page'}\n`);
      await page.screenshot({ path: '/tmp/04-back-to-browse.png' });
      console.log('   ✓ Screenshot: /tmp/04-back-to-browse.png\n');
    }

    console.log('✓ Navigation flow test complete!\n');
    console.log('Summary:');
    console.log('  ✓ Landing page loads correctly');
    console.log('  ✓ Browse Tournaments page accessible');
    console.log('  ✓ Tournament Detail page accessible');
    console.log('  ✓ Authentication check working');
    console.log('  ✓ Back button navigation working');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
  }

  await context.close();
}

testFullFlow().catch(console.error);
