#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dirname, '..', '.browser-data');

async function testNavigation() {
  console.log('Testing navigation flow...\n');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 500,
    executablePath: '/snap/bin/chromium',
  });

  const page = await context.newPage();

  try {
    // Start at landing page
    console.log('1. Loading landing page...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    await page.screenshot({ path: '/tmp/01-landing.png' });
    console.log('   Screenshot: /tmp/01-landing.png\n');

    // Click Browse tournaments button
    console.log('2. Clicking "Browse tournaments" button...');
    await page.click('button:has-text("Browse tournaments")');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/02-browse.png' });
    console.log('   Screenshot: /tmp/02-browse.png');
    console.log(`   URL: ${page.url()}\n`);

    // Click on first tournament card (Greenwood Mixed Open)
    console.log('3. Clicking on first tournament card...');
    const tournamentCards = page.locator('div[style*="cursor: pointer"]').filter({ hasText: /Greenwood|Spring|Knockout/ });
    const count = await tournamentCards.count();
    console.log(`   Found ${count} tournament cards`);

    if (count > 0) {
      await tournamentCards.first().click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: '/tmp/03-tournament-detail.png' });
      console.log('   Screenshot: /tmp/03-tournament-detail.png');
      console.log(`   URL: ${page.url()}\n`);

      // Verify we're on a tournament detail page by checking for tabs
      const tabCount = await page.locator('[role="tab"]').count();
      console.log(`4. Found ${tabCount} tabs on tournament detail page`);

      if (tabCount > 0) {
        console.log('   ✓ Tournament Detail page loaded successfully!\n');

        // Click on Matches tab
        console.log('5. Clicking on "Matches" tab...');
        const matchesTab = page.locator('[role="tab"]').filter({ hasText: 'Matches' });
        if (await matchesTab.count() > 0) {
          await matchesTab.click();
          await page.waitForTimeout(1000);
          await page.screenshot({ path: '/tmp/04-matches-tab.png' });
          console.log('   Screenshot: /tmp/04-matches-tab.png\n');
        }

        // Click on Bracket tab
        console.log('6. Clicking on "Bracket" tab...');
        const bracketTab = page.locator('[role="tab"]').filter({ hasText: 'Bracket' });
        if (await bracketTab.count() > 0) {
          await bracketTab.click();
          await page.waitForTimeout(1000);
          await page.screenshot({ path: '/tmp/05-bracket-tab.png' });
          console.log('   Screenshot: /tmp/05-bracket-tab.png\n');
        }

        // Click on Details tab
        console.log('7. Clicking on "Details" tab...');
        const detailsTab = page.locator('[role="tab"]').filter({ hasText: 'Details' });
        if (await detailsTab.count() > 0) {
          await detailsTab.click();
          await page.waitForTimeout(1000);
          await page.screenshot({ path: '/tmp/06-details-tab.png' });
          console.log('   Screenshot: /tmp/06-details-tab.png\n');
        }

        console.log('✓ Navigation test complete!');
        console.log('\nAll screenshots saved:');
        console.log('  - /tmp/01-landing.png (Landing page)');
        console.log('  - /tmp/02-browse.png (Browse Tournaments)');
        console.log('  - /tmp/03-tournament-detail.png (Tournament Detail - Standings)');
        console.log('  - /tmp/04-matches-tab.png (Matches tab)');
        console.log('  - /tmp/05-bracket-tab.png (Bracket tab)');
        console.log('  - /tmp/06-details-tab.png (Details tab)');
      } else {
        console.log('⚠ No tabs found on tournament detail page');
      }
    } else {
      console.log('⚠ No tournament cards found');
    }
  } catch (error) {
    console.error('❌ Navigation test failed:', error.message);
    await page.screenshot({ path: '/tmp/error-screenshot.png' });
    console.log('Error screenshot: /tmp/error-screenshot.png');
  }

  await context.close();
}

testNavigation().catch(console.error);
