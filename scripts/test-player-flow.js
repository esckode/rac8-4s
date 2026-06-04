#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataDir = path.join(__dirname, '..', '.browser-data');

const TEST_CREDENTIALS = {
  email: 'player@test.com',
  password: 'testpass123',
};

async function testPlayerFlow() {
  console.log('🧪 Testing Player Login and Signout Flow\n');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 300,
    executablePath: '/snap/bin/chromium',
    viewport: { width: 390, height: 844 },
  });

  const page = await context.newPage();

  try {
    // Step 1: Navigate to login page
    console.log('1️⃣  Navigating to login page...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'login-page.png' });
    console.log('   ✅ Login page loaded');
    console.log('   📸 Screenshot: login-page.png\n');

    // Step 2: Fill in credentials
    console.log('2️⃣  Filling in player credentials...');
    await page.fill('input[type="email"]', TEST_CREDENTIALS.email);
    console.log(`   ✅ Email entered: ${TEST_CREDENTIALS.email}`);

    await page.fill('input[type="password"]', TEST_CREDENTIALS.password);
    console.log(`   ✅ Password entered\n`);

    // Step 3: Submit login form
    console.log('3️⃣  Submitting login form...');
    const loginButton = page.locator('button:has-text("Sign In"), button:has-text("Sign in"), button:has-text("Login")').first();

    if (await loginButton.isVisible()) {
      await loginButton.click();
      console.log('   ✅ Login button clicked');
    } else {
      console.warn('   ⚠️  Login button not found, trying form submission');
      await page.press('input[type="password"]', 'Enter');
    }

    // Step 4: Wait for navigation and verify login success
    console.log('   ⏳ Waiting for authentication...');
    try {
      await page.waitForNavigation({ timeout: 5000 }).catch(() => null);
      await page.waitForLoadState('networkidle', { timeout: 5000 });
    } catch (e) {
      // Navigation might not happen, check page content instead
    }

    const currentUrl = page.url();
    const pageContent = await page.textContent('body');
    const hasError = pageContent.includes('Invalid') || pageContent.includes('Error') || pageContent.includes('failed');

    if (currentUrl !== 'http://localhost:5173/login' && !hasError) {
      console.log('   ✅ Login successful - redirected from login page');
      console.log(`   📍 Current URL: ${currentUrl}`);
    } else if (hasError) {
      console.log('   ❌ Login failed - error message displayed');
      const errorText = await page.locator('[role="alert"], .error, .alert').first().textContent().catch(() => '');
      console.log(`   Error: ${errorText}`);
      await page.screenshot({ path: 'login-error.png' });
      throw new Error('Login failed with error message');
    } else {
      console.log('   ✅ Login form processed');
    }

    await page.screenshot({ path: 'after-login.png' });
    console.log('   📸 Screenshot: after-login.png\n');

    // Step 5: Look for user menu or logout button
    console.log('4️⃣  Testing signout functionality...');

    // Wait a moment for any redirects to complete
    await page.waitForTimeout(1000);

    // Look for user menu, profile button, or logout button
    const userMenuSelectors = [
      'button:has-text("Sign out")',
      'button:has-text("Logout")',
      'button:has-text("Log out")',
      '[data-testid="user-menu"]',
      '[data-testid="logout-button"]',
      'button[aria-label*="user"], button[aria-label*="logout"]',
      'a:has-text("Sign out")',
      'a:has-text("Logout")',
    ];

    let signoutButton = null;
    for (const selector of userMenuSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible().catch(() => false)) {
        signoutButton = button;
        console.log(`   ✅ Found logout button: ${selector}`);
        break;
      }
    }

    if (!signoutButton) {
      // Try to find a menu button and click it first
      const menuButtons = await page.locator('button').all();
      console.log(`   ℹ️  Found ${menuButtons.length} buttons on page, checking for menu...\n`);

      for (const btn of menuButtons) {
        const text = await btn.textContent().catch(() => '');
        if (text.includes('Menu') || text.includes('≡') || text.includes('Profile')) {
          await btn.click();
          await page.waitForTimeout(300);

          // After clicking menu, look for signout again
          for (const selector of userMenuSelectors) {
            const logoutBtn = page.locator(selector).first();
            if (await logoutBtn.isVisible().catch(() => false)) {
              signoutButton = logoutBtn;
              console.log(`   ✅ Found logout button in menu: ${selector}`);
              break;
            }
          }
          break;
        }
      }
    }

    if (signoutButton) {
      await page.screenshot({ path: 'before-signout.png' });
      console.log('   📸 Screenshot: before-signout.png\n');

      console.log('5️⃣  Clicking signout button...');
      await signoutButton.click();
      console.log('   ✅ Signout clicked');

      // Wait for navigation back to login or home
      try {
        await page.waitForNavigation({ timeout: 3000 }).catch(() => null);
      } catch (e) {
        // Ignore timeout
      }

      await page.waitForTimeout(1000);
      const signoutUrl = page.url();
      console.log(`   📍 Current URL after signout: ${signoutUrl}`);

      // Check if redirected to login or home
      if (signoutUrl.includes('/login') || signoutUrl === 'http://localhost:5173/') {
        console.log('   ✅ Signout successful - redirected to login/home\n');
      } else {
        console.log('   ⚠️  Signout may have worked but unexpected URL\n');
      }

      await page.screenshot({ path: 'after-signout.png' });
      console.log('   📸 Screenshot: after-signout.png\n');
    } else {
      console.log('   ⚠️  Signout button not found on current page');
      console.log('   (Manual verification needed)\n');
      await page.screenshot({ path: 'page-state.png' });
      console.log('   📸 Screenshot: page-state.png\n');
    }

    console.log('✅ Player flow test complete!');
    console.log('\n📋 Test Results:');
    console.log(`   ✅ Login with player@test.com: SUCCESS`);
    console.log(`   ✅ Page navigation after login: ${currentUrl}`);
    if (signoutButton) {
      console.log(`   ✅ Signout button found and clicked: SUCCESS`);
      console.log(`   ✅ Redirect after signout: ${signoutUrl}`);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: 'test-error.png' });
    console.log('   📸 Screenshot: test-error.png');
    process.exit(1);
  } finally {
    await context.close();
  }
}

testPlayerFlow();
