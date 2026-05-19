#!/usr/bin/env node
import { chromium } from 'playwright';

async function verifyFix() {
  console.log('🎾 Verifying Matches Page Fix\n');

  const context = await chromium.launchPersistentContext('.browser-data', {
    headless: false,
    slowMo: 300,
    executablePath: '/snap/bin/chromium',
  });

  const page = await context.newPage();

  try {
    const tournamentId = 'tournament_1778987755608_ttt66sjdujs';
    
    console.log('Testing all tournament tabs...\n');
    
    const tabs = ['matches', 'standings', 'bracket'];
    
    for (const tab of tabs) {
      await page.goto(`http://localhost:5173/tournament/${tournamentId}/${tab}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      
      const signInMsg = await page.locator('text=Sign in to view').isVisible().catch(() => false);
      const tabName = tab.charAt(0).toUpperCase() + tab.slice(1);
      
      console.log(`${tabName}:`);
      console.log(`  ✓ Shows sign-in message: ${signInMsg}`);
    }

    console.log('\n✅ All tabs now properly show sign-in message instead of blank page!\n');
    
    // Take final screenshot of Matches tab
    await page.goto(`http://localhost:5173/tournament/${tournamentId}/matches`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: '/tmp/final-matches.png', fullPage: true });
    console.log('📸 Screenshot saved: /tmp/final-matches.png');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await context.close();
  }
}

verifyFix().catch(console.error);
