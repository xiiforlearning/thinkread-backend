/* Screenshots of every dashboard screen (demo data), light and dark, 1280×800. See SKILL.md. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const BASE = process.env.SCREENS_BASE || 'http://127.0.0.1:4173/';
const OUT = path.resolve(__dirname, '../../../frontend/.screens');
const ROUTES = [
  ['admin-overview', '#/'],
  ['admin-students', '#/students'],
  ['admin-flags', '#/flags'],
  ['admin-groups', '#/groups'],
  ['admin-settings', '#/settings'],
];

function chromePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const dirs = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => d.startsWith('chromium-')) : [];
  for (const d of dirs) {
    const p = path.join(root, d, 'chrome-linux', 'chrome');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: chromePath(), args: ['--no-sandbox'] });
  const errors = [];
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, colorScheme: scheme, locale: 'ru-RU' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${scheme}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`${scheme} console: ${m.text()}`); });
    await page.goto(`${BASE}admin.html?demo=0#/`, { waitUntil: 'networkidle' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(`${BASE}admin.html?demo=0#/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `admin-login-${scheme}.png`) });
    for (const [name, hash] of ROUTES) {
      await page.goto(`${BASE}admin.html?demo=1${hash}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(OUT, `${name}-${scheme}.png`), fullPage: scheme === 'light' });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`screenshots in ${OUT}`);
  console.log(errors.length ? `PAGE ERRORS:\n${errors.join('\n')}` : 'no page errors');
  process.exit(errors.length ? 1 : 0);
})();
