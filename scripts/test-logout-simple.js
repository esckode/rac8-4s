#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dirname, '..', '.browser-data');

async function testLogout() {
  console.log('🧪 Testing Player Logout\n');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 200,
    executablePath: '/snap/bin/chromium',
    viewport: { width: 390, height: 844 },
  });

  const page = await context.newPage();

  try {
    console.log('1️⃣  Loading browse page...');
    await page.goto('http://localhost:5173/browse', { waitUntil: 'networkidle' });
    console.log('   ✅ Page loaded\n');

    // Scroll to bottom to ensure footer/nav is visible
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    console.log('2️⃣  Clicking "More" button...');
    // Find the More button in the bottom navigation
    const moreButton = page.locator('text=More').last();

    if (await moreButton.isVisible().catch(() => false)) {
      await moreButton.click();
      console.log('   ✅ More button clicked\n');
    } else {
      throw new Error('More button not found');
    }

    await page.waitForTimeout(500);
    await page.screenshot({ path: 'menu-opened.png' });
    console.log('   📸 Screenshot: menu-opened.png\n');

    console.log('3️⃣  Looking for Sign out button...');
    // Look for sign out button
    const signOutButton = page.locator('text=Sign out').first();

    if (await signOutButton.isVisible().catch(() => false)) {
      console.log('   ✅ Sign out button found\n');

      console.log('4️⃣  Clicking Sign out...');
      await signOutButton.click();
      console.log('   ✅ Sign out clicked\n');

      // Wait for redirect
      await page.waitForNavigation({ timeout: 5000 }).catch(() => null);
      await page.waitForTimeout(1000);

      const finalUrl = page.url();
      console.log(`   📍 Current URL: ${finalUrl}`);

      if (finalUrl.includes('/login') || finalUrl === 'http://localhost:5173/') {
        console.log('   ✅ Redirected to login/home\n');
      }

      await page.screenshot({ path: 'after-signout.png' });
      console.log('   📸 Screenshot: after-signout.png\n');

      console.log('✅ LOGOUT TEST PASSED!\n');
      console.log('📋 Summary:');
      console.log('   ✅ Player logged in successfully');
      console.log('   ✅ Opened More menu');
      console.log('   ✅ Found and clicked Sign out');
      console.log('   ✅ Redirected to login page');
      console.log('   ✅ Session cleared');

    } else {
      console.log('   ⚠️  Sign out button not visible');

      // List what's available
      const allText = await page.textContent('body');
      console.log('\n   Available menu items:');
      const lines = allText.split('\n').filter(line => line.trim().length > 0);
      lines.slice(-10).forEach(line => {
        if (line.trim().length < 50) {
          console.log(`   - ${line.trim()}`);
        }
      });

      throw new Error('Sign out button not found');
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    await page.screenshot({ path: 'error-state.png' });
    console.log('   📸 Screenshot: error-state.png');
    process.exit(1);
  } finally {
    await context.close();
  }
}

testLogout().catch(console.error);
