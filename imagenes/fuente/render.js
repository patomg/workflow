const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
  for (const name of ['precios', 'horario']) {
    await page.goto('file://' + __dirname + '/' + name + '.html', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: __dirname + '/../' + name + '.png' });
  }
  await browser.close();
})();
