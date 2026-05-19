#!/usr/bin/env node
import { chromium } from 'playwright';

async function debugMatches() {
  console.log('🔍 Debugging Matches Page...\n');

  const context = await chromium.launchPersistentContext('.browser-data', {
    headless: false,
    slowMo: 300,
    executablePath: '/snap/bin/chromium',
  });

  const page = await context.newPage();

  // Capture console messages
  const consoleLogs = [];
  page.on('console', msg => {
    console.log(`   [${msg.type()}] ${msg.text()}`);
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  try {
    const tournamentId = 'tournament_1778987755608_ttt66sjdujs';
    
    console.log('1️⃣  Navigating to Matches tab...\n');
    await page.goto(`http://localhost:5173/tournament/${tournamentId}/matches`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('\n2️⃣  Checking page content...\n');

    // Check for Matches heading
    const matchesHeading = await page.locator('h2:has-text("Matches")').isVisible().catch(() => false);
    console.log(`   Matches heading visible: ${matchesHeading}`);

    // Check for filter buttons
    const filterButtons = await page.locator('button:has-text("All")').count();
    console.log(`   Filter buttons found: ${filterButtons}`);

    // Check for empty state message
    const noMatches = await page.locator('text=No matches scheduled').isVisible().catch(() => false);
    console.log(`   "No matches scheduled" visible: ${noMatches}`);

    // Check for match cards
    const matchCards = await page.locator('[class*="MatchCard"], div:has-text("vs")').count();
    console.log(`   Match cards found: ${matchCards}`);

    // Check for loading state
    const loading = await page.locator('text=Loading').isVisible().catch(() => false);
    console.log(`   Loading indicator: ${loading}`);

    // Check for error message
    const errorMsg = await page.locator('text=Failed to load').isVisible().catch(() => false);
    console.log(`   Error message: ${errorMsg}`);

    console.log('\n3️⃣  Checking Network Requests...\n');
    const requests = await page.context().route('**/*', route => route.continue());
    
    // Make an API call to check tournament bundle
    console.log('   Fetching tournament bundle...');
    const response = await page.evaluate(async () => {
      try {
        const res = await fetch(`http://localhost:3001/tournaments/tournament_1778987755608_ttt66sjdujs/bundle`, {
          headers: {
            'Authorization': 'Bearer test-token'
          }
        });
        return {
          status: res.status,
          ok: res.ok,
          text: await res.text().then(t => t.substring(0, 200))
        };
      } catch (e) {
        return { error: e.message };
      }
    });
    
    console.log(`   API Response: ${JSON.stringify(response).substring(0, 100)}...\n`);

    console.log('4️⃣  Taking screenshot...\n');
    await page.screenshot({ path: '/tmp/debug-matches.png', fullPage: true });
    console.log('   Screenshot: /tmp/debug-matches.png\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await context.close();
  }
}

debugMatches().catch(console.error);
