#!/usr/bin/env node
import { chromium, devices } from 'playwright';

async function validateMobileDesignSpec() {
  console.log('📱 MOBILE LANDING PAGE - DESIGN SPEC VALIDATION\n');
  console.log('Expected design (from section-mobile.jsx):');
  console.log('  - Dark gradient background: #1F2D4E → #0F1B2E');
  console.log('  - White text on dark background');
  console.log('  - Heading: "See you at the court."');
  console.log('  - Subtitle: light white text');
  console.log('  - Primary button: "Continue with email"');
  console.log('  - Secondary button: "Browse tournaments"\n');

  const context = await chromium.launchPersistentContext('/tmp/playwright-state', {
    headless: false,
    slowMo: 1000,
    executablePath: '/snap/bin/chromium',
    ...devices['iPhone 12'],
  });

  const page = await context.newPage();

  try {
    console.log('🔍 Analyzing current mobile landing page...\n');
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const currentDesign = await page.evaluate(() => {
      const html = document.documentElement;
      const body = document.body;
      const htmlStyle = getComputedStyle(html);
      const bodyStyle = getComputedStyle(body);

      // Check heading
      const heading = document.querySelector('h2') || document.querySelector('h1');
      const headingText = heading?.textContent;
      const headingColor = heading ? getComputedStyle(heading).color : 'N/A';

      // Check body/page background
      const bodyBg = bodyStyle.backgroundColor;
      const bodyBgImage = bodyStyle.backgroundImage;
      const htmlBg = htmlStyle.backgroundColor;
      const htmlBgImage = htmlStyle.backgroundImage;

      // Check buttons
      const buttons = Array.from(document.querySelectorAll('button')).map((btn, i) => ({
        text: btn.textContent.trim().substring(0, 40),
        bg: getComputedStyle(btn).backgroundColor,
        color: getComputedStyle(btn).color,
      }));

      // Check text color
      const bodyTextColor = bodyStyle.color;

      // Check for SVG decorative elements
      const svgs = document.querySelectorAll('svg').length;

      return {
        heading: headingText?.substring(0, 50),
        headingColor,
        bodyBg,
        bodyBgImage,
        htmlBg,
        htmlBgImage,
        bodyTextColor,
        buttons: buttons.slice(0, 3),
        svgCount: svgs,
        viewport: window.innerWidth + 'x' + window.innerHeight,
      };
    });

    console.log('📊 CURRENT IMPLEMENTATION ANALYSIS:\n');
    console.log(`Viewport: ${currentDesign.viewport}`);
    console.log(`Heading: "${currentDesign.heading}"`);
    console.log(`Heading Color: ${currentDesign.headingColor}`);
    console.log(`Body Background Color: ${currentDesign.bodyBg}`);
    console.log(`Body Background Image: ${currentDesign.bodyBgImage?.substring(0, 80) || 'none'}...`);
    console.log(`HTML Background Color: ${currentDesign.htmlBg}`);
    console.log(`Body Text Color: ${currentDesign.bodyTextColor}`);
    console.log(`SVG elements: ${currentDesign.svgCount}`);
    console.log(`\nButtons found:`);
    currentDesign.buttons.forEach((btn, i) => {
      console.log(`  ${i + 1}. "${btn.text}"`);
      console.log(`     Background: ${btn.bg}`);
      console.log(`     Color: ${btn.color}`);
    });

    console.log('\n════════════════════════════════════════');
    console.log('⚠️  DESIGN MISMATCH DETECTED');
    console.log('════════════════════════════════════════\n');

    console.log('EXPECTED (from section-mobile.jsx):');
    console.log('  ✓ Background: Dark gradient (#1F2D4E → #0F1B2E)');
    console.log('  ✓ Status bar: transparent');
    console.log('  ✓ Heading: "See you at the court." (white text)');
    console.log('  ✓ Subtitle: "Find drop-in nights..." (light white text)');
    console.log('  ✓ Decorative SVG circles (Court Blue, Lavender)');
    console.log('  ✓ Primary button: "Continue with email"');
    console.log('  ✓ Secondary button: "Browse tournaments"');
    console.log('  ✓ Text color: White / light text on dark');

    console.log('\nCURRENT IMPLEMENTATION:');
    console.log(`  ✗ Background: ${currentDesign.bodyBg || currentDesign.bodyBgImage.substring(0, 50)}`);
    console.log(`  ✗ Heading: "${currentDesign.heading}"`);
    console.log(`  ✗ Heading Color: ${currentDesign.headingColor} (expected: white or light)`);
    console.log(`  ✗ Text Color: ${currentDesign.bodyTextColor}`);
    console.log(`  ✗ Button styling may not match spec`);
    console.log(`  ✗ SVG decorations: ${currentDesign.svgCount} found (expected: background decoration circles)`);

    console.log('\n📋 ISSUES FOUND:\n');
    console.log('1. Landing page uses LIGHT theme, not DARK theme');
    console.log('2. Background should be dark gradient (#1F2D4E → #0F1B2E)');
    console.log('3. Heading should be "See you at the court." not "Tournament Management Made Simple"');
    console.log('4. Text should be WHITE on dark, not dark on light');
    console.log('5. Missing decorative SVG circles (Court Blue, Lavender)');
    console.log('6. Button text and styling may not match design spec');

    console.log('\n════════════════════════════════════════');
    console.log('❌ MOBILE LANDING PAGE DOES NOT MATCH DESIGN SPEC');
    console.log('════════════════════════════════════════\n');
    console.log('The current mobile landing page uses the light pastel theme (light-mode)');
    console.log('But the design spec in section-mobile.jsx shows a DARK theme landing page.');
    console.log('\nNeeds implementation of:\n');
    console.log('  • Dark gradient background');
    console.log('  • Light/white text');
    console.log('  • Auth-specific content ("See you at the court.")');
    console.log('  • Decorative SVG elements');
    console.log('  • Auth buttons (email, browse)');

    // Keep browser open for inspection
    console.log('\nBrowser will stay open for 15 seconds for inspection...\n');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('❌ Validation error:', error.message);
  } finally {
    await context.close();
  }
}

validateMobileDesignSpec().catch(console.error);
