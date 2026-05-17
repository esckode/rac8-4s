#!/usr/bin/env node
import { chromium } from 'playwright';

async function testMatchesPage() {
  console.log('Testing Matches page display...\n');

  const context = await chromium.launchPersistentContext('.browser-data', {
    headless: false,
    slowMo: 300,
    executablePath: '/snap/bin/chromium',
  });

  const page = await context.newPage();

  try {
    // Navigate directly to Matches tab with test tournament
    const tournamentId = 'tournament_1778987755608_ttt66sjdujs';
    console.log(`Navigating to tournament matches: ${tournamentId}\n`);
    
    await page.goto(`http://localhost:5173/tournament/${tournamentId}/matches`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({ path: '/tmp/matches-page.png', fullPage: true });
    console.log('✅ Matches page loaded successfully');
    console.log('📸 Screenshot: /tmp/matches-page.png\n');

    // Check page content
    const hasMatchesTitle = await page.locator('text=Matches').first().isVisible().catch(() => false);
    const filterButtons = await page.locator('[role="button"]').filter({ hasText: /All|Upcoming|Completed/ }).count();
    const matchContent = await page.locator('text=/player|vs|Pending|Completed/').count();
    
    console.log('Page content check:');
    console.log(`  ✓ "Matches" title visible: ${hasMatchesTitle}`);
    console.log(`  ✓ Filter buttons found: ${filterButtons}`);
    console.log(`  ✓ Match content elements: ${matchContent}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await context.close();
  }
}

testMatchesPage().catch(console.error);
