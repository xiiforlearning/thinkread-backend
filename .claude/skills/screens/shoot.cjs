/* Screenshots of every Mini App screen, light and dark, 390×844. See SKILL.md. */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const BASE = process.env.SCREENS_BASE || 'http://127.0.0.1:4173/';
const OUT = path.resolve(__dirname, '../../../frontend/.screens');
const ROUTES = [
  ['main', '#/'],
  ['cards', '#/cards'],
  ['dict', '#/words'],
  ['add', '#/words/add'],
  ['teacher', '#/words/teacher'],
  ['reports', '#/reports'],
  ['submit', '#/reports/new'],
  ['method', '#/reports/method'],
  ['profile', '#/profile'],
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
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme, locale: 'ru-RU' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${scheme}: ${e.message}`));
    for (const [name, hash] of ROUTES) {
      await page.goto(BASE + hash, { waitUntil: 'networkidle' });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `${name}-${scheme}.png`) });
    }
    if (scheme === 'light') {
      for (const [name, q] of [['onboarding', '?demo=pending'], ['noaccess', '?demo=not_member']]) {
        await page.goto(`${BASE}${q}#/`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(OUT, `${name}-light.png`) });
      }
      await page.goto(BASE + '#/words', { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      await page.locator('a.tr-cell').first().click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(OUT, 'word-light.png') });
    }
    await ctx.close();
  }
  await browser.close();
  console.log(`screenshots in ${OUT}`);
  console.log(errors.length ? `PAGE ERRORS:\n${errors.join('\n')}` : 'no page errors');
  process.exit(errors.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
