import { chromium } from 'playwright';
import { writeFile } from 'fs/promises';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();

  // Hard reload to bypass cache
  await page.goto('http://localhost:8080/test-font-direct.html', { waitUntil: 'networkidle' });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  const screenshot = await page.screenshot({ fullPage: true });
  await writeFile('/home/john/editor/font-verification.png', screenshot);

  const fontStatus = await page.locator('#font-status').textContent();
  console.log('Font status:', fontStatus);

  // Check if glyphs render
  const sharp1 = await page.locator('#sharp1').textContent();
  const sharp2 = await page.locator('#sharp2').textContent();

  console.log('Sharp 1 codepoint:', sharp1.charCodeAt(0).toString(16));
  console.log('Sharp 2 codepoint:', sharp2.charCodeAt(0).toString(16));
  console.log('Expected: e019 for Sharp 1, e037 for Sharp 2');

  await browser.close();
  console.log('Screenshot saved to font-verification.png');
})();
