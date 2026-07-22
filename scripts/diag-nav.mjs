#!/usr/bin/env node
// Diagnostic: what does a GUEST see on /browse? Reports nav presence + computed CSS.
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, executablePath: '/snap/bin/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();

await page.goto('http://localhost:5173/browse', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(800);

const info = await page.evaluate(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return { exists: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      exists: true,
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
      position: cs.position, bottom: cs.bottom, zIndex: cs.zIndex,
      rect: { top: Math.round(r.top), height: Math.round(r.height), width: Math.round(r.width) },
      text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 120),
    };
  };
  return {
    innerWidth: window.innerWidth, innerHeight: window.innerHeight,
    url: location.href,
    localStorageKeys: Object.keys(localStorage),
    hasToken: !!(localStorage.getItem('token') || localStorage.getItem('accessToken') || localStorage.getItem('auth')),
    bottomNav: pick('.responsive-bottom-nav'),
    topNav: pick('.responsive-top-nav'),
    header: pick('.responsive-header'),
    navBrowseTab: pick('[data-testid="nav-browse"]'),
    anyNavEl: document.querySelectorAll('nav').length,
  };
});

console.log(JSON.stringify(info, null, 2));
await page.screenshot({ path: '/tmp/browse-guest.png', fullPage: false });
console.log('screenshot: /tmp/browse-guest.png');
await browser.close();
