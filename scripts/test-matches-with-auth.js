#!/usr/bin/env node
import jwt from 'jsonwebtoken';
import { chromium } from 'playwright';

const JWT_SECRET = 'dev-secret-key-change-in-production';
const TEST_PLAYER_ID = 'player-1';
const TOURNAMENT_ID = 'tournament_1778987755608_ttt66sjdujs';

function createPlayerToken(playerId) {
  return jwt.sign(
    { playerId, role: 'player' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function testMatchesWithAuth() {
  console.log('🔐 Testing Matches Page with Authentication\n');

  const context = await chromium.launchPersistentContext('.browser-data', {
    headless: false,
    slowMo: 400,
    executablePath: '/snap/bin/chromium',
  });

  const page = await context.newPage();

  try {
    console.log('1️⃣  Creating authentication token...');
    const token = createPlayerToken(TEST_PLAYER_ID);
    console.log(`   ✓ Token created for player: ${TEST_PLAYER_ID}\n`);

    console.log('2️⃣  Setting authentication in localStorage...');
    await page.goto('http://localhost:5173/');
    await page.evaluate((token) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem('player_id', 'player-1');
      localStorage.setItem('player_name', 'Alice Smith');
    }, token);
    console.log('   ✓ Authentication set\n');

    console.log('3️⃣  Navigating to Matches tab...');
    await page.goto(`http://localhost:5173/tournament/${TOURNAMENT_ID}/matches`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    console.log('   ✓ Page loaded\n');

    console.log('4️⃣  Checking Matches content...\n');

    // Check for Matches heading
    const matchesHeading = await page.locator('h2:has-text("Matches")').isVisible().catch(() => false);
    console.log(`   ✓ Matches heading: ${matchesHeading}`);

    // Check for filter buttons
    const filterAll = await page.locator('button:has-text("All")').isVisible().catch(() => false);
    const filterUpcoming = await page.locator('button:has-text("Upcoming")').isVisible().catch(() => false);
    console.log(`   ✓ Filter buttons: All=${filterAll}, Upcoming=${filterUpcoming}`);

    // Check for match count text
    const matchCount = await page.locator('text=/\\d+ matches?/').textContent().catch(() => null);
    console.log(`   ✓ Match count text: ${matchCount || 'not found'}`);

    // Check for match cards
    const matchCards = await page.locator('[class*="MatchCard"]').count().catch(() => 0);
    console.log(`   ✓ Match cards visible: ${matchCards}\n`);

    // Get page content for debugging
    const pageText = await page.textContent();
    const hasPlayerNames = pageText.includes('Alice') || pageText.includes('Bob') || pageText.includes('vs');
    console.log(`   ✓ Player names in content: ${hasPlayerNames}`);

    // Check for auth check message (should NOT be present if authenticated)
    const authCheck = await page.locator('text=Sign in to view tournament details').isVisible().catch(() => false);
    console.log(`   ✓ Auth check message visible: ${authCheck}\n`);

    console.log('5️⃣  Taking screenshot...\n');
    await page.screenshot({ path: '/tmp/matches-with-auth.png', fullPage: true });
    console.log('   📸 Screenshot: /tmp/matches-with-auth.png\n');

    if (matchCards > 0) {
      console.log('✅ SUCCESS! Matches are displaying with real data!\n');
    } else if (!authCheck && matchCount) {
      console.log('✅ SUCCESS! Matches page is loading (data may be fetching)!\n');
    } else {
      console.log('⚠️  Matches page loaded but no match data visible yet.\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    await page.screenshot({ path: '/tmp/error-auth.png' });
  } finally {
    await context.close();
  }
}

testMatchesWithAuth().catch(console.error);
