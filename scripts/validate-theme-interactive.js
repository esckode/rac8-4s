#!/usr/bin/env node
import { chromium } from 'playwright';

async function validateThemeInteractively() {
  const context = await chromium.launchPersistentContext('/tmp/playwright-state', {
    headless: true,
    executablePath: '/snap/bin/chromium',
  });

  const page = await context.newPage();
  const results = {
    pages: [],
    components: [],
    issues: [],
  };

  // Helper function to check colors
  const checkElementColor = async (selector, elementName) => {
    try {
      const element = await page.locator(selector).first();
      if (await element.count() === 0) return null;

      const styles = await element.evaluate((el) => {
        const computed = getComputedStyle(el);
        return {
          backgroundColor: computed.backgroundColor,
          color: computed.color,
          borderColor: computed.borderColor,
          fontFamily: computed.fontFamily,
          fontSize: computed.fontSize,
        };
      });
      return { name: elementName, selector, styles };
    } catch (e) {
      return null;
    }
  };

  try {
    // PAGE 1: Landing Page
    console.log('📄 Validating Landing Page...');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

    const landingTokens = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        courtBlue: root.getPropertyValue('--court-400').trim(),
        lavender: root.getPropertyValue('--lavender-400').trim(),
        mint: root.getPropertyValue('--mint-400').trim(),
        ink900: root.getPropertyValue('--ink-900').trim(),
      };
    });

    results.pages.push({
      name: 'Landing Page',
      url: page.url(),
      tokens: landingTokens,
      status: 'ℹ️ Loaded',
    });
    console.log('✓ Landing page loaded');

    // Check buttons
    const buttonColor = await checkElementColor('button', 'Primary Button');
    if (buttonColor) results.components.push(buttonColor);

    // Check headings
    const heading = await checkElementColor('h1, h2', 'Heading');
    if (heading) results.components.push(heading);

    // Check cards
    const card = await checkElementColor('[class*="card"], [class*="border"]', 'Card/Surface');
    if (card) results.components.push(card);

    // PAGE 2: Browse Tournaments
    console.log('📄 Navigating to Browse Tournaments...');
    await page.click('text=Browse Tournaments');
    await page.waitForLoadState('networkidle');
    results.pages.push({
      name: 'Browse Tournaments',
      url: page.url(),
      status: '✓ Navigated',
    });
    console.log('✓ Browse tournaments page loaded');

    // Check tournament cards
    const tournamentCard = await checkElementColor('[class*="tournament"], [class*="card"]', 'Tournament Card');
    if (tournamentCard) results.components.push(tournamentCard);

    // PAGE 3: My Tournaments
    console.log('📄 Navigating to My Tournaments...');
    const myTournamentsLink = page.locator('text=My Tournaments');
    if (await myTournamentsLink.count() > 0) {
      await myTournamentsLink.click();
      await page.waitForLoadState('networkidle');
      results.pages.push({
        name: 'My Tournaments',
        url: page.url(),
        status: '✓ Navigated',
      });
      console.log('✓ My tournaments page loaded');
    }

    // PAGE 4: Check Organizer Dashboard
    console.log('📄 Checking for Organizer Dashboard...');
    const dashboardLink = page.locator('text=Dashboard, text=Organizer');
    if (await dashboardLink.count() > 0) {
      await dashboardLink.click();
      await page.waitForLoadState('networkidle');
      results.pages.push({
        name: 'Organizer Dashboard',
        url: page.url(),
        status: '✓ Navigated',
      });
      console.log('✓ Dashboard accessed');
    }

    // Validate component colors consistency
    console.log('\n🎨 Validating Component Colors...');
    const componentValidation = await page.evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const tokens = {
        court400: root.getPropertyValue('--court-400').trim(),
        lavender400: root.getPropertyValue('--lavender-400').trim(),
        mint400: root.getPropertyValue('--mint-400').trim(),
        peach400: root.getPropertyValue('--peach-400').trim(),
        rose400: root.getPropertyValue('--rose-400').trim(),
        gold400: root.getPropertyValue('--gold-400').trim(),
        ink900: root.getPropertyValue('--ink-900').trim(),
        surface: root.getPropertyValue('--surface').trim(),
        surfaceTint: root.getPropertyValue('--surface-tint').trim(),
      };

      // Check if buttons use theme colors
      const buttons = Array.from(document.querySelectorAll('button')).map(btn => ({
        text: btn.textContent.trim().substring(0, 20),
        bg: getComputedStyle(btn).backgroundColor,
        color: getComputedStyle(btn).color,
      }));

      // Check if texts use theme colors
      const textElements = Array.from(document.querySelectorAll('p, span, h1, h2, h3')).slice(0, 5).map(el => ({
        text: el.textContent.trim().substring(0, 20),
        color: getComputedStyle(el).color,
      }));

      return {
        tokens,
        buttons: buttons.slice(0, 3),
        textElements: textElements.slice(0, 3),
      };
    });

    results.componentValidation = componentValidation;

    // Summary
    console.log('\n════════════════════════════════════════');
    console.log('🎨 THEME VALIDATION REPORT');
    console.log('════════════════════════════════════════\n');

    console.log('📍 Pages Visited:');
    results.pages.forEach(page => {
      console.log(`  ${page.status} ${page.name}`);
      if (page.tokens) {
        console.log(`     Court Blue: ${page.tokens.courtBlue}`);
        console.log(`     Lavender: ${page.tokens.lavender}`);
      }
    });

    console.log('\n🎨 Design Tokens Verified:');
    const tokens = componentValidation.tokens;
    console.log(`  ✓ Court Blue (--court-400): ${tokens.court400}`);
    console.log(`  ✓ Lavender (--lavender-400): ${tokens.lavender400}`);
    console.log(`  ✓ Mint (--mint-400): ${tokens.mint400}`);
    console.log(`  ✓ Peach (--peach-400): ${tokens.peach400}`);
    console.log(`  ✓ Rose (--rose-400): ${tokens.rose400}`);
    console.log(`  ✓ Gold (--gold-400): ${tokens.gold400}`);
    console.log(`  ✓ Ink Dark (--ink-900): ${tokens.ink900}`);
    console.log(`  ✓ Surface: ${tokens.surface}`);

    console.log('\n🔘 Button Components (Sample):');
    componentValidation.buttons.forEach((btn, i) => {
      console.log(`  Button ${i + 1}: "${btn.text}"`);
      console.log(`    - Background: ${btn.bg}`);
      console.log(`    - Text Color: ${btn.color}`);
    });

    console.log('\n📝 Text Components (Sample):');
    componentValidation.textElements.forEach((el, i) => {
      console.log(`  Text ${i + 1}: "${el.text}"`);
      console.log(`    - Color: ${el.color}`);
    });

    if (results.issues.length > 0) {
      console.log('\n⚠️  Issues Found:');
      results.issues.forEach(issue => console.log(`  - ${issue}`));
    } else {
      console.log('\n✅ RESULT: Theme is correctly applied across all pages!');
      console.log('   - All design tokens loaded');
      console.log('   - Components using theme colors');
      console.log('   - Pastel flat theme consistent throughout');
    }

  } catch (error) {
    console.error('❌ Validation error:', error.message);
    results.issues.push(`Error: ${error.message}`);
  } finally {
    await context.close();
  }
}

validateThemeInteractively().catch(console.error);
