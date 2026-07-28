#!/usr/bin/env node
// Headless route inspector: navigate → dump the layout width chain (+ optional
// selectors) → screenshot. Generalised from the one-off scripts/diag-nav.mjs.
//
//   node scripts/inspect-route.mjs /login /                 # compare two routes
//   node scripts/inspect-route.mjs /login --width=400 --sel=[data-testid=back-button]
//   node scripts/inspect-route.mjs /browse --shot=/tmp/browse.png
//
// The "width chain" walks body → widest child → … so a route with unexpected side
// gutters shows exactly which element introduces them.
import { chromium } from 'playwright';

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const routes = args.filter((a) => !a.startsWith('--'));
if (routes.length === 0) routes.push('/');

const base = flag('base', 'http://localhost:5173');
const width = Number(flag('width', 400));
const height = Number(flag('height', 760));
const depth = Number(flag('depth', 8));
const selectors = flag('sel', '').split(',').filter(Boolean);
const shot = flag('shot', '');

const browser = await chromium.launch({ headless: true, executablePath: '/snap/bin/chromium' });
const ctx = await browser.newContext({ viewport: { width, height } });
const page = await ctx.newPage();

for (const route of routes) {
  const url = route.startsWith('http') ? route : base + route;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(600);

  const info = await page.evaluate(
    ({ depth, selectors }) => {
      const describe = (el) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || undefined,
          cls: (typeof el.className === 'string' ? el.className : '').trim().slice(0, 60) || undefined,
          testid: el.getAttribute('data-testid') || undefined,
          x: Math.round(r.left),
          width: Math.round(r.width),
          height: Math.round(r.height),
          maxWidth: cs.maxWidth,
          margin: `${cs.marginTop} ${cs.marginRight} ${cs.marginBottom} ${cs.marginLeft}`,
          padding: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
          background: cs.backgroundColor,
          backgroundImage: cs.backgroundImage === 'none' ? undefined : cs.backgroundImage.slice(0, 80),
          position: cs.position,
          display: cs.display,
        };
      };

      // Walk down, following the widest element child at each level.
      const chain = [];
      let el = document.body;
      for (let i = 0; i < depth && el; i++) {
        chain.push(describe(el));
        const kids = [...el.children].filter((k) => k.getBoundingClientRect().width > 0);
        if (kids.length === 0) break;
        el = kids.reduce((a, b) =>
          b.getBoundingClientRect().width > a.getBoundingClientRect().width ? b : a
        );
      }

      const picked = {};
      for (const sel of selectors) {
        const found = document.querySelector(sel);
        picked[sel] = found ? describe(found) : { exists: false };
      }

      return {
        url: location.href,
        innerWidth: window.innerWidth,
        docWidth: document.documentElement.getBoundingClientRect().width,
        scrollWidth: document.documentElement.scrollWidth,
        htmlBackground: getComputedStyle(document.documentElement).backgroundColor,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        chain,
        ...(selectors.length ? { selectors: picked } : {}),
      };
    },
    { depth, selectors }
  );

  console.log(JSON.stringify(info, null, 2));

  if (shot || routes.length > 1) {
    const path = shot || `/tmp/inspect${route.replace(/\W+/g, '-') || '-root'}.png`;
    await page.screenshot({ path });
    console.log(`screenshot: ${path}`);
  }
}

await browser.close();
