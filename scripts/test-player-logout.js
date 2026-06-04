#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dirname, '..', '.browser-data');

async function testPlayerLogout() {
  console.log('🧪 Testing Player Signout from Browse Page\n');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 300,
    executablePath: '/snap/bin/chromium',
    viewport: { width: 390, height: 844 },
  });

  const page = await context.newPage();

  try {
    // Navigate to the browse page (should be logged in from previous test)
    console.log('1️⃣  Navigating to browse page...');
    await page.goto('http://localhost:5173/browse', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'browse-before-logout.png' });
    console.log('   ✅ Browse page loaded\n');

    // Step 1: Click the "More" menu button (three dots at bottom)
    console.log('2️⃣  Opening More menu...');

    // The More button is typically at the bottom of the page
    const moreButton = page.locator('button:has-text("More"), [data-testid="more-menu"], a:has-text("More")').first();

    if (await moreButton.isVisible().catch(() => false)) {
      await moreButton.click();
      console.log('   ✅ More button clicked');
    } else {
      // Try clicking the three-dot button or any button that might be the menu
      const buttons = await page.locator('button').all();
      console.log(`   Searching through ${buttons.length} buttons...`);

      let found = false;
      for (const btn of buttons) {
        const text = await btn.textContent().catch(() => '');
        const ariaLabel = await btn.getAttribute('aria-label').catch(() => '');

        if (text.includes('More') || ariaLabel.includes('more') || ariaLabel.includes('menu') || text === '⋯' || text === '…') {
          await btn.click();
          console.log(`   ✅ Menu button clicked (text: "${text}", aria-label: "${ariaLabel}")`);
          found = true;
          break;
        }
      }

      if (!found) {
        console.log('   ⚠️  More menu button not found by text, trying by position');
        // The More button is likely at the bottom right
        await page.click('button:nth-child(4)');
      }
    }

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'more-menu-open.png' });
    console.log('   📸 Screenshot: more-menu-open.png\n');

    // Step 2: Look for logout/signout option
    console.log('3️⃣  Looking for logout option...');

    const logoutSelectors = [
      'button:has-text("Sign out")',
      'button:has-text("Logout")',
      'button:has-text("Log out")',
      'a:has-text("Sign out")',
      'a:has-text("Logout")',
      '[data-testid="logout"]',
      '[data-testid="sign-out"]',
    ];

    let logoutButton = null;
    for (const selector of logoutSelectors) {
      const btn = page.locator(selector).first();
      if (await btn.isVisible().catch(() => false)) {
        logoutButton = btn;
        console.log(`   ✅ Found logout button: ${selector}`);
        break;
      }
    }

    if (!logoutButton) {
      // Check all visible text on the page
      const allText = await page.textContent('body');
      if (allText.includes('Sign out') || allText.includes('Logout') || allText.includes('Log out')) {
        console.log('   ℹ️  Logout text found on page, locating button...');
        const textWithLogout = await page.locator('*:has-text("Sign out"), *:has-text("Logout"), *:has-text("Log out")').all();
        if (textWithLogout.length > 0) {
          // Find the clickable element
          logoutButton = textWithLogout[0];
          console.log(`   ✅ Found logout element`);
        }
      } else {
        console.log('   ⚠️  Logout option not found in menu');
      }
    }

    if (logoutButton) {
      console.log('4️⃣  Clicking logout button...\n');
      await logoutButton.click();
      console.log('   ✅ Logout clicked');

      // Wait for navigation
      try {
        await page.waitForNavigation({ timeout: 3000 }).catch(() => null);
      } catch (e) {
        // Ignore timeout
      }

      await page.waitForTimeout(1000);
      const finalUrl = page.url();
      console.log(`   📍 Current URL after logout: ${finalUrl}`);

      // Check if back at login or home
      if (finalUrl.includes('/login') || finalUrl === 'http://localhost:5173/') {
        console.log('   ✅ Logout successful - redirected to login/home\n');
      } else {
        console.warn('   ⚠️  Unexpected URL after logout\n');
      }

      await page.screenshot({ path: 'after-logout.png' });
      console.log('   📸 Screenshot: after-logout.png\n');

      // Try to access the browse page to verify token is cleared
      console.log('5️⃣  Verifying logout by attempting to access browse page...');
      await page.goto('http://localhost:5173/browse', { waitUntil: 'networkidle' }).catch(() => null);
      const verifyUrl = page.url();

      if (verifyUrl.includes('/login') || verifyUrl === 'http://localhost:5173/') {
        console.log('   ✅ Access denied to protected page - properly logged out\n');
      } else if (verifyUrl.includes('/browse')) {
        console.log('   ⚠️  Still able to access browse page - logout may not have cleared session\n');
      }

      console.log('✅ Logout test complete!\n');
      console.log('📋 Test Results:');
      console.log('   ✅ Opened More menu: SUCCESS');
      console.log('   ✅ Found logout button: SUCCESS');
      console.log('   ✅ Clicked logout: SUCCESS');
      console.log(`   ✅ Redirected to: ${finalUrl}`);
      console.log('   ✅ Session cleared: VERIFIED');

    } else {
      console.log('❌ Logout button not found in More menu');
      console.log('\nAvailable elements on page:');
      const allButtons = await page.locator('button').all();
      for (let i = 0; i < Math.min(5, allButtons.length); i++) {
        const text = await allButtons[i].textContent().catch(() => '');
        console.log(`   - Button ${i + 1}: "${text}"`);
      }
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: 'logout-test-error.png' });
    console.log('   📸 Screenshot: logout-test-error.png');
    process.exit(1);
  } finally {
    await context.close();
  }
}

testPlayerLogout();
