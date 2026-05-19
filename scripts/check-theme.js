#!/usr/bin/env node
import { chromium } from 'playwright';

async function checkTheme() {
  const context = await chromium.launchPersistentContext('/tmp/playwright-state', {
    headless: true,
    executablePath: '/snap/bin/chromium',
  });

  const page = await context.newPage();
  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });

  // Get computed styles from the root element
  const bodyStyles = await page.evaluate(() => {
    const root = document.documentElement;
    const styles = getComputedStyle(root);

    const colors = {
      courtBlue: styles.getPropertyValue('--court-400').trim(),
      lavender: styles.getPropertyValue('--lavender-400').trim(),
      mint: styles.getPropertyValue('--mint-400').trim(),
      inkDark: styles.getPropertyValue('--ink-900').trim(),
      surfaceColor: styles.getPropertyValue('--surface').trim(),
      bgApp: styles.getPropertyValue('--bg-app').trim(),
      fontDisplay: styles.getPropertyValue('--font-display').trim(),
      fontUI: styles.getPropertyValue('--font-ui').trim(),
    };

    // Get body background from computed styles
    const bodyEl = document.body;
    const bodyComputedStyle = getComputedStyle(bodyEl);

    return {
      tokenColors: colors,
      bodyBg: bodyComputedStyle.backgroundColor,
      bodyBgImage: bodyComputedStyle.backgroundImage,
      fontFamily: bodyComputedStyle.fontFamily,
    };
  });

  console.log('=== DESIGN TOKENS ===');
  console.log('Court Blue (--court-400):', bodyStyles.tokenColors.courtBlue);
  console.log('Lavender (--lavender-400):', bodyStyles.tokenColors.lavender);
  console.log('Mint (--mint-400):', bodyStyles.tokenColors.mint);
  console.log('Ink Dark (--ink-900):', bodyStyles.tokenColors.inkDark);
  console.log('Surface:', bodyStyles.tokenColors.surfaceColor);
  console.log('Background Gradient:', bodyStyles.tokenColors.bgApp);
  console.log('Font Display:', bodyStyles.tokenColors.fontDisplay);
  console.log('Font UI:', bodyStyles.tokenColors.fontUI);

  console.log('\n=== BODY COMPUTED STYLES ===');
  console.log('Body Background Color:', bodyStyles.bodyBg);
  console.log('Body Background Image:', bodyStyles.bodyBgImage);
  console.log('Font Family:', bodyStyles.fontFamily);

  await context.close();
}

checkTheme().catch(console.error);
