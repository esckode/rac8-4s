#!/usr/bin/env node
import { chromium } from 'playwright';

async function testMatchesSignIn() {
  console.log('✅ Testing Matches Tab with Auth Check\n');

  const context = await chromium.launchPersistentContext('.browser-data', {
    headless: false,
    slowMo: 300,
    executablePath: '/snap/bin/chromium',
  });

  const page = await context.newPage();

  try {
    const tournamentId = 'tournament_1778987755608_ttt66sjdujs';
    
    console.log('1️⃣  Navigating to Matches tab...\n');
    await page.goto(`http://localhost:5173/tournament/${tournamentId}/matches`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('2️⃣  Checking for proper sign-in message...\n');

    // Check for sign-in message
    const signInMsg = await page.locator('text=Sign in to view').isVisible().catch(() => false);
    const matchesHeading = await page.locator('text=Tournament').isVisible().catch(() => false);
    const tabs = await page.locator('[role="tab"]').count();
    
    console.log(`   ✓ Sign-in message visible: ${signInMsg}`);
    console.log(`   ✓ Tournament header visible: ${matchesHeading}`);
    console.log(`   ✓ Tabs visible: ${tabs > 0}\n`);

    // Check that it's not a blank page
    const pageText = await page.textContent();
    const hasContent = pageText && pageText.length > 100;
    console.log(`   ✓ Page has content: ${hasContent}\n`);

    console.log('3️⃣  Clicking other tabs to verify they also show sign-in...\n');
    
    // Click Standings tab
    await page.click('text=Standings');
    await page.waitForTimeout(500);
    const standingsMsg = await page.locator('text=Sign in to view standings').isVisible().catch(() => false);
    console.log(`   ✓ Standings shows sign-in: ${standingsMsg}`);

    // Click Bracket tab  
    await page.click('text=Bracket');
    await page.waitForTimeout(500);
    const bracketMsg = await page.locator('text=Sign in to view bracket').isVisible().catch(() => false);
    console.log(`   ✓ Bracket shows sign-in: ${bracketMsg}\n`);

    console.log('4️⃣  Taking screenshot...\n');
    await page.screenshot({ path: '/tmp/matches-signin.png', fullPage: true });
    console.log('   📸 Screenshot: /tmp/matches-signin.png\n');

    if (signInMsg && matchesHeading && tabs > 0) {
      console.log('✅ SUCCESS! Matches page now shows proper sign-in message instead of blank page!\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await context.close();
  }
}

testMatchesSignIn().catch(console.error);
